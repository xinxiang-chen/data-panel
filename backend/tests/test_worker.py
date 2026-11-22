"""Unit tests for the worker's planning step (no database needed)."""

from datetime import UTC, datetime, timedelta

from app.simulator.catalog import SENSORS_BY_NAME
from app.simulator.clock import SAMPLE_INTERVAL
from app.simulator.generator import generate_range
from app.simulator.worker import EMPTY_SENSOR_START, rows_to_insert

NOW = datetime(2026, 11, 21, 12, 3, tzinfo=UTC)  # between grid points
WEEK = timedelta(days=7)
TEMP = SENSORS_BY_NAME["DH_VAV_F1_01_RoomTemp"]
PV = SENSORS_BY_NAME["DH_PV1_Power"]
SENSORS = [(1, TEMP), (2, PV)]


def last_grid_point_before(t: datetime) -> datetime:
    return t.replace(minute=t.minute - t.minute % 10, second=0, microsecond=0)


def test_up_to_date_sensors_need_nothing():
    last = last_grid_point_before(NOW)
    assert rows_to_insert(SENSORS, {1: last, 2: last}, NOW, WEEK) == []


def test_fills_exactly_the_missing_samples():
    last = last_grid_point_before(NOW) - timedelta(hours=1)
    rows = rows_to_insert(SENSORS, {1: last, 2: last}, NOW, WEEK)
    assert len(rows) == 2 * 6
    ts_1 = [r["ts"] for r in rows if r["sensor_id"] == 1]
    assert ts_1 == [last + SAMPLE_INTERVAL * i for i in range(1, 7)]


def test_rows_match_the_generator():
    last = NOW - timedelta(hours=3)
    rows = rows_to_insert([(7, TEMP)], {7: last}, NOW, WEEK)
    expected = generate_range(TEMP, last, NOW)
    assert [(r["ts"], r["value"], r["quality"]) for r in rows] == expected
    assert {r["sensor_id"] for r in rows} == {7}


def test_sensor_without_readings_starts_recently():
    rows = rows_to_insert([(1, TEMP)], {}, NOW, WEEK)
    assert rows[0]["ts"] > NOW - EMPTY_SENSOR_START
    assert len(rows) == 144


def test_long_downtime_is_capped():
    """After a month away, only the last `max_catch_up` is regenerated."""
    rows = rows_to_insert(
        [(1, TEMP)], {1: NOW - timedelta(days=30)}, NOW, timedelta(days=2)
    )
    assert min(r["ts"] for r in rows) > NOW - timedelta(days=2)
    assert len(rows) == 2 * 144


def test_catch_up_after_one_day_is_complete():
    last = last_grid_point_before(NOW) - timedelta(days=1)
    rows = rows_to_insert([(1, TEMP)], {1: last}, NOW, WEEK)
    assert len(rows) == 144
