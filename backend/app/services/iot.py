"""Query layer for the IoT-compatible API.

All SQL lives here. Functions take an AsyncSession and return API schema objects,
so they can be reused outside HTTP routes (e.g. by the Phase 3 chat agent's tools).
"""

import re
from collections.abc import Collection
from datetime import UTC, datetime, timedelta

from sqlalchemy import Row, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.errors import DeviceNotFound, InvalidInterval, InvalidTimeRange, SensorNotFound
from app.models import Device, Reading, Sensor
from app.schemas import Attributes, IoTDevice, IoTRawPoint, IoTRollupPoint, IoTSensor

# One raw query may span at most one month. This mirrors the original API and is
# why the frontend proxy splits long raw ranges by UTC month.
MAX_RAW_SPAN = timedelta(days=31)

# Rollups return few points per bucket, so they can cover a much longer range.
MAX_ROLLUP_SPAN = timedelta(days=366)
# Same options as the frontend's interval picker (components/filters/rollup-controls.tsx).
# All divide 24h, so buckets line up with UTC midnight.
ALLOWED_ROLLUP_HOURS = (1, 2, 3, 4, 6, 8, 12, 24)


LatestRow = Row[tuple[int, datetime, float | None, str | None]]


async def _latest_readings(
    session: AsyncSession, sensor_ids: Collection[int] | None = None
) -> dict[int, LatestRow]:
    """Most recent reading per sensor, keyed by sensor_id (all sensors if None).

    DISTINCT ON keeps the first row of each sensor_id group under the ORDER BY.
    Ordering is `sensor_id DESC, ts DESC` on purpose: it matches a backward scan
    of the (sensor_id, ts) primary-key index, which lets TimescaleDB use SkipScan
    (jump to each sensor's newest row instead of reading every row and sorting).
    `sensor_id ASC, ts DESC` mixes directions, so no index order fits it and
    Postgres falls back to scanning + sorting the whole table.
    """
    if sensor_ids is not None and not sensor_ids:
        return {}
    stmt = (
        select(Reading.sensor_id, Reading.ts, Reading.value, Reading.quality)
        .distinct(Reading.sensor_id)
        .order_by(Reading.sensor_id.desc(), Reading.ts.desc())
    )
    if sensor_ids is not None:
        stmt = stmt.where(Reading.sensor_id.in_(sensor_ids))
    result = await session.execute(stmt)
    return {row.sensor_id: row for row in result}


def _sensor_to_schema(
    sensor: Sensor, latest: LatestRow | None, queried_at: datetime
) -> IoTSensor:
    return IoTSensor(
        name=sensor.name,
        attributes=Attributes.of(description=sensor.description),
        latest_value=latest.value if latest else None,
        latest_timestamp=latest.ts if latest else None,
        latest_quality=latest.quality if latest else None,
        # When this snapshot was taken; set even if the sensor has no readings.
        latest_query_timestamp=queried_at,
    )


def _device_to_schema(
    device: Device, latest: dict[int, LatestRow], queried_at: datetime
) -> IoTDevice:
    return IoTDevice(
        name=device.name,
        attributes=Attributes.of(
            display_name=device.display_name, description=device.description
        ),
        sensors=[
            _sensor_to_schema(s, latest.get(s.id), queried_at) for s in device.sensors
        ],
    )


async def list_devices(session: AsyncSession) -> list[IoTDevice]:
    """All devices with their sensors and each sensor's latest reading.

    The frontend's Latest Data page only calls this endpoint and flattens
    devices[].sensors[], so the full nested shape is required here.
    Three queries total, regardless of how many devices/sensors exist:
    devices, their sensors (selectinload), and latest readings (DISTINCT ON).
    """
    queried_at = datetime.now(UTC)
    # selectinload: load all devices' sensors in one extra SELECT ... WHERE
    # device_id IN (...). Required anyway: Device.sensors is lazy="raise".
    devices = await session.scalars(
        select(Device).options(selectinload(Device.sensors)).order_by(Device.name)
    )
    devices = list(devices)
    latest = await _latest_readings(session)
    return [_device_to_schema(d, latest, queried_at) for d in devices]


async def list_device_sensors(
    session: AsyncSession, device_name: str
) -> list[IoTSensor]:
    """Sensors of one device, ordered by name.

    Two queries on purpose: a JOIN returning [] couldn't tell "unknown device"
    (-> DeviceNotFound / 404) apart from "device with no sensors" (-> []).
    """
    # Look up the device first. scalar() -> one object or None.
    device = await session.scalar(select(Device).where(Device.name == device_name))
    if device is None:
        raise DeviceNotFound(device_name)

    # Then its sensors. scalars() -> iterable of all rows.
    sensors = list(
        await session.scalars(
            select(Sensor).where(Sensor.device_id == device.id).order_by(Sensor.name)
        )
    )
    queried_at = datetime.now(UTC)
    latest = await _latest_readings(session, [s.id for s in sensors])
    return [_sensor_to_schema(s, latest.get(s.id), queried_at) for s in sensors]


async def _get_sensor(
    session: AsyncSession, device_name: str, sensor_name: str
) -> Sensor:
    """The sensor named `sensor_name` that belongs to device `device_name`.

    Matching on both prevents /devices/A/sensors/<sensor of B>/data from returning
    data. An unknown device and an unknown sensor both raise SensorNotFound, which
    the API maps to the original API's 404 {"errorCode": "TableNotFound"}.
    """
    sensor = await session.scalar(
        select(Sensor)
        .join(Sensor.device)
        .where(Device.name == device_name, Sensor.name == sensor_name)
    )
    if sensor is None:
        raise SensorNotFound(f"{device_name}/{sensor_name}")
    return sensor


def _validate_range(start: datetime, end: datetime, max_span: timedelta) -> None:
    if start.tzinfo is None or end.tzinfo is None:
        raise InvalidTimeRange(
            "startDate and endDate must include a time zone (e.g. a trailing 'Z')"
        )
    if start >= end:
        raise InvalidTimeRange("startDate must be earlier than endDate")
    if end - start > max_span:
        raise InvalidTimeRange(f"Time range may not exceed {max_span.days} days")


async def get_raw_points(
    session: AsyncSession,
    device_name: str,
    sensor_name: str,
    start: datetime,
    end: datetime,
) -> list[IoTRawPoint]:
    """Raw readings with start <= ts <= end (both inclusive), oldest first."""
    _validate_range(start, end, MAX_RAW_SPAN)
    sensor = await _get_sensor(session, device_name, sensor_name)

    # Several columns per row -> execute() (scalars() would keep only the first column).
    # Selecting just these columns skips building ORM objects for many rows.
    # The WHERE clause is served by the (sensor_id, ts) primary-key index.
    result = await session.execute(
        select(Reading.ts, Reading.value, Reading.quality)
        .where(
            Reading.sensor_id == sensor.id,
            Reading.ts >= start,
            Reading.ts <= end,
        )
        .order_by(Reading.ts)
    )
    return [
        IoTRawPoint(value=row.value, quality=row.quality, timestamp=row.ts)
        for row in result
    ]


def _parse_interval(interval: str) -> timedelta:
    """'6h' -> timedelta(hours=6). Whitelisted: only known values ever reach SQL."""
    match = re.fullmatch(r"(\d+)h", interval.strip())
    if match is None or int(match.group(1)) not in ALLOWED_ROLLUP_HOURS:
        allowed = ", ".join(f"{h}h" for h in ALLOWED_ROLLUP_HOURS)
        raise InvalidInterval(f"Unsupported interval '{interval}'. Allowed: {allowed}")
    return timedelta(hours=int(match.group(1)))


def _floor_to_step(dt: datetime, step: timedelta) -> datetime:
    """Round down to the bucket boundary time_bucket() would use.

    Valid because every allowed step divides 24h, so the Unix epoch and
    TimescaleDB's bucket origin fall on the same boundaries.
    """
    seconds = int(step.total_seconds())
    return datetime.fromtimestamp(int(dt.timestamp()) // seconds * seconds, tz=UTC)


async def get_rollup_points(
    session: AsyncSession,
    device_name: str,
    sensor_name: str,
    interval: str,
    start: datetime,
    end: datetime,
    strict: bool = True,
) -> list[IoTRollupPoint]:
    """min/max/avg/sum/count of readings per time bucket, oldest bucket first.

    Buckets align to fixed UTC boundaries (6h -> 00/06/12/18), not to `start`.
    strict=True filters readings to [start, end], so edge buckets may be partial;
    strict=False widens start down to its bucket boundary so the first bucket is
    complete. Buckets without any readings are omitted (no gap-filling).
    """
    step = _parse_interval(interval)
    _validate_range(start, end, MAX_ROLLUP_SPAN)
    sensor = await _get_sensor(session, device_name, sensor_name)
    if not strict:
        start = _floor_to_step(start, step)

    # time_bucket(interval, ts): step is a timedelta bound as a parameter ($1),
    # never formatted into the SQL string. Reuse this one `bucket` object in
    # SELECT / GROUP BY / ORDER BY: two separate time_bucket() calls would get
    # different bind params and Postgres would reject the GROUP BY.
    bucket = func.time_bucket(step, Reading.ts).label("bucket")
    result = await session.execute(
        select(
            bucket,
            func.min(Reading.value).label("min_value"),
            func.max(Reading.value).label("max_value"),
            func.avg(Reading.value).label("avg_value"),
            func.sum(Reading.value).label("sum_value"),
            # Not labelled "count": Row is a tuple, so row.count would be
            # tuple.count() (a method), not this column. count(value) skips nulls.
            func.count(Reading.value).label("n"),
        )
        .where(
            Reading.sensor_id == sensor.id,
            Reading.ts >= start,
            Reading.ts <= end,
        )
        .group_by(bucket)
        .order_by(bucket)
    )
    return [
        IoTRollupPoint(
            start_time=row.bucket,
            end_time=row.bucket + step,
            min=row.min_value,
            max=row.max_value,
            avg=row.avg_value,
            sum=row.sum_value,
            count=row.n,
        )
        for row in result
    ]
