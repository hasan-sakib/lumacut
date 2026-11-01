from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """API configuration, read from LUMACUT_* environment variables."""

    model_config = SettingsConfigDict(env_prefix="LUMACUT_", extra="ignore")

    database_url: str = "postgresql+asyncpg://lumacut:lumacut@localhost:15432/lumacut"
    redis_url: str = "redis://localhost:16379/0"
    s3_endpoint_url: str = "http://localhost:18333"
    s3_region: str = "us-east-1"
    s3_access_key: str = "lumacut"
    s3_secret_key: str = "lumacut-dev-secret"
    s3_bucket: str = "lumacut"
    log_level: str = "INFO"
    log_json: bool = True
    health_check_timeout_s: float = 2.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
