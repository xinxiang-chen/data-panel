from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str
    project_id: str = "demo"
    api_token: str

    # Live simulator worker (app/simulator/worker.py).
    sim_enabled: bool = True  # SIM_ENABLED=false to turn it off (tests, debugging)
    sim_interval_s: int = 60  # how often to top up new samples
    sim_max_catch_up_days: int = 7  # cap on history regenerated after long downtime


@lru_cache
def get_settings() -> Settings:
    return Settings()
