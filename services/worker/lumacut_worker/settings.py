from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Worker configuration, read from LUMACUT_* environment variables."""

    model_config = SettingsConfigDict(env_prefix="LUMACUT_", extra="ignore")

    redis_url: str = "redis://localhost:16379/0"
    queues: list[str] = ["default"]
    log_level: str = "INFO"
    log_json: bool = True
