from lumacut_core.settings import CoreSettings


class Settings(CoreSettings):
    """Worker configuration (LUMACUT_* environment variables)."""

    queues: tuple[str, ...] = ("media", "default")
