"""Browsers read media from storage with HTTP range requests; CORS must let them see the result."""

import os
import uuid

import httpx2
import pytest

from lumacut_api.settings import Settings
from lumacut_core.storage import open_s3, presign_get

pytestmark = pytest.mark.integration

ALLOWED_ORIGIN = "http://localhost:8080"


async def test_range_responses_expose_content_range_to_allowed_origins() -> None:
    settings = Settings()
    key = f"integration/cors-{uuid.uuid4()}.bin"
    payload = os.urandom(64 * 1024)
    async with open_s3(settings) as s3, open_s3(settings, public=True) as s3_public:
        await s3.put_object(Bucket=settings.s3_bucket, Key=key, Body=payload)
        try:
            url = await presign_get(s3_public, settings.s3_bucket, key)
            res = httpx2.get(url, headers={"Origin": ALLOWED_ORIGIN, "Range": "bytes=0-1023"})
        finally:
            await s3.delete_object(Bucket=settings.s3_bucket, Key=key)
    assert res.status_code == 206
    assert res.headers["content-range"] == f"bytes 0-1023/{len(payload)}"
    assert res.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    exposed = {h.strip().lower() for h in res.headers["access-control-expose-headers"].split(",")}
    assert {"content-range", "accept-ranges", "content-length", "etag"} <= exposed
