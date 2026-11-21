from datetime import UTC, date, datetime, timedelta
from itertools import pairwise

import pytest

from app.simulator.clock import (
    BUILDING_TZ,
    SAMPLE_INTERVAL,
    day_grid,
    is_workday,
    local_date,
    local_hour,
    occupancy,
)


def local(y, mo, d, h=0, mi=0) -> datetime:
    """A building-local wall-clock time, returned in UTC."""
    return datetime(y, mo, d, h, mi, tzinfo=BUILDING_TZ).astimezone(UTC)


# --- day_grid ---------------------------------------------------------------


@pytest.mark.parametrize(
    ("day", "expected_points"),
    [
        (date(2026, 11, 20), 144),  # normal day
        (date(2026, 3, 8), 138),  # DST starts: 23h local day
        (date(2026, 11, 1), 150),  # DST ends: 25h local day
    ],
)
def test_day_grid_length_handles_dst(day, expected_points):
    assert len(day_grid(day)) == expected_points


def test_day_grid_is_utc_10min_aligned_and_starts_at_local_midnight():
    grid = day_grid(date(2026, 11, 20))
    assert grid[0] == local(2026, 11, 20)  # 08:00 UTC in PST
    assert all(t.tzinfo is UTC for t in grid)
    assert all(t.minute % 10 == 0 and t.second == 0 for t in grid)
    assert all(b - a == SAMPLE_INTERVAL for a, b in pairwise(grid))


def test_consecutive_days_tile_without_gaps_or_overlap():
    # Spans the fall-back switch on 2026-11-01.
    days = [date(2026, 10, 31), date(2026, 11, 1), date(2026, 11, 2)]
    points = [t for d in days for t in day_grid(d)]
    assert len(points) == len(set(points))
    assert all(b - a == SAMPLE_INTERVAL for a, b in pairwise(points))


def test_every_grid_point_maps_back_to_its_local_day():
    for d in (date(2026, 3, 8), date(2026, 11, 1), date(2026, 11, 20)):
        assert {local_date(t) for t in day_grid(d)} == {d}


# --- local time helpers -----------------------------------------------------


def test_local_hour_and_workday():
    t = local(2026, 11, 20, 14, 30)  # Friday
    assert local_hour(t) == pytest.approx(14.5)
    assert is_workday(t)
    assert not is_workday(local(2026, 11, 21, 12))  # Saturday


# --- occupancy --------------------------------------------------------------


def test_weekday_office_hours_are_busy_and_nights_are_empty():
    assert occupancy(local(2026, 11, 20, 10)) > 0.9  # Fri 10:00
    assert occupancy(local(2026, 11, 20, 15)) > 0.9  # Fri 15:00
    assert occupancy(local(2026, 11, 20, 3)) < 0.1  # Fri 03:00
    assert occupancy(local(2026, 11, 20, 22)) < 0.1  # Fri 22:00


def test_lunch_dip():
    noon_half = occupancy(local(2026, 11, 20, 12, 30))
    assert noon_half < occupancy(local(2026, 11, 20, 11))
    assert noon_half > 0.7


def test_weekend_is_quiet():
    assert occupancy(local(2026, 11, 21, 12)) < 0.2  # Sat noon
    assert occupancy(local(2026, 11, 22, 3)) < 0.1  # Sun 03:00


def test_occupancy_is_bounded_and_smooth_over_a_week():
    start = local(2026, 11, 16)  # Monday
    values = [occupancy(start + SAMPLE_INTERVAL * i) for i in range(7 * 144)]
    assert all(0.0 <= v <= 1.0 for v in values)
    # No step larger than 0.2 between consecutive 10-minute samples.
    assert max(abs(b - a) for a, b in pairwise(values)) < 0.2


def test_schedule_follows_local_time_across_dst():
    """10:00 local is busy both before and after the DST switch, even though
    it is 17:00 UTC in summer and 18:00 UTC in winter."""
    summer = local(2026, 10, 30, 10)  # Fri, PDT
    winter = local(2026, 11, 6, 10)  # Fri, PST
    assert summer.hour != winter.hour
    assert occupancy(summer) == pytest.approx(occupancy(winter))
    assert occupancy(summer) > 0.9
    assert occupancy(winter - timedelta(hours=7)) < 0.1  # 03:00 local
