from lumacut_core.settings import CoreSettings


class Settings(CoreSettings):
    """Worker configuration (LUMACUT_* environment variables)."""

    queues: tuple[str, ...] = ("media", "default")
    #: The built render page (apps/render-page `vite build`), served to Chromium by export jobs.
    render_page_dir: str = "/app/render-page"
