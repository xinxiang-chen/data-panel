"""Query layer for the IoT-compatible API.

All SQL lives here. Functions take an AsyncSession and return API schema objects,
so they can be reused outside HTTP routes (e.g. by the Phase 3 chat agent's tools).
"""

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import DeviceNotFound, InvalidTimeRange, SensorNotFound
from app.models import Device, Reading, Sensor
from app.schemas import Attributes, IoTDevice, IoTRawPoint, IoTSensor

# One raw query may span at most one month. This mirrors the original API and is
# why the frontend proxy splits long raw ranges by UTC month.
MAX_RAW_SPAN = timedelta(days=31)


def _device_to_schema(device: Device) -> IoTDevice:
    return IoTDevice(
        name=device.name,
        attributes=Attributes.of(
            display_name=device.display_name, description=device.description
        ),
    )


def _sensor_to_schema(sensor: Sensor) -> IoTSensor:
    # latest_* fields are filled in step 6.7.
    return IoTSensor(
        name=sensor.name,
        attributes=Attributes.of(description=sensor.description),
    )


async def list_devices(session: AsyncSession) -> list[IoTDevice]:
    """All devices, ordered by name.

    First version: name + attributes only. Step 6.7 embeds each device's sensors
    and their latest readings (needed by the frontend's Latest Data page).
    """
    devices = await session.scalars(select(Device).order_by(Device.name))
    return [_device_to_schema(d) for d in devices]


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
    sensors = await session.scalars(
        select(Sensor).where(Sensor.device_id == device.id).order_by(Sensor.name)
    )
    return [_sensor_to_schema(s) for s in sensors]


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
