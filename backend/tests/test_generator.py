from datetime import UTC, date, datetime, timedelta
from itertools import pairwise

from app.simulator.catalog import SENSORS_BY_NAME
from app.simulator.clock import BUILDING_TZ, SAMPLE_INTERVAL
from app.simulator.faults import QUALITY_BAD
from app.simulator.generator import DECIMALS, generate_day, generate_range, local_days

SENSOR = SENSORS_BY_NAME["DH_VAV_F1_01_RoomTemp"]


def local(y, mo, d, h=0, mi=0) -> datetime:
    return datetime(y, mo, d, h, mi, tzinfo=BUILDING_TZ).astimezone(UTC)


def test_values_are_rounded():
    for _, v, _ in generate_day(SENSOR, date(2026, 11, 20)):
        if v is not None:
            assert v == round(v, DECIMALS)


def test_always_offline_sensor_yields_nulls():
    rows = generate_day(SENSORS_BY_NAME["DH_AHU3_SaRh"], date(2026, 11, 20))
    assert {(v, q) for _, v, q in rows} == {(None, QUALITY_BAD)}


def test_local_days_spans_midnight():
    days = list(local_days(local(2026, 11, 19, 23), local(2026, 11, 21, 1)))
    assert days == [date(2026, 11, 19), date(2026, 11, 20), date(2026, 11, 21)]


def test_range_is_exclusive_start_inclusive_end():
    after, until = local(2026, 11, 20, 10, 0), local(2026, 11, 20, 11, 0)
    rows = generate_range(SENSOR, after, until)
    assert [r[0] for r in rows] == [after + SAMPLE_INTERVAL * i for i in range(1, 7)]


def test_range_matches_generate_day_exactly():
    """Worker top-ups must equal what the backfill wrote for the same instants."""
    day = date(2026, 11, 20)
    full = generate_day(SENSOR, day)
    after, until = full[40][0], full[90][0]
    assert generate_range(SENSOR, after, until) == full[41:91]


def test_range_across_midnight_and_dst_has_no_gaps_or_duplicates():
    # 2026-11-01 is the fall-back day (25 local hours).
    after, until = local(2026, 10, 31, 22), local(2026, 11, 2, 2)
    ts = [r[0] for r in generate_range(SENSOR, after, until)]
    assert len(ts) == len(set(ts))
    assert all(b - a == SAMPLE_INTERVAL for a, b in pairwise(ts))
    assert ts[0] == after + SAMPLE_INTERVAL and ts[-1] == until


def test_catch_up_after_downtime():
    """A worker that was down for a day fills all 144 missing samples at once."""
    after = local(2026, 11, 19, 12)
    rows = generate_range(SENSOR, after, after + timedelta(days=1))
    assert len(rows) == 144


def test_empty_range():
    t = local(2026, 11, 20, 10)
    assert generate_range(SENSOR, t, t) == []
