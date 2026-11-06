from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI

from lumacut_api.errors import install_error_handlers, use_error_shape_in_openapi
from lumacut_api.health import HealthCheck
from lumacut_api.resources import open_resources
from lumacut_api.routes import assets, auth, events, health, projects, uploads
from lumacut_api.settings import Settings, get_settings
from lumacut_core.logging import configure_logging

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
    install_error_handlers(app)
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(uploads.router)
    app.include_router(assets.router)
    app.include_router(projects.router)
    app.include_router(events.router)
    use_error_shape_in_openapi(app)
    return app


def app_factory() -> FastAPI:
    """Entry point for `uvicorn --factory lumacut_api.main:app_factory`."""
    return create_app()
