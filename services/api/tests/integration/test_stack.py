"""Integration tests against the running Docker stack (`make test-stack`)."""

import os
import uuid

import httpx2
import pytest

from lumacut_api.settings import Settings
from lumacut_core.storage import open_s3

pytestmark = pytest.mark.integration

API_URL = os.environ.get("LUMACUT_API_URL", "http://localhost:8000")


def test_health_reports_every_dependency_ok() -> None:
    res = httpx2.get(f"{API_URL}/api/health", timeout=10)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "ok"
    assert set(body["checks"]) == {"database", "queue", "storage", "worker"}
    assert all(check["status"] == "ok" for check in body["checks"].values()), body


async def test_object_storage_round_trip() -> None:
    settings = Settings()  # host-side defaults point at the published stack ports
    key = f"integration/{uuid.uuid4()}.bin"
    payload = os.urandom(256 * 1024)
    async with open_s3(settings) as s3:
        await s3.put_object(Bucket=settings.s3_bucket, Key=key, Body=payload)
        try:
            obj = await s3.get_object(Bucket=settings.s3_bucket, Key=key)
            async with obj["Body"] as stream:
                assert await stream.read() == payload
        finally:
            await s3.delete_object(Bucket=settings.s3_bucket, Key=key)
