from functools import lru_cache
from typing import Literal, Self

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Tokens that are fine on a laptop but must never guard a public deployment.
WEAK_TOKENS = {"dev", "test", "changeme", "secret", "token", "password"}
MIN_PRODUCTION_TOKEN_LENGTH = 32


class Settings(BaseSettings):
    """Read from environment variables, falling back to backend/.env.

    See .env.example for every variable and what to set in production.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # "production" turns on the startup checks below.
    app_env: Literal["development", "production"] = "development"

    database_url: str
    project_id: str = "demo"
    api_token: str

    # Live simulator worker (app/simulator/worker.py).
    sim_enabled: bool = True  # SIM_ENABLED=false to turn it off (tests, debugging)
    sim_interval_s: int = 60  # how often to top up new samples
    sim_max_catch_up_days: int = 7  # cap on history regenerated after long downtime

    @model_validator(mode="after")
    def check_production(self) -> Self:
        """Fail fast at startup rather than serve the demo with a guessable token."""
        if self.app_env != "production":
            return self
        token = self.api_token.strip()
        if token.lower() in WEAK_TOKENS or len(token) < MIN_PRODUCTION_TOKEN_LENGTH:
            raise ValueError(
                f"APP_ENV=production needs an API_TOKEN of at least "
                f"{MIN_PRODUCTION_TOKEN_LENGTH} random characters "
                "(generate one with: openssl rand -hex 32)"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
