"""Resumable multipart uploads against the running stack (API + SeaweedFS)."""

import hashlib
import os
from typing import Any

import httpx2
import pytest
from api_testkit import LoggedIn

from lumacut_api.settings import Settings
from lumacut_core.storage import open_s3

pytestmark = pytest.mark.integration

MIB = 1024 * 1024


def create(
    user: LoggedIn, size: int, name: str = "clip.mp4", mime: str = "video/mp4"
) -> dict[str, Any]:
    res = user.client.post(
        "/api/uploads",
        json={"fileName": name, "sizeBytes": size, "mimeType": mime},
        headers=user.auth,
    )
    assert res.status_code == 201, res.text
    return dict(res.json())


def part_urls(user: LoggedIn, asset_id: str, numbers: list[int]) -> dict[int, str]:
    res = user.client.post(
        f"/api/uploads/{asset_id}/part-urls", json={"partNumbers": numbers}, headers=user.auth
    )
    assert res.status_code == 200, res.text
    return {u["partNumber"]: u["url"] for u in res.json()["urls"]}


def put_part(url: str, chunk: bytes) -> None:
    assert url.startswith("http://localhost:18333/"), url  # browser-reachable endpoint
    res = httpx2.put(url, content=chunk, headers={"Origin": "http://localhost:8080"}, timeout=60)
    assert res.status_code == 200, res.text
    assert res.headers["etag"]
    assert res.headers["access-control-expose-headers"].lower().count("etag") == 1


async def test_upload_resumes_from_storage_state_and_assembles_exactly(user: LoggedIn) -> None:
    data = os.urandom(40 * MIB)
    upload = create(user, len(data))
    part_size = upload["partSizeBytes"]
    assert (upload["partCount"], part_size) == (3, 16 * MIB)
    asset_id = upload["assetId"]
    chunks = {n: data[(n - 1) * part_size : n * part_size] for n in (1, 2, 3)}

    urls = part_urls(user, asset_id, [3, 1])
    put_part(urls[1], chunks[1])
    put_part(urls[3], chunks[3])

    # A client that lost all local state asks the server what already arrived.
    state = user.client.get(f"/api/uploads/{asset_id}", headers=user.auth).json()
    assert state["fileName"] == "clip.mp4"
    assert state["uploadedParts"] == [
        {"partNumber": 1, "sizeBytes": 16 * MIB},
        {"partNumber": 3, "sizeBytes": 8 * MIB},
    ]

    early = user.client.post(f"/api/uploads/{asset_id}/complete", headers=user.auth)
    assert early.status_code == 409
    assert early.json()["error"] == {
        "code": "incomplete_upload",
        "message": "Parts still missing: 2.",
    }

    put_part(part_urls(user, asset_id, [2])[2], chunks[2])
    done = user.client.post(f"/api/uploads/{asset_id}/complete", headers=user.auth)
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "queued" and done.json()["attempts"] == 1

    settings = Settings()
    async with open_s3(settings) as s3:
        key = f"users/{user.user_id}/assets/{asset_id}/original.mp4"
        obj = await s3.get_object(Bucket=settings.s3_bucket, Key=key)
        async with obj["Body"] as body:
            stored = await body.read()
    assert hashlib.sha256(stored).digest() == hashlib.sha256(data).digest()

    again = user.client.post(f"/api/uploads/{asset_id}/complete", headers=user.auth)
    assert again.status_code == 409 and again.json()["error"]["code"] == "upload_finished"


def test_upload_validation_and_ownership(user: LoggedIn, other_user: LoggedIn) -> None:
    too_big = user.client.post(
        "/api/uploads",
        json={"fileName": "huge.mov", "sizeBytes": 21 * 1024**3},
        headers=user.auth,
    )
    assert too_big.status_code == 413 and too_big.json()["error"]["code"] == "file_too_large"
    empty = user.client.post(
        "/api/uploads", json={"fileName": "x.mp4", "sizeBytes": 0}, headers=user.auth
    )
    assert empty.status_code == 422

    upload = create(user, 1024)
    asset_id = upload["assetId"]
    bad_part = user.client.post(
        f"/api/uploads/{asset_id}/part-urls", json={"partNumbers": [2]}, headers=user.auth
    )
    assert bad_part.status_code == 422 and bad_part.json()["error"]["code"] == "invalid_part"
    for res in (
        other_user.client.get(f"/api/uploads/{asset_id}", headers=other_user.auth),
        other_user.client.get(f"/api/assets/{asset_id}", headers=other_user.auth),
        other_user.client.delete(f"/api/assets/{asset_id}", headers=other_user.auth),
    ):
        assert res.status_code == 404
    assert (
        user.client.post("/api/uploads", json={"fileName": "a", "sizeBytes": 1}).status_code == 401
    )


def test_uploading_asset_is_listed_and_cancel_deletes_it(user: LoggedIn) -> None:
    upload = create(user, 2 * MIB, name="holiday/beach day.MOV", mime="video/quicktime")
    asset_id = upload["assetId"]
    put_part(part_urls(user, asset_id, [1])[1], os.urandom(2 * MIB))

    listed = user.client.get("/api/assets", headers=user.auth).json()
    item = next(a for a in listed["items"] if a["id"] == asset_id)
    assert item["status"] == "uploading" and item["name"] == "beach day.MOV"
    assert item["kind"] == "video" and item["urls"]["poster"] is None

    assert user.client.delete(f"/api/assets/{asset_id}", headers=user.auth).status_code == 204
    assert user.client.get(f"/api/assets/{asset_id}", headers=user.auth).status_code == 404
    gone = user.client.get(f"/api/uploads/{asset_id}", headers=user.auth)
    assert gone.status_code == 404
