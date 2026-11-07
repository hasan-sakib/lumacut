"""A `.cube` look-up table is uploaded like any file, validated by the worker, and served as a
rendition the editor downloads and parses."""

import time

import httpx2
import pytest
from api_testkit import LoggedIn, upload_bytes

pytestmark = pytest.mark.integration


def identity_cube(n: int = 3) -> bytes:
    rows = ['TITLE "identity"', f"LUT_3D_SIZE {n}"]
    for b in range(n):
        for g in range(n):
            for r in range(n):
                rows.append(f"{r / (n - 1)} {g / (n - 1)} {b / (n - 1)}")
    return ("\n".join(rows) + "\n").encode()


def wait_done(user: LoggedIn, asset_id: str) -> dict:  # type: ignore[type-arg]
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        asset = user.client.get(f"/api/assets/{asset_id}", headers=user.auth).json()
        if asset["status"] in ("ready", "failed"):
            return dict(asset)
        time.sleep(1)
    raise AssertionError("the LUT was never processed")


def test_a_cube_file_becomes_a_ready_lut_with_a_downloadable_rendition(user: LoggedIn) -> None:
    data = identity_cube()
    asset_id = upload_bytes(user, data, "teal.cube", "application/octet-stream")
    asset = wait_done(user, asset_id)
    assert asset["status"] == "ready", asset
    assert asset["kind"] == "lut"
    assert asset["media"]["lut"] == {"title": "identity", "dimension": 3, "size": 3}
    url = asset["urls"]["lut"]
    assert url
    res = httpx2.get(url, headers={"Origin": "http://localhost:8080"}, timeout=60)
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == "http://localhost:8080"
    assert res.content == data


def test_the_library_can_be_filtered_to_luts(user: LoggedIn) -> None:
    asset_id = upload_bytes(user, identity_cube(2), "a.cube", "")
    wait_done(user, asset_id)
    listed = user.client.get("/api/assets", params={"kind": "lut"}, headers=user.auth).json()
    assert [a["id"] for a in listed["items"]] == [asset_id]


def test_a_broken_cube_file_fails_with_a_message_that_says_what_to_do(user: LoggedIn) -> None:
    asset_id = upload_bytes(user, b"LUT_3D_SIZE 3\n0 0 0\n", "broken.cube", "")
    asset = wait_done(user, asset_id)
    assert asset["status"] == "failed"
    assert asset["errorCode"] == "invalid_lut"
    assert ".cube" in asset["errorMessage"]
