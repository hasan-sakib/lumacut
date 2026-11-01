"""End to end: upload sample media → worker pipeline → SSE progress → presigned renditions."""

import json
import os
from pathlib import Path

import httpx2
import pytest
from api_testkit import EventCollector, LoggedIn, upload_bytes

pytestmark = pytest.mark.integration

SAMPLES = Path(os.environ.get("LUMACUT_SAMPLES_DIR", "samples/generated"))


def sample(name: str) -> bytes:
    path = SAMPLES / name
    assert path.exists(), f"{path} missing: run `make samples` first"
    return path.read_bytes()


def get_asset(user: LoggedIn, asset_id: str) -> dict:  # type: ignore[type-arg]
    res = user.client.get(f"/api/assets/{asset_id}", headers=user.auth)
    assert res.status_code == 200, res.text
    return dict(res.json())


def test_video_is_processed_with_live_progress_and_all_renditions(user: LoggedIn) -> None:
    with EventCollector(user) as sse:
        asset_id = upload_bytes(user, sample("fn_1080p30.mp4"), "fn_1080p30.mp4", "video/mp4")
        sse.wait_for(
            lambda e: (
                e.event == "asset"
                and e.data["assetId"] == asset_id
                and e.data["status"] in ("ready", "failed")
            ),
            timeout_s=240,
        )
    states = sse.for_asset(asset_id)
    assert states[0]["status"] == "queued" and states[-1]["status"] == "ready"
    processing = [s for s in states if s["status"] == "processing"]
    stages = list(dict.fromkeys(s["stage"] for s in processing))
    assert stages[:3] == ["download", "probe", "proxy"] and "waveform" in stages
    progress = [s["progress"] for s in processing]
    assert progress == sorted(progress) and len(progress) >= 5

    asset = get_asset(user, asset_id)
    assert asset["kind"] == "video" and asset["readyAt"]
    video = asset["media"]["video"]
    assert (video["width"], video["height"], video["fps"]) == (1920, 1080, {"num": 30, "den": 1})
    assert abs(video["durationUs"] - 10_000_000) < 100_000
    urls = asset["urls"]
    assert urls["poster"] and urls["thumbIndex"] and len(urls["thumbSheets"]) == 1
    for name in ("poster", "proxy", "waveform", "thumbIndex"):
        res = httpx2.get(urls[name], headers={"Origin": "http://localhost:8080"}, timeout=60)
        assert res.status_code == 200, (name, res.status_code)
        assert res.headers["access-control-allow-origin"] == "http://localhost:8080"
    index = httpx2.get(urls["thumbIndex"]).json()
    assert (index["count"], index["intervalUs"]) == (10, 1_000_000)
    waveform = httpx2.get(urls["waveform"]).json()
    assert waveform["version"] == 2 and abs(waveform["length"] - 1000) <= 2
    proxy = httpx2.get(urls["proxy"], headers={"Range": "bytes=0-1023"})
    assert proxy.status_code == 206 and proxy.headers["content-type"] == "video/mp4"


def test_image_is_processed(user: LoggedIn) -> None:
    with EventCollector(user) as sse:
        asset_id = upload_bytes(user, sample("img_6000x4000.jpg"), "photo.jpg", "image/jpeg")
        sse.wait_for(
            lambda e: (
                e.event == "asset" and e.data["assetId"] == asset_id and e.data["status"] == "ready"
            ),
            timeout_s=120,
        )
    asset = get_asset(user, asset_id)
    assert asset["kind"] == "image"
    assert asset["media"]["image"] == {"width": 6000, "height": 4000}
    assert asset["media"]["downscaledFrom"] is None
    for name in ("normalized", "preview", "thumb"):
        assert httpx2.get(asset["urls"][name]).status_code == 200


def test_damaged_file_fails_clearly_and_retry_runs_again(user: LoggedIn) -> None:
    data = sample("fn_1080p30.mp4")
    with EventCollector(user) as sse:
        asset_id = upload_bytes(user, data[: int(len(data) * 0.4)], "broken.mp4", "video/mp4")
        sse.wait_for(
            lambda e: (
                e.event == "asset"
                and e.data["assetId"] == asset_id
                and e.data["status"] == "failed"
            ),
            timeout_s=180,
        )
        failed = get_asset(user, asset_id)
        assert failed["errorCode"] == "corrupt_file"
        assert failed["errorMessage"].startswith("The file is damaged or incomplete")
        assert failed["attempts"] == 1

        retry = user.client.post(f"/api/assets/{asset_id}/retry", headers=user.auth)
        assert retry.status_code == 200 and retry.json()["status"] == "queued"
        sse.wait_for(
            lambda e: (
                e.event == "asset"
                and e.data["assetId"] == asset_id
                and e.data["status"] == "failed"
                and e.data["attempts"] == 2
            ),
            timeout_s=180,
        )
    snapshot = next(e for e in sse.events if e.event == "snapshot")
    assert isinstance(snapshot.data, list)


def test_search_retry_rules_and_delete_removes_everything(user: LoggedIn) -> None:
    with EventCollector(user) as sse:
        asset_id = upload_bytes(user, sample("audio_tone.mp3"), "Interview tone.mp3", "audio/mpeg")
        sse.wait_for(
            lambda e: (
                e.event == "asset" and e.data["assetId"] == asset_id and e.data["status"] == "ready"
            ),
            timeout_s=120,
        )
    asset = get_asset(user, asset_id)
    assert asset["kind"] == "audio" and asset["urls"]["poster"] is None
    assert asset["urls"]["waveform"] and asset["urls"]["proxy"]

    found = user.client.get("/api/assets", params={"q": "TONE"}, headers=user.auth).json()
    assert [a["id"] for a in found["items"]] == [asset_id]
    assert (
        user.client.get("/api/assets", params={"q": "zzz"}, headers=user.auth).json()["total"] == 0
    )
    assert (
        user.client.get("/api/assets", params={"kind": "image"}, headers=user.auth).json()["total"]
        == 0
    )

    again = user.client.post(f"/api/assets/{asset_id}/retry", headers=user.auth)
    assert again.status_code == 409 and again.json()["error"]["code"] == "not_failed"

    proxy_url = asset["urls"]["proxy"]
    assert user.client.delete(f"/api/assets/{asset_id}", headers=user.auth).status_code == 204
    assert httpx2.get(proxy_url).status_code == 404
    assert json.loads(user.client.get("/api/assets", headers=user.auth).text)["total"] == 0
