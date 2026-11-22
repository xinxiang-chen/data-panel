"""Live worker: keeps readings up to date while the API is running.

Every `sim_interval_s` seconds, tick():
  1. finds each sensor's newest stored timestamp (one GROUP BY query),
  2. generates exactly the missing samples (last_ts, now] with the same
     generator the backfill used, so live data continues history seamlessly,
  3. writes them with INSERT ... ON CONFLICT DO NOTHING (idempotent).

After downtime (laptop asleep, free-tier host spun down) the first tick catches
up automatically, capped at `sim_max_catch_up_days`.

Safe with several app processes (e.g. `uvicorn --workers 4`): a Postgres
advisory lock lets only one tick run at a time across all of them; the others
skip. Even without the lock, the primary key + ON CONFLICT would prevent
duplicates; the lock just avoids doing the same work N times.
"""

import asyncio
import logging
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import Reading, Sensor
from app.simulator.catalog import SENSORS_BY_NAME, SensorSpec
from app.simulator.generator import generate_range

# A child of uvicorn's logger, so messages show up in the uvicorn console.
logger = logging.getLogger("uvicorn.error.simulator")

# Arbitrary app-wide id for pg_try_advisory_xact_lock ("SIM" in ASCII).
ADVISORY_LOCK_KEY = 0x53494D

# A sensor with no readings at all starts this far back.
EMPTY_SENSOR_START = timedelta(days=1)


@dataclass
class WorkerStatus:
    """Last tick outcome, reported by /healthz."""

    enabled: bool = False
    interval_s: int = 0
    last_tick_at: datetime | None = None
    last_rows: int = 0
    last_skipped: bool = False  # another process held the lock
    last_error: str | None = None
    ticks: int = 0


status = WorkerStatus()


def rows_to_insert(
    sensors: Sequence[tuple[int, SensorSpec]],
    last_ts: dict[int, datetime],
    now: datetime,
    max_catch_up: timedelta,
) -> list[dict[str, Any]]:
    """Pure planning step (no DB): the readings each sensor is missing.

    `sensors` are (db id, catalog spec) pairs; `last_ts` maps db id -> newest
    stored timestamp. Gaps longer than `max_catch_up` are only filled for the
    most recent `max_catch_up` (older history is the backfill's job).
    """
    floor = now - max_catch_up
    rows: list[dict[str, Any]] = []
    for sensor_id, spec in sensors:
        after = last_ts.get(sensor_id) or now - EMPTY_SENSOR_START
        after = max(after, floor)
        for ts, value, quality in generate_range(spec, after, now):
            rows.append(
                {"sensor_id": sensor_id, "ts": ts, "value": value, "quality": quality}
            )
    return rows


async def tick(
    session_factory: async_sessionmaker[AsyncSession],
    now: datetime | None = None,
    max_catch_up: timedelta = timedelta(days=7),
) -> int | None:
    """Top up all sensors to `now`. Returns rows written, or None if skipped
    because another process is already ticking."""
    now = now or datetime.now(UTC)
    async with session_factory() as session:
        # Transaction-scoped: released automatically at commit/rollback.
        got_lock = await session.scalar(
            text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": ADVISORY_LOCK_KEY}
        )
        if not got_lock:
            return None

        db_sensors = (await session.execute(select(Sensor.id, Sensor.name))).all()
        sensors: list[tuple[int, SensorSpec]] = []
        for sensor_id, name in db_sensors:
            spec = SENSORS_BY_NAME.get(name)
            if spec is None:
                logger.warning("sensor %s is not in the catalog; skipping", name)
                continue
            sensors.append((sensor_id, spec))

        last_ts = dict(
            (
                await session.execute(
                    select(Reading.sensor_id, func.max(Reading.ts)).group_by(
                        Reading.sensor_id
                    )
                )
            ).all()
        )

        # CPU-bound generation runs in a thread so the event loop keeps
        # serving API requests meanwhile (matters during a long catch-up).
        rows = await asyncio.to_thread(
            rows_to_insert, sensors, last_ts, now, max_catch_up
        )

        if rows:
            stmt = pg_insert(Reading).on_conflict_do_nothing(
                index_elements=["sensor_id", "ts"]
            )
            await session.execute(stmt, rows)
        await session.commit()
        return len(rows)


async def run_forever(
    session_factory: async_sessionmaker[AsyncSession],
    interval_s: int,
    max_catch_up_days: int,
) -> None:
    """Tick, sleep, repeat. A failing tick is logged and retried next round;
    cancellation (app shutdown) propagates and ends the loop."""
    status.enabled, status.interval_s = True, interval_s
    max_catch_up = timedelta(days=max_catch_up_days)
    logger.info("simulator worker started (every %ss)", interval_s)
    while True:
        try:
            written = await tick(session_factory, max_catch_up=max_catch_up)
            status.last_tick_at = datetime.now(UTC)
            status.last_skipped = written is None
            status.last_rows = written or 0
            status.last_error = None
            status.ticks += 1
            if written:
                logger.info("simulator tick: wrote %d readings", written)
        except Exception as exc:  # keep the loop alive; report and retry
            status.last_error = f"{type(exc).__name__}: {exc}"
            logger.exception("simulator tick failed")
        await asyncio.sleep(interval_s)
