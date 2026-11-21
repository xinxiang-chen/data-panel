import math
import random
from dataclasses import replace
from datetime import date, timedelta

import pytest

from app.simulator import faults
from app.simulator.catalog import ALWAYS_OFFLINE, SENSORS_BY_NAME
from app.simulator.faults import (
    QUALITY_BAD,
    QUALITY_GOOD,
    FaultPlan,
    apply_faults,
    plan_faults,
)
from app.simulator.models import simulate_sensor_day

TODAY = date(2026, 11, 21)
LAST_90 = [TODAY - timedelta(days=i) for i in range(90, 0, -1)]
HEALTHY_SENSORS = [s for s in SENSORS_BY_NAME.values() if s.name not in ALWAYS_OFFLINE]


def readings(sensor, day):
    return apply_faults(sensor, day, simulate_sensor_day(sensor, day))


def plans():
    """(sensor, day, plan) for every healthy sensor over the last 90 days."""
    for s in HEALTHY_SENSORS:
        for d in LAST_90:
            yield s, d, plan_faults(s, d, 144)


def find(kind: str):
    """First (sensor, day, plan) in the 90-day window that has this fault."""
    for s, d, p in plans():
        if getattr(p, kind):
            return s, d, p
    pytest.fail(f"no {kind} fault in 90 days")


# --- always offline ---------------------------------------------------------


@pytest.mark.parametrize("name", sorted(ALWAYS_OFFLINE))
def test_always_offline_sensor_never_reports(name):
    rows = readings(SENSORS_BY_NAME[name], TODAY)
    assert len(rows) == 144
    assert all(v is None and q == QUALITY_BAD for _, v, q in rows)


# --- determinism and rates --------------------------------------------------


def test_plans_are_deterministic():
    s = SENSORS_BY_NAME["DH_AHU1_SaTemp"]
    assert [plan_faults(s, d, 144) for d in LAST_90] == [
        plan_faults(s, d, 144) for d in LAST_90
    ]


def test_fault_rates_match_configuration():
    total = offline = stuck = spike = 0
    for _, _, p in plans():
        total += 1
        offline += p.offline is not None
        stuck += p.stuck is not None
        spike += bool(p.spikes)
    # 64 sensors x 90 days = 5760 sensor-days; loose bounds around the targets.
    assert 0.012 < offline / total < 0.03  # 2%
    assert 0.004 < stuck / total < 0.017  # 1%
    assert 0.004 < spike / total < 0.017  # 1%


def test_most_sensor_days_are_clean():
    clean = sum(p.is_clean for _, _, p in plans())
    assert clean / (len(HEALTHY_SENSORS) * len(LAST_90)) > 0.95


def test_windows_fit_inside_the_day():
    for _, _, p in plans():
        for win, (lo, hi) in (
            (p.offline, faults.OFFLINE_SAMPLES),
            (p.stuck, faults.STUCK_SAMPLES),
        ):
            if win:
                assert 0 <= win.start and win.stop <= 144
                assert lo <= len(win) <= hi
        assert all(0 <= i < 144 for i in p.spikes)
        assert len(p.spikes) <= faults.SPIKE_COUNT[1]


# --- each fault's effect on readings ----------------------------------------


def test_offline_window_is_null_and_bad():
    s, d, p = find("offline")
    rows = readings(s, d)
    for i in p.offline:
        assert rows[i][1] is None and rows[i][2] == QUALITY_BAD


def test_stuck_window_repeats_one_value_with_good_quality():
    s, d, p = find("stuck")
    rows = readings(s, d)
    stuck_rows = [rows[i] for i in p.stuck if not (p.offline and i in p.offline)]
    assert len({v for _, v, _ in stuck_rows}) == 1
    assert all(q == QUALITY_GOOD for _, _, q in stuck_rows)


def test_spikes_leave_the_physical_range_with_good_quality():
    s, d, p = find("spikes")
    rows = readings(s, d)
    lo, hi = s.expected_range
    for i in p.spikes:
        _, v, q = rows[i]
        if p.offline and i in p.offline:
            continue
        assert math.isfinite(v)
        assert not (lo <= v <= hi)
        assert q == QUALITY_GOOD


def test_samples_outside_fault_windows_are_untouched():
    for kind in ("offline", "stuck", "spikes"):
        s, d, p = find(kind)
        healthy = simulate_sensor_day(s, d)
        rows = readings(s, d)
        faulty = set(p.offline or ()) | set(p.stuck or ()) | set(p.spikes)
        for i, ((ts, v), (ts2, v2, q)) in enumerate(zip(healthy, rows, strict=True)):
            assert ts == ts2
            if i not in faulty:
                assert v2 == v and q == QUALITY_GOOD


def test_offline_overrides_other_faults(monkeypatch):
    """A sensor that is offline reports nothing, even inside a stuck window."""
    s = SENSORS_BY_NAME["DH_AHU1_SaTemp"]
    points = simulate_sensor_day(s, TODAY)
    plan = FaultPlan(offline=range(10, 20), stuck=range(5, 30), spikes=(12,))
    monkeypatch.setattr(faults, "plan_faults", lambda *_: plan)
    rows = apply_faults(s, TODAY, points)
    assert all(rows[i][1] is None for i in range(10, 20))
    assert len({rows[i][1] for i in (*range(5, 10), *range(20, 30))}) == 1


def test_spike_without_finite_range_scales_value():
    s = replace(SENSORS_BY_NAME["DH_AHU1_SaTemp"], expected_range=(-math.inf, math.inf))
    assert faults._spike_value(s, 10.0, random.Random(0)) >= 30.0
