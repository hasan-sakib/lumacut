"""Connections owned by the app lifespan: Postgres, Valkey, the RQ queue and object storage."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager
from dataclasses import dataclass
from typing import TYPE_CHECKING

import structlog
from redis import Redis
from redis.asyncio import Redis as AsyncRedis
from rq import Queue, Worker
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from lumacut_api.health import HealthCheck
from lumacut_api.settings import Settings
from lumacut_core.db import create_engine, create_sessionmaker
from lumacut_core.storage import apply_bucket_cors, ensure_bucket, open_s3

if TYPE_CHECKING:
    # Type stubs are a dev-only dependency; never import them at runtime.
    from types_aiobotocore_s3 import S3Client

log = structlog.get_logger()

MEDIA_QUEUE = "media"


@dataclass(frozen=True)
class Resources:
    settings: Settings
    engine: AsyncEngine
    sessions: async_sessionmaker[AsyncSession]
    redis: AsyncRedis
    sync_redis: Redis
    media_queue: Queue
    s3: S3Client
    s3_public: S3Client  # presigning only: URLs must carry the browser-facing host

    def health_checks(self) -> dict[str, HealthCheck]:
        return {
            "database": self.check_database,
            "queue": self.check_queue,
            "storage": self.check_storage,
            "worker": self.check_worker,
        }

    async def check_database(self) -> None:
        async with self.engine.connect() as conn:
            await conn.execute(text("SELECT 1"))

    async def check_queue(self) -> None:
        await self.redis.ping()

    async def check_storage(self) -> None:
        await self.s3.head_bucket(Bucket=self.settings.s3_bucket)

    async def check_worker(self) -> None:
        count = await asyncio.to_thread(Worker.count, connection=self.sync_redis)
        if count < 1:
            raise RuntimeError("no RQ worker is registered; start the `worker` service")


@asynccontextmanager
async def open_resources(settings: Settings) -> AsyncIterator[Resources]:
    async with AsyncExitStack() as stack:
        engine = create_engine(settings.database_url)
        stack.push_async_callback(engine.dispose)

        redis = AsyncRedis.from_url(settings.redis_url)
        stack.push_async_callback(redis.aclose)
        sync_redis = Redis.from_url(settings.redis_url)
        stack.callback(sync_redis.close)

        s3 = await stack.enter_async_context(open_s3(settings))
        s3_public = await stack.enter_async_context(open_s3(settings, public=True))
        await ensure_bucket(s3, settings.s3_bucket)
        await apply_bucket_cors(s3, settings.s3_bucket, settings.cors_allowed_origins)

        yield Resources(
            settings=settings,
            engine=engine,
            sessions=create_sessionmaker(engine),
            redis=redis,
            sync_redis=sync_redis,
            media_queue=Queue(MEDIA_QUEUE, connection=sync_redis),
            s3=s3,
            s3_public=s3_public,
        )
