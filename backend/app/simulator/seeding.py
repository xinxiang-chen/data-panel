"""Stable random number generators keyed by (sensor, day, ...).

Never seed from Python's built-in hash(): string hashes are salted per process
(PYTHONHASHSEED), so hash("DH_AHU1") changes on every restart and the whole
"history" would be different after each deploy. SHA-256 is stable everywhere.
"""

import hashlib
import random
from datetime import date, datetime

# ASCII "unit separator": can't appear in sensor names or ISO dates, so
# ("a|b", "c") and ("a", "b|c") never collapse into the same seed material.
_SEP = "\x1f"


def _key_to_str(key: object) -> str:
    if isinstance(key, datetime | date):
        return key.isoformat()
    return str(key)


def stable_seed(*keys: object) -> int:
    """64-bit seed derived from the keys; identical across processes and machines."""
    material = _SEP.join(_key_to_str(k) for k in keys).encode()
    return int.from_bytes(hashlib.sha256(material).digest()[:8], "big")


def rng_for(*keys: object) -> random.Random:
    """Independent RNG for a purpose, e.g. rng_for("DH_AHU1_SaTemp", day, "noise").

    Each (sensor, day, purpose) gets its own stream, so adding a new random draw
    to one model never shifts the numbers another model or another day sees.
    """
    return random.Random(stable_seed(*keys))
