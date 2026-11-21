"""Load the Demo Hall catalog and backfill simulated history.

Run from backend/:
    uv run python -m scripts.seed --reset              # wipe and backfill 90 days
    uv run python -m scripts.seed --reset --days 30
    uv run python -m scripts.seed --reset --method insert   # benchmark vs COPY

Readings come from app.simulator.generator.generate_day(): the same function the
live worker uses, so backfilled history and live data line up exactly. After
changing a model, re-run with --reset so history matches the new code.

Without --reset the script refuses to touch a database that already has devices.
"""

import argparse
import asyncio
import sys
import time
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, insert, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal, engine
from app.models import Device, Reading, Sensor
from app.simulator.catalog import CATALOG
from app.simulator.clock import local_date
from app.simulator.generator import generate_day

COLUMNS = ("sensor_id", "ts", "value", "quality")
Row = tuple[int, datetime, float | None, str]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument(
        "--days", type=int, default=90, help="local days to backfill (default 90)"
    )
    p.add_argument("--reset", action="store_true", help="TRUNCATE all tables first")
    p.add_argument(
        "--method",
        choices=("copy", "insert"),
        default="copy",
        help="bulk write method (default copy; insert is for benchmarking)",
    )
    return p.parse_args()


async def write_catalog(session: AsyncSession) -> dict[str, int]:
    """Insert devices and sensors; return {sensor name: sensor id}."""
    sensors: list[Sensor] = []
    for spec in CATALOG:
        device = Device(
            name=spec.name,
            display_name=spec.display_name,
            description=spec.description,
            kind=spec.kind,
        )
        session.add(device)
        for s in spec.sensors:
            sensor = Sensor(
                device=device,
                name=s.name,
                description=s.description,
                unit=s.unit,
                model_type=s.model_type,
                params=dict(s.params),
            )
            session.add(sensor)
            sensors.append(sensor)
    await session.flush()  # assigns ids
    return {s.name: s.id for s in sensors}


async def copy_rows(session: AsyncSession, rows: list[Row]) -> None:
    """Postgres COPY via asyncpg: streams rows in binary, far faster than INSERT.

    Runs on the session's own connection, inside its open transaction, so the
    whole backfill still commits (or rolls back) as one unit.
    """
    conn = await session.connection()
    raw = await conn.get_raw_connection()
    await raw.driver_connection.copy_records_to_table(
        "readings", records=rows, columns=list(COLUMNS)
    )


async def insert_rows(session: AsyncSession, rows: list[Row]) -> None:
    """Multi-row INSERT (SQLAlchemy insertmanyvalues). Kept for comparison."""
    await session.execute(
        insert(Reading), [dict(zip(COLUMNS, r, strict=True)) for r in rows]
    )


def rows_for_day(ids: dict[str, int], day: date, until: datetime) -> list[Row]:
    return [
        (ids[s.name], ts, v, q)
        for spec in CATALOG
        for s in spec.sensors
        for ts, v, q in generate_day(s, day)
        if ts <= until  # today: only samples that already "happened"
    ]


async def main() -> int:
    args = parse_args()
    write = copy_rows if args.method == "copy" else insert_rows
    now = datetime.now(UTC)
    today = local_date(now)
    days = [today - timedelta(days=i) for i in range(args.days - 1, -1, -1)]

    async with SessionLocal() as session:
        has_data = await session.scalar(select(func.count()).select_from(Device))
        if has_data and not args.reset:
            print(
                "Database already has devices. Re-run with --reset to wipe and backfill."
            )
            return 1
        if args.reset:
            await session.execute(
                text("TRUNCATE readings, sensors, devices RESTART IDENTITY")
            )

        ids = await write_catalog(session)
        print(f"catalog: {len(CATALOG)} devices, {len(ids)} sensors")
        print(
            f"backfilling {len(days)} local days ({days[0]} .. {days[-1]}) via {args.method}"
        )

        total = nulls = 0
        gen_s = write_s = 0.0
        for i, day in enumerate(days, 1):
            t0 = time.perf_counter()
            rows = rows_for_day(ids, day, now)
            t1 = time.perf_counter()
            if rows:
                await write(session, rows)
            t2 = time.perf_counter()
            gen_s += t1 - t0
            write_s += t2 - t1
            total += len(rows)
            nulls += sum(r[2] is None for r in rows)
            if i % 10 == 0 or i == len(days):
                print(f"  {day}  {i:>3}/{len(days)} days  {total:>9,} rows")

        t0 = time.perf_counter()
        await session.commit()
        commit_s = time.perf_counter() - t0

        # Refresh planner statistics after a bulk load.
        await session.execute(text("ANALYZE readings"))
        await session.commit()

    await engine.dispose()
    print(
        f"done: {total:,} readings ({nulls / max(total, 1):.2%} null) | "
        f"generate {gen_s:.1f}s, {args.method} {write_s:.1f}s, commit {commit_s:.1f}s "
        f"({total / max(write_s, 1e-9):,.0f} rows/s written)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
