from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI

from lumacut_api.health import HealthCheck
from lumacut_api.logging import configure_logging
from lumacut_api.resources import open_resources
from lumacut_api.routes import health
from lumacut_api.settings import Settings, get_settings

log = structlog.get_logger()


def create_app(
    settings: Settings | None = None,
    health_checks: Mapping[str, HealthCheck] | None = None,
) -> FastAPI:
    """Build the API. Passing `health_checks` skips opening real connections (unit tests)."""
    settings = settings or get_settings()
    configure_logging(settings.log_level, settings.log_json)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.check_timeout_s = settings.health_check_timeout_s
        if health_checks is not None:
            app.state.health_checks = health_checks
            yield
            return
        async with open_resources(settings) as resources:
            app.state.resources = resources
            app.state.health_checks = resources.health_checks()
            log.info("api.started", bucket=settings.s3_bucket)
            yield
        log.info("api.stopped")

    app = FastAPI(title="Lumacut API", version="0.0.0", lifespan=lifespan)
    app.include_router(health.router)
    return app


def app_factory() -> FastAPI:
    """Entry point for `uvicorn --factory lumacut_api.main:app_factory`."""
    return create_app()
