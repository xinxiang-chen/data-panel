"""seed --reset must not wipe a non-local database without --yes."""

import pytest

from scripts.guards import describe_target, is_local_database, reset_refusal

LOCAL = "postgresql+asyncpg://postgres:postgres@localhost:5433/sensor_sim"
COMPOSE = "postgresql+asyncpg://app:s3cret@db:5432/sensor_sim"
MANAGED = "postgresql+asyncpg://app:s3cret@ep-x.aws.example.com/sensor_sim?ssl=require"


@pytest.mark.parametrize(
    "url",
    [
        LOCAL,
        "postgresql+asyncpg://u:p@127.0.0.1:5432/x",
        "postgresql+asyncpg://u:p@[::1]:5432/x",
        "postgresql+asyncpg:///x",  # Unix socket
    ],
)
def test_local_urls(url):
    assert is_local_database(url)
    assert reset_refusal(url, confirmed=False) is None


@pytest.mark.parametrize("url", [COMPOSE, MANAGED])
def test_remote_reset_needs_yes(url):
    assert not is_local_database(url)
    refusal = reset_refusal(url, confirmed=False)
    assert refusal is not None
    assert "--yes" in refusal
    assert reset_refusal(url, confirmed=True) is None


def test_messages_never_show_the_password():
    assert describe_target(MANAGED) == "ep-x.aws.example.com/sensor_sim"
    assert "s3cret" not in reset_refusal(COMPOSE, confirmed=False)
