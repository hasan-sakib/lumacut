"""Connections to Postgres, Valkey and S3-compatible storage, owned by the app lifespan."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager
from dataclasses import dataclass
from typing import TYPE_CHECKING

import structlog
from aiobotocore.session import get_session
from botocore.exceptions import ClientError
from redis import Redis
from redis.asyncio import Redis as AsyncRedis
from rq import Worker
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from lumacut_api.health import HealthCheck
from lumacut_api.settings import Settings

if TYPE_CHECKING:
    # Type stubs are a dev-only dependency; never import them at runtime.
    from types_aiobotocore_s3 import S3Client

log = structlog.get_logger()


@dataclass(frozen=True)
class Resources:
    settings: Settings
    engine: AsyncEngine
    redis: AsyncRedis
    sync_redis: Redis
    s3: S3Client

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


async def ensure_bucket(s3: S3Client, bucket: str) -> None:
    """Create the asset bucket if it does not exist yet (idempotent)."""
    try:
        await s3.head_bucket(Bucket=bucket)
    except ClientError:
        await s3.create_bucket(Bucket=bucket)
        log.info("storage.bucket_created", bucket=bucket)


@asynccontextmanager
async def open_resources(settings: Settings) -> AsyncIterator[Resources]:
    async with AsyncExitStack() as stack:
        engine = create_async_engine(settings.database_url, pool_pre_ping=True)
        stack.push_async_callback(engine.dispose)

        redis = AsyncRedis.from_url(settings.redis_url)
        stack.push_async_callback(redis.aclose)
        sync_redis = Redis.from_url(settings.redis_url)
        stack.callback(sync_redis.close)

        s3 = await stack.enter_async_context(
            get_session().create_client(
                "s3",
                endpoint_url=settings.s3_endpoint_url,
                region_name=settings.s3_region,
                aws_access_key_id=settings.s3_access_key,
                aws_secret_access_key=settings.s3_secret_key,
            )
        )
        await ensure_bucket(s3, settings.s3_bucket)

        yield Resources(settings=settings, engine=engine, redis=redis, sync_redis=sync_redis, s3=s3)
