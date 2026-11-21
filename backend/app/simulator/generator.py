"""Final readings: healthy model output + faults, rounded like a real BMS.

Both writers use this module, which is why their data always agrees:

    scripts/seed.py    generate_day() for each past day      (one-time backfill)
    worker (step 2.6)  generate_range(last_ts, now)          (incremental top-up)
"""

from collections.abc import Iterator
from datetime import date, datetime, timedelta

from app.simulator.catalog import SensorSpec
from app.simulator.clock import local_date
from app.simulator.faults import Reading, apply_faults
from app.simulator.models import simulate_sensor_day

# Readings are stored with 3 decimals (e.g. 58.312), like the original API's.
DECIMALS = 3


def generate_day(sensor: SensorSpec, day: date) -> list[Reading]:
    """All readings of one sensor for one building-local day, faults included."""
    readings = apply_faults(sensor, day, simulate_sensor_day(sensor, day))
    return [(ts, None if v is None else round(v, DECIMALS), q) for ts, v, q in readings]


def local_days(start: datetime, end: datetime) -> Iterator[date]:
    """Building-local days touched by the UTC instants [start, end]."""
    day, last = local_date(start), local_date(end)
    while day <= last:
        yield day
        day += timedelta(days=1)


def generate_range(
    sensor: SensorSpec, after: datetime, until: datetime
) -> list[Reading]:
    """Readings with after < ts <= until: exactly the samples missing after `after`.

    The worker passes the sensor's last stored timestamp as `after` and the
    current time as `until`, so each call fills the gap and nothing else.
    """
    return [
        r
        for day in local_days(after, until)
        for r in generate_day(sensor, day)
        if after < r[0] <= until
    ]
