from datetime import UTC, date, datetime

import pytest

from app.simulator.clock import BUILDING_TZ
from app.simulator.context import build_context, sun_elevation_sin


def local(y, mo, d, h=0, mi=0) -> datetime:
    return datetime(y, mo, d, h, mi, tzinfo=BUILDING_TZ).astimezone(UTC)


def test_sun_is_down_at_night_and_up_at_noon():
    assert sun_elevation_sin(local(2026, 11, 20, 0)) < 0
    assert sun_elevation_sin(local(2026, 11, 20, 12)) > 0.5


def test_summer_sun_is_higher_than_winter_sun():
    assert sun_elevation_sin(local(2026, 6, 21, 13)) > sun_elevation_sin(
        local(2026, 12, 21, 12)
    )


def test_solar_noon_is_around_midday_local_standard_time():
    day = build_context(date(2026, 11, 20))
    noon = max(day, key=lambda c: c.sun)
    assert 11.5 <= noon.hour <= 12.5


def test_context_covers_the_day_and_is_cached():
    day = date(2026, 11, 20)
    ctxs = build_context(day)
    assert len(ctxs) == 144
    assert all(c.day == day for c in ctxs)
    assert build_context(day) is ctxs


@pytest.mark.parametrize(
    ("ts", "expected"),
    [
        (local(2026, 11, 20, 5, 50), False),  # Fri before pre-cooling
        (local(2026, 11, 20, 6, 0), True),  # Fri HVAC start
        (local(2026, 11, 20, 18, 50), True),
        (local(2026, 11, 20, 19, 0), False),  # Fri HVAC stop
        (local(2026, 11, 21, 12, 0), False),  # Saturday: off
    ],
)
def test_hvac_schedule(ts, expected):
    day = ts.astimezone(BUILDING_TZ).date()
    ctx = next(c for c in build_context(day) if c.ts == ts)
    assert ctx.hvac_on is expected
