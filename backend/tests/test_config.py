"""APP_ENV=production refuses to start with a weak API_TOKEN."""

import pytest
from pydantic import ValidationError

from app.config import Settings

DB = "postgresql+asyncpg://u:p@localhost:5433/x"
STRONG = "a" * 64  # stands in for `openssl rand -hex 32`


def make(**kwargs) -> Settings:
    # _env_file=None: ignore the developer's backend/.env.
    return Settings(_env_file=None, database_url=DB, **kwargs)


def test_development_accepts_any_token():
    assert make(api_token="dev").app_env == "development"


def test_production_accepts_a_strong_token():
    assert make(app_env="production", api_token=STRONG).api_token == STRONG


@pytest.mark.parametrize("token", ["dev", "changeme", "short-but-not-weak", "x" * 31])
def test_production_rejects_weak_tokens(token):
    with pytest.raises(ValidationError, match="openssl rand -hex 32"):
        make(app_env="production", api_token=token)
