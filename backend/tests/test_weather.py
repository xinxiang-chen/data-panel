from datetime import UTC, date, datetime, timedelta
from itertools import groupby, pairwise

import pytest

from app.simulator import weather
from app.simulator.clock import BUILDING_TZ, day_grid
from app.simulator.weather import (
    EPOCH,
    Sky,
    clear_cache,
    cloud_cover,
    daily_weather,
    diurnal_shape,
    outdoor_rh,
    outdoor_temp_f,
    sky_on,
)

YEAR = [date(2026, 1, 1) + timedelta(days=i) for i in range(365)]


def local(y, mo, d, h=0, mi=0) -> datetime:
    return datetime(y, mo, d, h, mi, tzinfo=BUILDING_TZ).astimezone(UTC)


@pytest.fixture(autouse=True)
def _fresh_cache():
    clear_cache()
    yield
    clear_cache()


# --- determinism ------------------------------------------------------------


def test_daily_weather_is_deterministic():
    first = [daily_weather(d) for d in YEAR[:60]]
    clear_cache()
    assert [daily_weather(d) for d in YEAR[:60]] == first


def test_result_does_not_depend_on_computation_order():
    late_first = sky_on(date(2026, 11, 20))
    clear_cache()
    for d in YEAR:  # walk the chain day by day instead
        sky_on(d)
    assert sky_on(date(2026, 11, 20)) == late_first


def test_before_epoch_is_rejected():
    with pytest.raises(ValueError):
        sky_on(EPOCH - timedelta(days=1))


# --- sky condition chain ----------------------------------------------------


def _overcast_streaks(days):
    skies = [sky_on(d) for d in days]
    return [len(list(g)) for sky, g in groupby(skies) if sky is Sky.OVERCAST]


def test_overcast_spells_last_several_days():
    streaks = _overcast_streaks(YEAR)
    assert max(streaks) >= 3
    # Independent daily draws would average ~1.2 days per spell.
    assert sum(streaks) / len(streaks) > 1.6


def test_sky_mix_is_mostly_sunny():
    skies = [sky_on(d) for d in YEAR]
    share = {s: skies.count(s) / len(skies) for s in Sky}
    assert share[Sky.SUNNY] > 0.4
    assert 0.1 < share[Sky.OVERCAST] < 0.4


def test_recent_90_days_contain_an_overcast_spell():
    """The backfill window must have something for 'infer bad weather' to find."""
    window = [date(2026, 11, 21) - timedelta(days=i) for i in range(90, 0, -1)]
    assert max(_overcast_streaks(window)) >= 2


def test_cloud_cover_matches_sky():
    by_sky = {s: [] for s in Sky}
    for d in YEAR:
        w = daily_weather(d)
        assert 0.0 <= w.cloud_cover <= 1.0
        by_sky[w.sky].append(w.cloud_cover)
    avg = {s: sum(v) / len(v) for s, v in by_sky.items()}
    assert avg[Sky.SUNNY] < avg[Sky.PARTLY] < avg[Sky.OVERCAST]


# --- temperature and humidity -----------------------------------------------


def test_diurnal_shape_extremes():
    assert diurnal_shape(6.0) == pytest.approx(-1.0)
    assert diurnal_shape(15.0) == pytest.approx(1.0)
    assert -1.0 <= diurnal_shape(0.0) <= 1.0


def test_seasons():
    jan = [daily_weather(date(2026, 1, d)).temp_mean_f for d in range(1, 31)]
    jul = [daily_weather(date(2026, 7, d)).temp_mean_f for d in range(1, 31)]
    assert sum(jul) / len(jul) > sum(jan) / len(jan) + 10


def test_november_temperatures_are_plausible():
    temps = [
        outdoor_temp_f(t) for d in range(1, 31) for t in day_grid(date(2026, 11, d))
    ]
    assert 35 < min(temps) and max(temps) < 85


def test_afternoon_is_warmer_than_dawn():
    for d in range(1, 31):
        assert outdoor_temp_f(local(2026, 11, d, 15)) > outdoor_temp_f(
            local(2026, 11, d, 6)
        )


def test_overcast_days_have_smaller_swing():
    swings = {s: [] for s in Sky}
    for d in YEAR:
        w = daily_weather(d)
        swings[w.sky].append(w.temp_swing_f)
    assert max(swings[Sky.OVERCAST]) < min(swings[Sky.SUNNY])


def test_temperature_is_continuous_across_midnight():
    """Daily parameters are blended noon-to-noon, so no jump at local midnight."""
    points = [t for d in range(1, 31) for t in day_grid(date(2026, 11, d))]
    temps = [outdoor_temp_f(t) for t in points]
    assert max(abs(b - a) for a, b in pairwise(temps)) < 1.0


def test_humidity_bounds_and_inverse_to_temperature():
    for d in range(1, 31):
        dawn, afternoon = local(2026, 11, d, 6), local(2026, 11, d, 15)
        assert 5 <= outdoor_rh(dawn) <= 100
        assert outdoor_rh(afternoon) < outdoor_rh(dawn)


def test_cloud_cover_is_per_local_day():
    day = date(2026, 11, 20)
    values = {cloud_cover(t) for t in day_grid(day)}
    assert values == {daily_weather(day).cloud_cover}


def test_daily_weather_is_cached():
    daily_weather.cache_clear()
    for _ in range(3):
        daily_weather(date(2026, 11, 20))
    assert daily_weather.cache_info().hits == 2
    assert weather.daily_weather is daily_weather
