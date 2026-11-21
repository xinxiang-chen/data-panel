"""Seed the database with a small demo catalog and 7 days of synthetic readings.

Run from backend/:
    uv run python -m scripts.seed

Dev-only: it TRUNCATEs all tables first, so re-running always gives the same result.
Values are a simple daily sine wave + noise; realistic physics comes in Phase 2.
"""

import asyncio
import math
import random
from datetime import UTC, datetime, timedelta

from sqlalchemy import insert, text

from app.db import SessionLocal, engine
from app.models import Device, Reading, Sensor

INTERVAL = timedelta(minutes=10)
DAYS = 7
POINTS_PER_SENSOR = DAYS * 24 * 60 // 10  # 1008
GOOD = "QUALITY_GOOD+OK+LIMIT_OK"
BAD = "QUALITY_BAD"
OFFLINE_RATE = 0.01  # ~1% of points are null, to exercise the frontend's N/A styling
SEED = 42

# Fictional building "Demo Hall" (DH_*). Each sensor: (suffix, description, unit, base, amplitude, noise)
CATALOG = [
    {
        "name": "DH_AHU1",
        "display_name": "Air Handling Unit 1",
        "description": "Rooftop AHU serving floors 1-2",
        "kind": "ahu",
        "sensors": [
            ("SaTemp", "Supply Air Temperature, Analog Input, °F", "°F", 58, 3, 0.3),
            ("SaRh", "Supply Air Humidity, Analog Input, %RH", "%RH", 50, 8, 1.0),
            ("FanSpeed", "Supply Fan Speed, Analog Output, %", "%", 70, 20, 2.0),
            ("SaPressure",
                "Supply Duct Static Pressure, Analog Input, inWC",
                "inWC",
                1.5,
                0.3,
                0.05,
            ),
        ],
    },
    {
        "name": "DH_VAV101",
        "display_name": "VAV Box 101",
        "description": "Variable air volume box, room 101",
        "kind": "vav",
        "sensors": [
            ("RoomTemp", "Room Temperature, Analog Input, °F", "°F", 71, 2, 0.2),
            ("Airflow", "Discharge Airflow, Analog Input, CFM", "CFM", 400, 150, 15),
            ("Damper", "Damper Position, Analog Output, %", "%", 50, 30, 3),
            ("Setpoint", "Room Temperature Setpoint, Analog Value, °F", "°F", 72, 0, 0),
        ],
    },
]


def floor_to_interval(dt: datetime, interval: timedelta) -> datetime:
    step = int(interval.total_seconds())
    return datetime.fromtimestamp(int(dt.timestamp()) // step * step, tz=UTC)


def sine_value(ts: datetime, params: dict, rng: random.Random) -> float:
    """Daily cycle: peaks at 12:00 UTC, lowest at 00:00 UTC.

    Uses UTC hours for simplicity; Phase 2 should use the building's local time zone.
    """
    hour = ts.hour + ts.minute / 60
    daily = math.sin(2 * math.pi * (hour - 6) / 24)
    return params["base"] + params["amplitude"] * daily + rng.gauss(0, params["noise"])


def build_readings(sensors: list[Sensor], end: datetime) -> list[dict]:
    rng = random.Random(SEED)
    timestamps = [end - INTERVAL * i for i in range(POINTS_PER_SENSOR - 1, -1, -1)]
    rows: list[dict] = []
    for sensor in sensors:
        for ts in timestamps:
            if rng.random() < OFFLINE_RATE:
                value, quality = None, BAD
            else:
                value, quality = round(sine_value(ts, sensor.params, rng), 3), GOOD
            rows.append(
                {"sensor_id": sensor.id, "ts": ts, "value": value, "quality": quality}
            )
    return rows


async def main() -> None:
    end = floor_to_interval(datetime.now(UTC), INTERVAL)

    async with SessionLocal() as session:
        # 1. Reset (all three tables in one statement so FK constraints allow it).
        await session.execute(
            text("TRUNCATE readings, sensors, devices RESTART IDENTITY")
        )

        # 2. Small catalog -> ORM objects; flush() sends INSERTs so ids are assigned.
        sensors: list[Sensor] = []
        for d in CATALOG:
            device = Device(
                name=d["name"],
                display_name=d["display_name"],
                description=d["description"],
                kind=d["kind"],
            )
            session.add(device)
            for suffix, description, unit, base, amplitude, noise in d["sensors"]:
                sensor = Sensor(
                    device=device,
                    name=f"{d['name']}_{suffix}",
                    description=description,
                    unit=unit,
                    model_type="sine",
                    params={"base": base, "amplitude": amplitude, "noise": noise},
                )
                session.add(sensor)
                sensors.append(sensor)
        await session.flush()

        # 3. Bulk readings -> Core insert with a list of dicts (batched multi-row INSERTs).
        rows = build_readings(sensors, end)
        await session.execute(insert(Reading), rows)

        # 4. Single commit: all-or-nothing.
        await session.commit()

    await engine.dispose()

    nulls = sum(r["value"] is None for r in rows)
    print(
        f"seeded {len(CATALOG)} devices, {len(sensors)} sensors, {len(rows)} readings "
        f"({nulls} offline) from {rows[0]['ts'].isoformat()} to {end.isoformat()}"
    )


if __name__ == "__main__":
    asyncio.run(main())
