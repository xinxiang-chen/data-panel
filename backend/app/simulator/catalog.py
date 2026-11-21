"""Demo Hall: the fictional building's devices and sensors.

Layout: 3 floors. Each floor has its own AHU (air handling unit) feeding 4 VAV
boxes (zones) facing different directions. A rooftop PV array and a main
electricity meter complete the picture: 3 AHU x 5 + 12 VAV x 4 + PV x 2 +
meter x 1 = 66 sensors.

Every sensor's `params` is self-contained: it holds everything its model needs
(e.g. an AHU knows the exposures of the zones it serves). The same dict is
stored in the sensors.params JSONB column, so the database fully describes how
each sensor is simulated.
"""

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class SensorSpec:
    name: str
    description: str
    unit: str
    model_type: str
    params: Mapping[str, Any] = field(default_factory=dict)
    # Physically plausible bounds of healthy readings (tests check models stay
    # inside; faults in step 2.4 deliberately break out of them).
    expected_range: tuple[float, float] = (float("-inf"), float("inf"))


@dataclass(frozen=True)
class DeviceSpec:
    name: str
    display_name: str
    description: str
    kind: str  # ahu / vav / pv / meter
    sensors: tuple[SensorSpec, ...]


# Zone orientation -> how much afternoon/solar gain it gets (south and west hot).
_ZONES: tuple[tuple[str, str, float, float], ...] = (
    # (index, facing, solar exposure, max airflow CFM)
    ("01", "south", 1.0, 600.0),
    ("02", "west", 0.7, 520.0),
    ("03", "east", 0.5, 480.0),
    ("04", "north", 0.3, 420.0),
)
FLOORS = (1, 2, 3)
_TOP_FLOOR = 3  # roof gains

# Sensors that never report (dead points). The original building also had a
# discharge-humidity sensor that always returned null.
ALWAYS_OFFLINE = frozenset({"DH_AHU3_SaRh", "DH_VAV_F3_04_Damper"})


def _floor_zones(floor: int) -> list[dict[str, Any]]:
    return [{"exposure": exp, "max_cfm": cfm} for _, _, exp, cfm in _ZONES]


def _sensor(
    device: str,
    suffix: str,
    description: str,
    unit: str,
    model_type: str,
    params: dict[str, Any],
    expected_range: tuple[float, float],
) -> SensorSpec:
    name = f"{device}_{suffix}"
    full_params = {"device": device, **params}
    if name in ALWAYS_OFFLINE:
        full_params["always_offline"] = True
    return SensorSpec(name, description, unit, model_type, full_params, expected_range)


def _ahu(floor: int) -> DeviceSpec:
    name = f"DH_AHU{floor}"
    served = {
        "floor": floor,
        "roof": floor == _TOP_FLOOR,
        "zones": _floor_zones(floor),
    }
    return DeviceSpec(
        name=name,
        display_name=f"Air Handling Unit {floor}",
        description=f"Variable-air-volume AHU serving floor {floor}",
        kind="ahu",
        sensors=(
            _sensor(
                name,
                "SaTemp",
                "Supply Air Temperature, Analog Input, °F",
                "°F",
                "ahu_supply_temp",
                {**served, "setpoint_f": 55.0},
                (50.0, 75.0),
            ),
            _sensor(
                name,
                "RaTemp",
                "Return Air Temperature, Analog Input, °F",
                "°F",
                "ahu_return_temp",
                served,
                (55.0, 85.0),
            ),
            _sensor(
                name,
                "SaRh",
                "Supply Air Humidity, Analog Input, %RH",
                "%RH",
                "ahu_supply_rh",
                served,
                (5.0, 100.0),
            ),
            _sensor(
                name,
                "FanSpeed",
                "Supply Fan Speed, Analog Output, %",
                "%",
                "ahu_fan_speed",
                served,
                (0.0, 100.0),
            ),
            _sensor(
                name,
                "SaPressure",
                "Supply Duct Static Pressure, Analog Input, inWC",
                "inWC",
                "ahu_static_pressure",
                {**served, "design_inwc": 1.8},
                (0.0, 2.5),
            ),
        ),
    )


def _vav(
    floor: int, index: str, facing: str, exposure: float, max_cfm: float
) -> DeviceSpec:
    name = f"DH_VAV_F{floor}_{index}"
    zone = {
        "floor": floor,
        "roof": floor == _TOP_FLOOR,
        "exposure": exposure,
        "max_cfm": max_cfm,
        "min_cfm": round(0.3 * max_cfm),
    }
    return DeviceSpec(
        name=name,
        display_name=f"VAV Box F{floor}-{index} ({facing})",
        description=f"Variable air volume box, floor {floor}, {facing}-facing zone",
        kind="vav",
        sensors=(
            _sensor(
                name,
                "Airflow",
                "Discharge Airflow, Analog Input, CFM",
                "CFM",
                "vav_airflow",
                zone,
                (0.0, max_cfm * 1.2),
            ),
            _sensor(
                name,
                "RoomTemp",
                "Room Temperature, Analog Input, °F",
                "°F",
                "vav_room_temp",
                zone,
                (55.0, 90.0),
            ),
            _sensor(
                name,
                "Damper",
                "Damper Position, Analog Output, %",
                "%",
                "vav_damper",
                zone,
                (0.0, 100.0),
            ),
            _sensor(
                name,
                "Setpoint",
                "Room Temperature Setpoint, Analog Value, °F",
                "°F",
                "vav_setpoint",
                {"occupied_f": 72.0, "unoccupied_f": 78.0},
                (70.0, 80.0),
            ),
        ),
    )


_PV_CAPACITY_KW = 120.0


def _pv() -> DeviceSpec:
    name = "DH_PV1"
    array = {"capacity_kw": _PV_CAPACITY_KW, "derate": 0.82}
    return DeviceSpec(
        name=name,
        display_name="Rooftop PV Array",
        description=f"{_PV_CAPACITY_KW:.0f} kW rooftop solar array",
        kind="pv",
        sensors=(
            _sensor(
                name,
                "Power",
                "PV AC Power Output, Analog Input, kW",
                "kW",
                "pv_power",
                array,
                (0.0, _PV_CAPACITY_KW * 1.05),
            ),
            _sensor(
                name,
                "Irradiance",
                "Plane-of-Array Irradiance, Analog Input, W/m²",
                "W/m²",
                "pv_irradiance",
                array,
                (0.0, 1100.0),
            ),
        ),
    )


def _meter() -> DeviceSpec:
    name = "DH_MTR1"
    return DeviceSpec(
        name=name,
        display_name="Main Electricity Meter",
        description="Whole-building electrical demand (before PV offset)",
        kind="meter",
        sensors=(
            _sensor(
                name,
                "Demand",
                "Building Electrical Demand, Analog Input, kW",
                "kW",
                "meter_demand",
                {
                    "base_kw": 45.0,
                    "plug_kw": 55.0,
                    "lighting_kw": 30.0,
                    "hvac_kw": 110.0,
                    "floors": [
                        {"roof": f == _TOP_FLOOR, "zones": _floor_zones(f)}
                        for f in FLOORS
                    ],
                },
                (0.0, 400.0),
            ),
        ),
    )


CATALOG: tuple[DeviceSpec, ...] = (
    *(_ahu(f) for f in FLOORS),
    *(
        _vav(f, idx, facing, exp, cfm)
        for f in FLOORS
        for idx, facing, exp, cfm in _ZONES
    ),
    _pv(),
    _meter(),
)

SENSORS_BY_NAME: dict[str, SensorSpec] = {s.name: s for d in CATALOG for s in d.sensors}
