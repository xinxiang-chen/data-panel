"""Building digital-twin simulator for the fictional "Demo Hall".

Generates deterministic, physically plausible sensor readings: the value of a
sensor at a given time depends only on (sensor, time), never on when the
generator happened to run (backfill vs. the live worker).
"""
