"""Shared environment at each sample time: the inputs every sensor model reads.

All 66 sensors of Demo Hall see the *same* context at a given instant (same
weather, same sun, same occupancy, same HVAC mode). That shared cause is what
makes the generated data coherent: VAV airflow, AHU fan speed, PV output and
building demand all rise and fall together for physical reasons.
"""

import math
from dataclasses import dataclass
from datetime import UTC, date, datetime
from functools import lru_cache

from app.simulator.clock import day_grid, is_workday, local_hour, occupancy
from app.simulator.weather import cloud_cover, outdoor_rh, outdoor_temp_f

# Demo Hall location (Los Angeles area).
LATITUDE_DEG = 34.05
LONGITUDE_DEG = -118.25

# HVAC occupied mode on workdays: starts before people arrive (pre-cooling)
# and runs a little after they leave. Off otherwise (nights and weekends).
HVAC_START_HOUR = 6.0
HVAC_STOP_HOUR = 19.0


def sun_elevation_sin(ts: datetime) -> float:
    """sin(solar elevation angle); <= 0 means the sun is below the horizon.

    Standard approximation (declination from day of year, hour angle from solar
    time). Computed from UTC + longitude, so daylight saving time can't skew it.
    Accurate to well within what a demo needs (a few minutes / ~1 degree).
    """
    utc = ts.astimezone(UTC)
    day_of_year = utc.timetuple().tm_yday
    declination = math.radians(23.44) * math.sin(
        2 * math.pi * (284 + day_of_year) / 365
    )
    solar_hours = utc.hour + utc.minute / 60 + LONGITUDE_DEG / 15
    hour_angle = math.radians(15 * (solar_hours - 12))
    lat = math.radians(LATITUDE_DEG)
    return math.sin(lat) * math.sin(declination) + math.cos(lat) * math.cos(
        declination
    ) * math.cos(hour_angle)


@dataclass(frozen=True, slots=True)
class Ctx:
    ts: datetime  # UTC
    day: date  # building-local calendar day
    hour: float  # building-local fractional hour
    workday: bool
    occupancy: float  # 0..1
    hvac_on: bool  # HVAC in occupied mode
    t_out: float  # outdoor temperature, °F
    rh_out: float  # outdoor relative humidity, %
    cloud: float  # cloud cover 0..1 for the day
    sun: float  # max(0, sin(solar elevation)); 0 at night


def make_ctx(ts: datetime, day: date) -> Ctx:
    hour = local_hour(ts)
    workday = is_workday(ts)
    return Ctx(
        ts=ts,
        day=day,
        hour=hour,
        workday=workday,
        occupancy=occupancy(ts),
        hvac_on=workday and HVAC_START_HOUR <= hour < HVAC_STOP_HOUR,
        t_out=outdoor_temp_f(ts),
        rh_out=outdoor_rh(ts),
        cloud=cloud_cover(ts),
        sun=max(0.0, sun_elevation_sin(ts)),
    )


# Cached: every sensor of a day uses the same context, so compute it once.
@lru_cache(maxsize=32)
def build_context(day: date) -> tuple[Ctx, ...]:
    """Context for every sample of a building-local day (see clock.day_grid)."""
    return tuple(make_ctx(ts, day) for ts in day_grid(day))
