"""Physical sensor models for Demo Hall.

Each model computes one sensor's healthy readings for a whole local day:

    model(ctxs, params, rng) -> list[float]   # one value per context sample

Whole-day signatures let models carry state along the day: AR(1) noise (so
readings wander smoothly instead of jittering) and the room temperature's
thermal lag. Everything is a pure function of (sensor, day), as required for
the backfill and the live worker to agree.

Coherence comes from shared deterministic building physics (zone_load etc.):
an AHU's fan follows the very same zone loads that drive its VAV boxes.
Faults (offline/stuck/spikes) are applied later, in faults.py (step 2.4).
"""

import math
import random
from collections.abc import Callable, Mapping, Sequence
from datetime import date, datetime
from typing import Any

from app.simulator.catalog import SensorSpec
from app.simulator.context import Ctx, build_context
from app.simulator.seeding import rng_for

Params = Mapping[str, Any]
ModelFn = Callable[[Sequence[Ctx], Params, random.Random], list[float]]

MODELS: dict[str, ModelFn] = {}


def model(name: str) -> Callable[[ModelFn], ModelFn]:
    """Register a model under the model_type used in the catalog."""

    def register(fn: ModelFn) -> ModelFn:
        if name in MODELS:
            raise ValueError(f"duplicate model_type {name!r}")
        MODELS[name] = fn
        return fn

    return register


# --- helpers ----------------------------------------------------------------


def clamp(x: float, lo: float, hi: float) -> float:
    return min(max(x, lo), hi)


def ar1(n: int, rng: random.Random, sigma: float, phi: float = 0.9) -> list[float]:
    """Smoothly wandering noise with standard deviation `sigma`.

    e[t] = phi * e[t-1] + innovation. phi=0.9 at 10-minute steps means the
    noise "remembers" the last ~hour, which looks like a real sensor drifting,
    unlike white noise that jumps independently every sample.
    """
    if sigma <= 0:
        return [0.0] * n
    innovation = sigma * math.sqrt(1 - phi * phi)  # keeps the variance at sigma²
    e = rng.gauss(0, sigma)
    out = []
    for _ in range(n):
        out.append(e)
        e = phi * e + rng.gauss(0, innovation)
    return out


# --- shared building physics (deterministic) --------------------------------


def zone_load(c: Ctx, exposure: float, roof: bool) -> float:
    """Cooling demand of one zone, 0..1.

    internal gains (people, equipment) + solar through windows (by orientation,
    dimmed by clouds) + envelope gain/loss vs. outdoor temperature + roof gain.
    """
    internal = 0.45 * c.occupancy
    solar = 0.35 * exposure * c.sun * (1 - 0.7 * c.cloud)
    envelope = 0.25 * clamp((c.t_out - 60.0) / 20.0, -1.0, 1.0)
    roof_gain = 0.06 * c.sun if roof else 0.0
    return clamp(internal + solar + envelope + roof_gain, 0.0, 1.0)


def floor_load(c: Ctx, zones: Sequence[Mapping[str, Any]], roof: bool) -> float:
    return sum(zone_load(c, z["exposure"], roof) for z in zones) / len(zones)


def fan_target(c: Ctx, zones: Sequence[Mapping[str, Any]], roof: bool) -> float:
    """AHU supply fan speed %, tracking its floor's load; off outside HVAC hours."""
    if not c.hvac_on:
        return 0.0
    return clamp(35.0 + 55.0 * floor_load(c, zones, roof), 0.0, 100.0)


def airflow_target(c: Ctx, p: Params) -> float:
    if not c.hvac_on:
        return 0.0
    load = zone_load(c, p["exposure"], p["roof"])
    return p["min_cfm"] + (p["max_cfm"] - p["min_cfm"]) * load


def _passing_clouds(ctxs: Sequence[Ctx], p: Params) -> list[float]:
    """Multiplicative irradiance flicker from passing clouds, shared by all
    sensors of the PV device (same RNG key), so Power tracks Irradiance.
    Strongest on partly cloudy days, near zero when clear or fully overcast."""
    cloud = ctxs[0].cloud
    sigma = 0.6 * cloud * (1 - cloud)
    return ar1(
        len(ctxs), rng_for(p["device"], ctxs[0].day, "passing_clouds"), sigma, 0.7
    )


def _irradiance(ctxs: Sequence[Ctx], p: Params) -> list[float]:
    flicker = _passing_clouds(ctxs, p)
    out = []
    for c, f in zip(ctxs, flicker, strict=True):
        clear_sky = 1000.0 * c.sun**1.15
        out.append(max(0.0, clear_sky * (1 - 0.75 * c.cloud) * (1 + f)))
    return out


# --- AHU --------------------------------------------------------------------


@model("ahu_supply_temp")
def ahu_supply_temp(ctxs: Sequence[Ctx], p: Params, rng: random.Random) -> list[float]:
    """Cooling coil leaving air: ~55°F in occupied mode, reset a little warmer at
    low load; with the unit off the duct drifts toward mechanical-room temp."""
    noise = ar1(len(ctxs), rng, 0.35)
    out = []
    for c, e in zip(ctxs, noise, strict=True):
        if c.hvac_on:
            load = floor_load(c, p["zones"], p["roof"])
            v = p["setpoint_f"] + 3.0 * (1.0 - load)
        else:
            v = 0.7 * 68.0 + 0.3 * c.t_out
        out.append(v + e)
    return out


@model("ahu_return_temp")
def ahu_return_temp(ctxs: Sequence[Ctx], p: Params, rng: random.Random) -> list[float]:
    noise = ar1(len(ctxs), rng, 0.25)
    out = []
    for c, e in zip(ctxs, noise, strict=True):
        if c.hvac_on:
            v = 71.0 + 2.5 * floor_load(c, p["zones"], p["roof"])
        else:
            v = 0.75 * 70.0 + 0.25 * c.t_out
        out.append(v + e)
    return out


@model("ahu_supply_rh")
def ahu_supply_rh(ctxs: Sequence[Ctx], p: Params, rng: random.Random) -> list[float]:
    """Coil dehumidifies while running; otherwise tracks outdoor humidity."""
    noise = ar1(len(ctxs), rng, 1.2)
    out = []
    for c, e in zip(ctxs, noise, strict=True):
        v = 42.0 + 0.18 * c.rh_out if c.hvac_on else 0.85 * c.rh_out
        out.append(clamp(v + e, 5.0, 100.0))
    return out


@model("ahu_fan_speed")
def ahu_fan_speed(ctxs: Sequence[Ctx], p: Params, rng: random.Random) -> list[float]:
    noise = ar1(len(ctxs), rng, 1.5)
    out = []
    for c, e in zip(ctxs, noise, strict=True):
        target = fan_target(c, p["zones"], p["roof"])
        out.append(clamp(target + e, 0.0, 100.0) if c.hvac_on else 0.0)
    return out


@model("ahu_static_pressure")
def ahu_static_pressure(
    ctxs: Sequence[Ctx], p: Params, rng: random.Random
) -> list[float]:
    """Fan affinity law: duct pressure grows with the square of fan speed."""
    noise = ar1(len(ctxs), rng, 0.02)
    out = []
    for c, e in zip(ctxs, noise, strict=True):
        if not c.hvac_on:
            out.append(0.0)
            continue
        speed = fan_target(c, p["zones"], p["roof"]) / 100.0
        out.append(max(0.0, p["design_inwc"] * speed**2 + e))
    return out


# --- VAV --------------------------------------------------------------------


@model("vav_airflow")
def vav_airflow(ctxs: Sequence[Ctx], p: Params, rng: random.Random) -> list[float]:
    noise = ar1(len(ctxs), rng, 0.03 * p["max_cfm"])
    out = []
    for c, e in zip(ctxs, noise, strict=True):
        out.append(max(0.0, airflow_target(c, p) + e) if c.hvac_on else 0.0)
    return out


@model("vav_damper")
def vav_damper(ctxs: Sequence[Ctx], p: Params, rng: random.Random) -> list[float]:
    """Damper opens roughly in proportion to the airflow it is asked to deliver."""
    noise = ar1(len(ctxs), rng, 2.0)
    out = []
    for c, e in zip(ctxs, noise, strict=True):
        if not c.hvac_on:
            out.append(0.0)
            continue
        opening = 100.0 * airflow_target(c, p) / p["max_cfm"]
        out.append(clamp(opening + e, 0.0, 100.0))
    return out


def _setpoint(c: Ctx, p: Params) -> float:
    return p.get("occupied_f", 72.0) if c.hvac_on else p.get("unoccupied_f", 78.0)


@model("vav_setpoint")
def vav_setpoint(ctxs: Sequence[Ctx], p: Params, rng: random.Random) -> list[float]:
    """Configured value: exact, no noise. 72°F occupied, 78°F setback."""
    return [_setpoint(c, p) for c in ctxs]


@model("vav_room_temp")
def vav_room_temp(ctxs: Sequence[Ctx], p: Params, rng: random.Random) -> list[float]:
    """Room temperature with thermal lag.

    Occupied: controlled toward 72°F, overshooting slightly at high load (hot
    sunny afternoons). Off: drifts slowly toward a balance between indoor mass,
    outdoor air and sun through the windows.
    """
    noise = ar1(len(ctxs), rng, 0.12)
    out = []
    temp: float | None = None
    for c, e in zip(ctxs, noise, strict=True):
        if c.hvac_on:
            target = 71.5 + 1.8 * zone_load(c, p["exposure"], p["roof"])
            alpha = 0.35  # controlled: converges within ~an hour
        else:
            # Thermal mass keeps the building near ~66-70°F overnight.
            solar = 2.0 * p["exposure"] * c.sun * (1 - c.cloud)
            target = 0.8 * 71.0 + 0.2 * c.t_out + solar
            alpha = 0.08  # free-floating: slow building thermal mass
        temp = target if temp is None else temp + alpha * (target - temp)
        out.append(temp + e)
    return out


# --- PV ---------------------------------------------------------------------


@model("pv_irradiance")
def pv_irradiance(ctxs: Sequence[Ctx], p: Params, rng: random.Random) -> list[float]:
    """Plane-of-array irradiance, W/m²: clear-sky sun x cloud attenuation x
    passing-cloud flicker. Exactly 0 at night (no noise when the sun is down)."""
    out = []
    for c, base in zip(ctxs, _irradiance(ctxs, p), strict=True):
        out.append(max(0.0, base + rng.gauss(0, 5.0)) if c.sun > 0 else 0.0)
    return out


@model("pv_power")
def pv_power(ctxs: Sequence[Ctx], p: Params, rng: random.Random) -> list[float]:
    """AC output, kW = capacity x irradiance/1000 x derate (inverter, wiring,
    soiling). Uses the same passing-cloud flicker as the irradiance sensor."""
    out = []
    for c, irr in zip(ctxs, _irradiance(ctxs, p), strict=True):
        if c.sun <= 0:
            out.append(0.0)
            continue
        kw = p["capacity_kw"] * irr / 1000.0 * p["derate"]
        out.append(clamp(kw + rng.gauss(0, 0.3), 0.0, p["capacity_kw"]))
    return out


# --- meter ------------------------------------------------------------------


@model("meter_demand")
def meter_demand(ctxs: Sequence[Ctx], p: Params, rng: random.Random) -> list[float]:
    """Whole-building demand, kW: base load + plug loads x occupancy + lighting
    in occupied mode + HVAC (fans ~ speed³ per affinity law, plus cooling)."""
    noise = ar1(len(ctxs), rng, 2.0)
    floors = p["floors"]
    out = []
    for c, e in zip(ctxs, noise, strict=True):
        kw = p["base_kw"] + p["plug_kw"] * c.occupancy
        if c.hvac_on:
            kw += p["lighting_kw"] * max(c.occupancy, 0.3)
            fans = sum(
                (fan_target(c, f["zones"], f["roof"]) / 100) ** 3 for f in floors
            )
            cooling = sum(floor_load(c, f["zones"], f["roof"]) for f in floors)
            kw += p["hvac_kw"] * (0.4 * fans + 0.6 * cooling) / len(floors)
        out.append(max(0.0, kw + e))
    return out


# --- entry point ------------------------------------------------------------


def simulate_sensor_day(sensor: SensorSpec, day: date) -> list[tuple[datetime, float]]:
    """Healthy (fault-free) readings of one sensor for one building-local day."""
    ctxs = build_context(day)
    fn = MODELS[sensor.model_type]
    values = fn(ctxs, sensor.params, rng_for(sensor.name, day, "noise"))
    return [(c.ts, v) for c, v in zip(ctxs, values, strict=True)]
