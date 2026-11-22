import math
from datetime import date, timedelta
from statistics import correlation, mean

import pytest

from app.simulator.catalog import ALWAYS_OFFLINE, CATALOG, SENSORS_BY_NAME
from app.simulator.context import build_context
from app.simulator.models import MODELS, simulate_sensor_day
from app.simulator.weather import Sky, sky_on

TODAY = date(2026, 11, 21)
LAST_90 = [TODAY - timedelta(days=i) for i in range(90, 0, -1)]
FRIDAY = date(2026, 11, 20)
SATURDAY = date(2026, 11, 21)


def values(name: str, day: date) -> list[float]:
    return [v for _, v in simulate_sensor_day(SENSORS_BY_NAME[name], day)]


def at_hour(name: str, day: date, hour: float) -> float:
    ctxs = build_context(day)
    i = min(range(len(ctxs)), key=lambda k: abs(ctxs[k].hour - hour))
    return values(name, day)[i]


# --- catalog ----------------------------------------------------------------


def test_catalog_size_and_unique_names():
    names = [s.name for d in CATALOG for s in d.sensors]
    assert len(CATALOG) == 17
    assert len(names) == 66
    assert len(set(names)) == len(names)
    assert len({d.name for d in CATALOG}) == len(CATALOG)


def test_every_model_type_is_registered():
    assert {s.model_type for s in SENSORS_BY_NAME.values()} <= set(MODELS)


def test_sensor_names_are_prefixed_by_their_device():
    for d in CATALOG:
        for s in d.sensors:
            assert s.name.startswith(d.name + "_")
            assert s.params["device"] == d.name


def test_always_offline_sensors_exist_and_are_flagged():
    for name in ALWAYS_OFFLINE:
        assert SENSORS_BY_NAME[name].params.get("always_offline") is True
    flagged = {n for n, s in SENSORS_BY_NAME.items() if s.params.get("always_offline")}
    assert flagged == ALWAYS_OFFLINE


# --- all models -------------------------------------------------------------


def test_simulation_is_deterministic():
    for s in SENSORS_BY_NAME.values():
        assert simulate_sensor_day(s, FRIDAY) == simulate_sensor_day(s, FRIDAY)


@pytest.mark.parametrize("name", sorted(SENSORS_BY_NAME))
def test_healthy_values_stay_in_expected_range(name):
    lo, hi = SENSORS_BY_NAME[name].expected_range
    for day in LAST_90[-21:]:  # three weeks: weekdays, weekends, mixed weather
        for v in values(name, day):
            assert math.isfinite(v)
            assert lo <= v <= hi, f"{name} {day}: {v} not in [{lo}, {hi}]"


# --- PV ---------------------------------------------------------------------


def test_pv_is_zero_at_night():
    for name in ("DH_PV1_Power", "DH_PV1_Irradiance"):
        assert at_hour(name, FRIDAY, 2) == 0.0
        assert at_hour(name, FRIDAY, 22) == 0.0


def test_pv_energy_is_lower_on_cloudy_days():
    energy = {s: [] for s in Sky}
    for day in LAST_90:
        energy[sky_on(day)].append(sum(values("DH_PV1_Power", day)) / 6)  # kWh
    avg = {s: mean(v) for s, v in energy.items()}
    assert avg[Sky.SUNNY] > avg[Sky.PARTLY] > avg[Sky.OVERCAST]
    assert avg[Sky.OVERCAST] < 0.5 * avg[Sky.SUNNY]


def test_pv_power_tracks_irradiance():
    power = [v for d in LAST_90[-7:] for v in values("DH_PV1_Power", d)]
    irr = [v for d in LAST_90[-7:] for v in values("DH_PV1_Irradiance", d)]
    assert correlation(power, irr) > 0.98


# --- VAV / AHU --------------------------------------------------------------


def test_hvac_runs_on_weekdays_only():
    assert at_hour("DH_VAV_F1_01_Airflow", FRIDAY, 10) > 100
    assert at_hour("DH_VAV_F1_01_Airflow", FRIDAY, 3) == 0.0
    assert max(values("DH_VAV_F1_01_Airflow", SATURDAY)) == 0.0
    assert at_hour("DH_AHU1_FanSpeed", FRIDAY, 10) > 35
    assert at_hour("DH_AHU1_FanSpeed", FRIDAY, 22) == 0.0


def test_sunnier_zones_need_more_air():
    south = mean(values("DH_VAV_F2_01_Airflow", FRIDAY))
    north = mean(values("DH_VAV_F2_04_Airflow", FRIDAY))
    assert south > north


def test_setpoint_schedule():
    assert at_hour("DH_VAV_F1_01_Setpoint", FRIDAY, 10) == 72.0
    assert at_hour("DH_VAV_F1_01_Setpoint", FRIDAY, 22) == 78.0
    assert set(values("DH_VAV_F1_01_Setpoint", SATURDAY)) == {78.0}


def test_room_temperature_is_controlled_when_occupied():
    for day in LAST_90[-14:]:
        if day.weekday() < 5:
            assert 70.5 <= at_hour("DH_VAV_F1_01_RoomTemp", day, 11) <= 74.5


def test_room_temperature_drifts_mildly_at_night():
    for day in LAST_90[-14:]:
        assert 62 <= at_hour("DH_VAV_F1_01_RoomTemp", day, 4) <= 72


def test_ahu_fan_follows_its_floor_airflow():
    """Coherence: the AHU fan and the VAVs it serves share the same zone loads."""
    fan = values("DH_AHU2_FanSpeed", FRIDAY)
    floor_flow = [
        sum(vs)
        for vs in zip(
            *(values(f"DH_VAV_F2_0{i}_Airflow", FRIDAY) for i in range(1, 5)),
            strict=True,
        )
    ]
    assert correlation(fan, floor_flow) > 0.9


def test_static_pressure_rises_with_fan_speed():
    fan = values("DH_AHU1_FanSpeed", FRIDAY)
    pressure = values("DH_AHU1_SaPressure", FRIDAY)
    assert correlation(fan, pressure) > 0.9


# --- meter ------------------------------------------------------------------


def test_building_demand_is_higher_on_weekday_afternoons():
    assert at_hour("DH_MTR1_Demand", FRIDAY, 14) > 2 * at_hour(
        "DH_MTR1_Demand", FRIDAY, 3
    )
    assert mean(values("DH_MTR1_Demand", FRIDAY)) > mean(
        values("DH_MTR1_Demand", SATURDAY)
    )
