"""Deterministic outdoor weather for Demo Hall: daily sky condition, cloud cover,
outdoor temperature and relative humidity.

Sky condition is a Markov chain over days with strong persistence, so overcast
spells last several days (the kind of pattern you can spot in PV output and ask
the chat agent about). Every day's transition uses its own seeded RNG, so a
day's weather never depends on which days were computed first.
"""

import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from enum import StrEnum
from functools import lru_cache

from app.simulator.clock import local_date, local_hour
from app.simulator.seeding import rng_for


class Sky(StrEnum):
    SUNNY = "sunny"
    PARTLY = "partly"
    OVERCAST = "overcast"


# P(tomorrow | today). Diagonal is high: weather tends to persist.
# Coastal California: mostly sunny, with occasional multi-day overcast spells.
_TRANSITIONS: dict[Sky, tuple[tuple[Sky, float], ...]] = {
    Sky.SUNNY: ((Sky.SUNNY, 0.70), (Sky.PARTLY, 0.22), (Sky.OVERCAST, 0.08)),
    Sky.PARTLY: ((Sky.SUNNY, 0.40), (Sky.PARTLY, 0.35), (Sky.OVERCAST, 0.25)),
    Sky.OVERCAST: ((Sky.SUNNY, 0.15), (Sky.PARTLY, 0.25), (Sky.OVERCAST, 0.60)),
}

# The chain starts here; weather before this date is undefined.
EPOCH = date(2025, 1, 1)
_EPOCH_SKY = Sky.SUNNY

# Per-condition daily parameters.
_CLOUD_BASE = {Sky.SUNNY: 0.10, Sky.PARTLY: 0.45, Sky.OVERCAST: 0.85}
_TEMP_SWING_F = {Sky.SUNNY: 18.0, Sky.PARTLY: 13.0, Sky.OVERCAST: 7.0}  # max - min
_TEMP_SHIFT_F = {Sky.SUNNY: 1.0, Sky.PARTLY: 0.0, Sky.OVERCAST: -3.0}
_RH_MEAN = {Sky.SUNNY: 55.0, Sky.PARTLY: 65.0, Sky.OVERCAST: 80.0}

# Seasonal mean temperature: coldest mid-January, warmest mid-July.
_ANNUAL_MEAN_F = 63.0
_ANNUAL_AMPLITUDE_F = 8.0
_COLDEST_DAY_OF_YEAR = 15


@dataclass(frozen=True)
class DailyWeather:
    day: date
    sky: Sky
    cloud_cover: float  # 0 = clear, 1 = fully overcast
    temp_mean_f: float  # daily mean outdoor temperature
    temp_swing_f: float  # daily max - min
    rh_mean: float  # daily mean outdoor relative humidity, %


# --- sky condition chain ----------------------------------------------------

# _sky_cache[i] is the sky on EPOCH + i days; extended on demand.
_sky_cache: list[Sky] = [_EPOCH_SKY]


def _next_sky(today: Sky, tomorrow: date) -> Sky:
    draw = rng_for("weather", tomorrow, "sky").random()
    cumulative = 0.0
    for sky, p in _TRANSITIONS[today]:
        cumulative += p
        if draw < cumulative:
            return sky
    return _TRANSITIONS[today][-1][0]


def sky_on(day: date) -> Sky:
    """Sky condition for a local day. Iterates the chain from EPOCH (cached)."""
    index = (day - EPOCH).days
    if index < 0:
        raise ValueError(f"Weather is only defined from {EPOCH} onwards, got {day}")
    while len(_sky_cache) <= index:
        next_day = EPOCH + timedelta(days=len(_sky_cache))
        _sky_cache.append(_next_sky(_sky_cache[-1], next_day))
    return _sky_cache[index]


def clear_cache() -> None:
    """Reset all caches (tests use this to prove order-independence)."""
    del _sky_cache[1:]
    daily_weather.cache_clear()


# --- daily parameters -------------------------------------------------------


def _seasonal_mean_f(day: date) -> float:
    angle = 2 * math.pi * (day.timetuple().tm_yday - _COLDEST_DAY_OF_YEAR) / 365.25
    return _ANNUAL_MEAN_F - _ANNUAL_AMPLITUDE_F * math.cos(angle)


# Cached: intraday functions are called for every sensor at every sample, and
# the result for a day never changes (it's a pure function of the date).
@lru_cache(maxsize=4096)
def daily_weather(day: date) -> DailyWeather:
    sky = sky_on(day)
    rng = rng_for("weather", day, "params")
    cloud = _CLOUD_BASE[sky] + rng.uniform(-0.08, 0.08)
    return DailyWeather(
        day=day,
        sky=sky,
        cloud_cover=min(max(cloud, 0.0), 1.0),
        temp_mean_f=_seasonal_mean_f(day) + _TEMP_SHIFT_F[sky] + rng.gauss(0, 2.5),
        temp_swing_f=_TEMP_SWING_F[sky] * rng.uniform(0.85, 1.15),
        rh_mean=_RH_MEAN[sky] + rng.uniform(-5, 5),
    )


# --- intraday values --------------------------------------------------------


def diurnal_shape(hour: float) -> float:
    """-1 at 06:00 (coolest), +1 at 15:00 (warmest), smooth and continuous.

    Warms over 9 hours, cools over 15: an asymmetric day like real temperature.
    """
    if 6.0 <= hour < 15.0:
        return -math.cos(math.pi * (hour - 6.0) / 9.0)
    return math.cos(math.pi * ((hour - 15.0) % 24.0) / 15.0)


def _blend(ts: datetime) -> tuple[DailyWeather, DailyWeather, float]:
    """Neighbouring days and weight for continuous values across midnight.

    Each day's parameters are anchored at local noon and interpolated linearly
    to the next/previous noon, so nothing jumps at midnight.
    Returns (a, b, w) meaning value = a*(1-w) + b*w.
    """
    day = local_date(ts)
    hour = local_hour(ts)
    today = daily_weather(day)
    if hour >= 12.0:
        return today, daily_weather(day + timedelta(days=1)), (hour - 12.0) / 24.0
    return daily_weather(day - timedelta(days=1)), today, (hour + 12.0) / 24.0


def outdoor_temp_f(ts: datetime) -> float:
    a, b, w = _blend(ts)
    mean = a.temp_mean_f * (1 - w) + b.temp_mean_f * w
    swing = a.temp_swing_f * (1 - w) + b.temp_swing_f * w
    return mean + swing / 2 * diurnal_shape(local_hour(ts))


def outdoor_rh(ts: datetime) -> float:
    """Relative humidity, %: highest around dawn, lowest mid-afternoon."""
    a, b, w = _blend(ts)
    mean = a.rh_mean * (1 - w) + b.rh_mean * w
    rh = mean - 15.0 * diurnal_shape(local_hour(ts))
    return min(max(rh, 5.0), 100.0)


def cloud_cover(ts: datetime) -> float:
    """Daily cloud cover for the local day of `ts` (intraday variation is left
    to the PV model, which adds passing-cloud noise)."""
    return daily_weather(local_date(ts)).cloud_cover
