"""Time helpers: the building's local time zone, the 10-minute sample grid, and
the occupancy schedule.

Readings are stored in UTC, but schedules ("weekdays 8-18") and the sun follow
the building's *local* clock, including daylight saving time.
"""

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

# Demo Hall is a fictional building on the US West Coast.
BUILDING_TZ = ZoneInfo("America/Los_Angeles")

# One reading every 10 minutes, aligned to :00, :10, :20 ... in UTC.
# (Local midnight in Los Angeles is a whole-hour UTC offset, so local days
# start exactly on this grid.)
SAMPLE_INTERVAL = timedelta(minutes=10)


def local_day_bounds(day: date) -> tuple[datetime, datetime]:
    """UTC [start, end) of a *local* calendar day.

    Usually 24h long; 23h on the spring-forward day and 25h on fall-back.
    """
    start = datetime.combine(day, time.min, tzinfo=BUILDING_TZ)
    end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=BUILDING_TZ)
    return start.astimezone(UTC), end.astimezone(UTC)


def day_grid(day: date) -> list[datetime]:
    """UTC timestamps of every sample in a local day (144 normally; 138 / 150 on DST days).

    The step is added in UTC on purpose. Adding timedelta to a ZoneInfo-aware
    datetime does *wall-clock* arithmetic, which would skip or repeat an hour
    around DST switches.
    """
    start, end = local_day_bounds(day)
    count = (end - start) // SAMPLE_INTERVAL
    return [start + SAMPLE_INTERVAL * i for i in range(count)]


def local_date(ts: datetime) -> date:
    """The building-local calendar day a UTC timestamp falls on."""
    return ts.astimezone(BUILDING_TZ).date()


def local_hour(ts: datetime) -> float:
    """Local time of day as fractional hours, e.g. 14:30 -> 14.5."""
    local = ts.astimezone(BUILDING_TZ)
    return local.hour + local.minute / 60 + local.second / 3600


def is_workday(ts: datetime) -> bool:
    """Mon-Fri in local time. (Public holidays are not modelled.)"""
    return ts.astimezone(BUILDING_TZ).weekday() < 5


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    """0 below edge0, 1 above edge1, smooth S-curve in between (no sudden jumps)."""
    t = min(max((x - edge0) / (edge1 - edge0), 0.0), 1.0)
    return t * t * (3 - 2 * t)


# Occupancy levels (fraction of the building in use).
_UNOCCUPIED = 0.05
_WEEKDAY_PEAK = 0.95
_WEEKEND_PEAK = 0.15
_LUNCH_DIP = 0.12


def occupancy(ts: datetime) -> float:
    """Fraction of the building occupied at `ts`, in [0, 1].

    Weekdays: ramps up 7-9h, full 9-17h with a small lunch dip, ramps down 17-19h.
    Weekends: a few people around midday only.
    Deterministic (no randomness): per-sensor noise is added by the models.
    """
    hour = local_hour(ts)
    if is_workday(ts):
        arrive = smoothstep(7.0, 9.0, hour)
        leave = 1.0 - smoothstep(17.0, 19.0, hour)
        level = _UNOCCUPIED + (_WEEKDAY_PEAK - _UNOCCUPIED) * arrive * leave
        # Lunch: a shallow dip centred on 12:30.
        lunch = smoothstep(11.75, 12.25, hour) * (1.0 - smoothstep(12.75, 13.25, hour))
        level -= _LUNCH_DIP * lunch
    else:
        midday = smoothstep(9.0, 11.0, hour) * (1.0 - smoothstep(15.0, 17.0, hour))
        level = _UNOCCUPIED + (_WEEKEND_PEAK - _UNOCCUPIED) * midday
    return min(max(level, 0.0), 1.0)
