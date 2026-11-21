"""Fault injection: turn healthy model output into realistic, imperfect readings.

Real building data is messy, and the demo should be too:

  offline        sensor stops reporting for 1-6 h: value None, quality BAD
  stuck          value freezes for 2-8 h but quality stays GOOD (the hard one:
                 nothing flags it, you only see a suspiciously flat line)
  spike          1-2 single-sample outliers outside the physical range,
                 quality GOOD (a glitch that slipped through)
  always_offline dead point that never reports (catalog flag)

Faults are planned per (sensor, local day) from their own RNG stream, so they
are as deterministic as the readings themselves. The plan doubles as ground
truth: tests (and later, chat-agent evaluation) can ask exactly what is wrong.
"""

import math
from dataclasses import dataclass
from datetime import date, datetime

from app.simulator.catalog import SensorSpec
from app.simulator.seeding import rng_for

# Quality strings in the original building API's format.
QUALITY_GOOD = "QUALITY_GOOD+OK+LIMIT_OK"
QUALITY_BAD = "QUALITY_BAD"

# Probability that a sensor has each fault on a given day, and its duration in
# 10-minute samples.
OFFLINE_P, OFFLINE_SAMPLES = 0.02, (6, 36)  # 1-6 h
STUCK_P, STUCK_SAMPLES = 0.01, (12, 48)  # 2-8 h
SPIKE_P, SPIKE_COUNT = 0.01, (1, 2)

Reading = tuple[datetime, float | None, str]


@dataclass(frozen=True)
class FaultPlan:
    """Which samples of a sensor-day are faulty (indices into the day grid)."""

    always_offline: bool = False
    offline: range | None = None
    stuck: range | None = None
    spikes: tuple[int, ...] = ()

    @property
    def is_clean(self) -> bool:
        return not (self.always_offline or self.offline or self.stuck or self.spikes)


def _window(rng, n: int, length_range: tuple[int, int]) -> range:
    length = min(rng.randint(*length_range), n)
    start = rng.randint(0, n - length)
    return range(start, start + length)


def plan_faults(sensor: SensorSpec, day: date, n: int) -> FaultPlan:
    """Decide the faults for one sensor-day with `n` samples.

    Every draw happens unconditionally and in a fixed order, so changing one
    fault's probability never reshuffles where the *other* faults land.
    """
    if sensor.params.get("always_offline"):
        return FaultPlan(always_offline=True)

    rng = rng_for(sensor.name, day, "fault")
    offline_hit, offline_win = (
        rng.random() < OFFLINE_P,
        _window(rng, n, OFFLINE_SAMPLES),
    )
    stuck_hit, stuck_win = rng.random() < STUCK_P, _window(rng, n, STUCK_SAMPLES)
    spike_hit = rng.random() < SPIKE_P
    spike_at = tuple(sorted(rng.sample(range(n), SPIKE_COUNT[1])))[
        : rng.randint(*SPIKE_COUNT)
    ]
    return FaultPlan(
        offline=offline_win if offline_hit else None,
        stuck=stuck_win if stuck_hit else None,
        spikes=spike_at if spike_hit else (),
    )


def _spike_value(sensor: SensorSpec, value: float, rng) -> float:
    """An outlier clearly outside the sensor's physical range (above or below)."""
    lo, hi = sensor.expected_range
    if not (math.isfinite(lo) and math.isfinite(hi)):
        return value * rng.uniform(3.0, 5.0)
    span = hi - lo
    if rng.random() < 0.5:
        return hi + span * rng.uniform(0.2, 0.8)
    return lo - span * rng.uniform(0.2, 0.8)


def apply_faults(
    sensor: SensorSpec, day: date, points: list[tuple[datetime, float]]
) -> list[Reading]:
    """Healthy (ts, value) points -> (ts, value | None, quality) with faults applied.

    Order matters: stuck and spikes first, then offline on top (a sensor that is
    offline reports nothing, whatever else was wrong with it).
    """
    plan = plan_faults(sensor, day, len(points))
    if plan.always_offline:
        return [(ts, None, QUALITY_BAD) for ts, _ in points]

    values: list[float | None] = [v for _, v in points]
    quality = [QUALITY_GOOD] * len(points)

    if plan.stuck:
        frozen = values[plan.stuck.start]
        for i in plan.stuck:
            values[i] = frozen  # quality stays GOOD: nothing flags a stuck sensor

    if plan.spikes:
        spike_rng = rng_for(sensor.name, day, "spike")
        for i in plan.spikes:
            values[i] = _spike_value(sensor, values[i], spike_rng)

    if plan.offline:
        for i in plan.offline:
            values[i], quality[i] = None, QUALITY_BAD

    return [(ts, v, q) for (ts, _), v, q in zip(points, values, quality, strict=True)]
