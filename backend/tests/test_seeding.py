import os
import subprocess
import sys
from datetime import date

from app.simulator.seeding import rng_for, stable_seed

DAY = date(2026, 11, 20)


def _draws(rng, n=5):
    return [rng.random() for _ in range(n)]


def test_same_keys_give_same_sequence():
    assert _draws(rng_for("DH_AHU1_SaTemp", DAY)) == _draws(
        rng_for("DH_AHU1_SaTemp", DAY)
    )


def test_different_keys_give_different_sequences():
    base = _draws(rng_for("DH_AHU1_SaTemp", DAY))
    assert base != _draws(rng_for("DH_AHU1_SaRh", DAY))  # other sensor
    assert base != _draws(rng_for("DH_AHU1_SaTemp", date(2026, 11, 21)))  # other day
    assert base != _draws(rng_for("DH_AHU1_SaTemp", DAY, "fault"))  # other purpose


def test_separator_prevents_key_collisions():
    assert stable_seed("a|b", "c") != stable_seed("a", "b|c")
    assert stable_seed("ab", "c") != stable_seed("a", "bc")


def test_seed_is_stable_across_processes():
    """The whole point: unlike hash(), the seed must survive a restart.

    Run in fresh interpreters with different PYTHONHASHSEED values, which would
    change hash("...") but must not change stable_seed(...).
    """
    code = (
        "from datetime import date; from app.simulator.seeding import stable_seed; "
        "print(stable_seed('DH_AHU1_SaTemp', date(2026, 11, 20)))"
    )
    outputs = set()
    for hash_seed in ("1", "2"):
        env = {**os.environ, "PYTHONHASHSEED": hash_seed}
        out = subprocess.run(
            [sys.executable, "-c", code],
            env=env,
            capture_output=True,
            text=True,
            check=True,
        )
        outputs.add(out.stdout.strip())
    outputs.add(str(stable_seed("DH_AHU1_SaTemp", DAY)))
    assert len(outputs) == 1
