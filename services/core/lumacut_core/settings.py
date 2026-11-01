from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class CoreSettings(BaseSettings):
    """Settings shared by the API and the worker, read from LUMACUT_* environment variables.

    Defaults target the dev stack's published host ports (infra/docker-compose.yml).
    """

    model_config = SettingsConfigDict(env_prefix="LUMACUT_", extra="ignore")

    env: Literal["dev", "test", "prod"] = "dev"
    database_url: str = "postgresql+asyncpg://lumacut:lumacut@localhost:15432/lumacut"
    redis_url: str = "redis://localhost:16379/0"
    s3_endpoint_url: str = "http://localhost:18333"
    # Endpoint browsers use. Presigned URLs embed (and sign) this host, so inside Docker it differs
    # from s3_endpoint_url. Defaults to s3_endpoint_url.
    s3_public_endpoint_url: str = ""
    s3_region: str = "us-east-1"
    s3_access_key: str = "lumacut"
    s3_secret_key: str = "lumacut-dev-secret"
    s3_bucket: str = "lumacut"
    log_level: str = "INFO"
    log_json: bool = True

    @model_validator(mode="after")
    def _default_public_endpoint(self) -> "CoreSettings":
        if not self.s3_public_endpoint_url:
            self.s3_public_endpoint_url = self.s3_endpoint_url
        return self
