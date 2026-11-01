"""Worker entry point: `python -m lumacut_worker.main`."""

import socket
import sys

import structlog
from redis import Redis
from rq import Worker

from lumacut_core.logging import configure_logging
from lumacut_worker.media_tools import MediaToolsMissingError, media_tool_versions
from lumacut_worker.settings import Settings

log = structlog.get_logger()


def main() -> int:
    settings = Settings()
    configure_logging(settings.log_level, settings.log_json)
    try:
        versions = media_tool_versions()
    except MediaToolsMissingError as exc:
        log.error("worker.media_tools_missing", error=str(exc))
        return 1
    log.info("worker.starting", queues=settings.queues, **versions)
    worker = Worker(
        settings.queues,
        connection=Redis.from_url(settings.redis_url),
        name=f"lumacut-worker-{socket.gethostname()}",
    )
    worker.work()
    return 0


if __name__ == "__main__":
    sys.exit(main())
