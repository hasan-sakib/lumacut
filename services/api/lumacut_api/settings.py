from functools import lru_cache

from pydantic import model_validator

from lumacut_core.settings import CoreSettings

# Documented dev placeholder; Settings refuses it unless LUMACUT_ENV=dev.
DEV_JWT_SECRET = "dev-only-insecure-jwt-secret-change-me"
MIB = 1024 * 1024


class Settings(CoreSettings):
    """API configuration (LUMACUT_* environment variables)."""

    jwt_secret: str = DEV_JWT_SECRET
    access_token_ttl_s: int = 15 * 60
    refresh_token_ttl_s: int = 30 * 24 * 3600
    # Secure cookies need HTTPS; the dev stack is plain HTTP on localhost.
    cookie_secure: bool = False
    upload_part_size_bytes: int = 16 * MIB
    max_upload_bytes: int = 20 * 1024 * MIB
    health_check_timeout_s: float = 2.0

    @model_validator(mode="after")
    def _require_real_secret_outside_dev(self) -> "Settings":
        if self.env != "dev" and self.jwt_secret == DEV_JWT_SECRET:
            raise ValueError(
                "LUMACUT_JWT_SECRET must be set to a random secret when LUMACUT_ENV is not 'dev'"
            )
        if len(self.jwt_secret.encode()) < 32:
            raise ValueError("LUMACUT_JWT_SECRET must be at least 32 bytes (HS256 key length)")
        if self.upload_part_size_bytes < 5 * MIB:
            raise ValueError("LUMACUT_UPLOAD_PART_SIZE_BYTES must be at least 5 MiB (S3 minimum)")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
