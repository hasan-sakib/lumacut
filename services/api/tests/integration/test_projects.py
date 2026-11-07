"""Projects API against the running stack: CRUD, optimistic concurrency, snapshots, asset guard."""

import copy
import struct
import time
import zlib
from typing import Any

import httpx2
import pytest
from api_testkit import LoggedIn, upload_bytes

pytestmark = pytest.mark.integration


def make_png(width: int = 8, height: int = 8) -> bytes:
    """A small valid RGB PNG, built with the standard library (no pasted constants to get wrong)."""

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    rows = b"".join(
        b"\x00" + bytes((x * 30 % 256, y * 30 % 256, 128)) * width
        for x in range(1)
        for y in range(height)
    )
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(rows))
        + chunk(b"IEND", b"")
    )


PNG = make_png()


def create(user: LoggedIn, name: str = "My edit", kind: str = "video") -> dict[str, Any]:
    res = user.client.post("/api/projects", json={"name": name, "kind": kind}, headers=user.auth)
    assert res.status_code == 201, res.text
    return dict(res.json())


def save(
    user: LoggedIn, project: dict[str, Any], doc: dict[str, Any], version: int | None = None
) -> httpx2.Response:
    headers = {**user.auth, "If-Match": str(project["version"] if version is None else version)}
    return user.client.put(f"/api/projects/{project['id']}", json={"doc": doc}, headers=headers)


def test_create_returns_a_valid_default_project(user: LoggedIn) -> None:
    project = create(user, "Holiday", "video")
    assert project["name"] == "Holiday"
    assert project["version"] == 1
    doc = project["doc"]
    assert doc["schemaVersion"] == 1
    comp = doc["compositions"][0]
    assert doc["mainCompositionId"] == comp["id"]
    assert (comp["width"], comp["height"]) == (1920, 1080)
    assert [t["kind"] for t in comp["tracks"]] == ["visual", "audio"]


def test_list_get_and_ownership(user: LoggedIn, other_user: LoggedIn) -> None:
    mine = create(user, "Mine")
    create(other_user, "Theirs")
    listed = user.client.get("/api/projects", headers=user.auth).json()["items"]
    assert [p["id"] for p in listed] == [mine["id"]]
    assert "doc" not in listed[0]
    assert (
        user.client.get(f"/api/projects/{mine['id']}", headers=user.auth).json()["doc"]["name"]
        == "Mine"
    )
    foreign = other_user.client.get(f"/api/projects/{mine['id']}", headers=other_user.auth)
    assert foreign.status_code == 404
    assert (
        other_user.client.delete(f"/api/projects/{mine['id']}", headers=other_user.auth).status_code
        == 404
    )
    assert user.client.get("/api/projects").status_code == 401


def test_save_bumps_the_version_and_keeps_the_document(user: LoggedIn) -> None:
    project = create(user)
    doc = copy.deepcopy(project["doc"])
    doc["name"] = "Renamed"
    comp = doc["compositions"][0]
    comp["markers"].append(
        {
            "id": "m1",
            "tUs": 1000,
            "durationUs": 0,
            "label": "A",
            "color": {"r": 1, "g": 0, "b": 0, "a": 1},
        }
    )
    res = save(user, project, doc)
    assert res.status_code == 200, res.text
    saved = res.json()
    assert saved["version"] == 2 and saved["name"] == "Renamed"
    assert saved["doc"]["compositions"][0]["markers"][0]["id"] == "m1"
    again = user.client.get(f"/api/projects/{project['id']}", headers=user.auth).json()
    assert again["version"] == 2 and again["doc"] == saved["doc"]


def test_stale_save_is_refused_with_the_current_version(user: LoggedIn) -> None:
    project = create(user)
    first = save(user, project, project["doc"])
    assert first.status_code == 200
    stale = save(user, project, project["doc"], version=1)
    assert stale.status_code == 412
    assert stale.json()["error"]["code"] == "version_conflict"
    assert stale.headers["etag"] == "2"
    # Nothing was overwritten.
    assert (
        user.client.get(f"/api/projects/{project['id']}", headers=user.auth).json()["version"] == 2
    )


def test_if_match_is_required_and_must_be_a_number(user: LoggedIn) -> None:
    project = create(user)
    url = f"/api/projects/{project['id']}"
    body = {"doc": project["doc"]}
    assert user.client.put(url, json=body, headers=user.auth).status_code == 428
    bad = user.client.put(url, json=body, headers={**user.auth, "If-Match": "abc"})
    assert bad.status_code == 400
    weak = user.client.put(url, json=body, headers={**user.auth, "If-Match": 'W/"1"'})
    assert weak.status_code == 200


def test_invalid_documents_are_rejected_with_a_readable_message(user: LoggedIn) -> None:
    project = create(user)
    broken = copy.deepcopy(project["doc"])
    broken["compositions"][0]["width"] = 0
    res = save(user, project, broken)
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "invalid_project"
    assert "width" in res.json()["error"]["message"]
    extra = copy.deepcopy(project["doc"])
    extra["surprise"] = True
    assert save(user, project, extra).status_code == 422
    assert (
        user.client.get(f"/api/projects/{project['id']}", headers=user.auth).json()["version"] == 1
    )


def test_snapshots_can_be_listed_and_restored(user: LoggedIn) -> None:
    project = create(user, "Original")
    snap = user.client.post(
        f"/api/projects/{project['id']}/snapshots", json={"label": "before"}, headers=user.auth
    )
    assert snap.status_code == 201, snap.text
    doc = copy.deepcopy(project["doc"])
    doc["name"] = "Changed"
    saved = save(user, project, doc).json()
    listed = user.client.get(f"/api/projects/{project['id']}/snapshots", headers=user.auth).json()[
        "items"
    ]
    assert [s["label"] for s in listed] == ["before"] and listed[0]["version"] == 1
    restore = user.client.post(
        f"/api/projects/{project['id']}/snapshots/{snap.json()['id']}/restore",
        headers={**user.auth, "If-Match": str(saved["version"])},
    )
    assert restore.status_code == 200, restore.text
    assert restore.json()["doc"]["name"] == "Original"
    assert restore.json()["version"] == saved["version"] + 1
    stale = user.client.post(
        f"/api/projects/{project['id']}/snapshots/{snap.json()['id']}/restore",
        headers={**user.auth, "If-Match": "1"},
    )
    assert stale.status_code == 412
    missing = user.client.post(
        f"/api/projects/{project['id']}/snapshots/nope/restore",
        headers={**user.auth, "If-Match": str(restore.json()["version"])},
    )
    assert missing.status_code == 404


def test_delete_removes_the_project_and_its_snapshots(user: LoggedIn) -> None:
    project = create(user)
    user.client.post(f"/api/projects/{project['id']}/snapshots", json={}, headers=user.auth)
    assert (
        user.client.delete(f"/api/projects/{project['id']}", headers=user.auth).status_code == 204
    )
    assert user.client.get(f"/api/projects/{project['id']}", headers=user.auth).status_code == 404
    assert (
        user.client.get(f"/api/projects/{project['id']}/snapshots", headers=user.auth).status_code
        == 404
    )


def test_an_asset_used_by_a_project_can_not_be_deleted(user: LoggedIn) -> None:
    asset_id = upload_bytes(user, PNG, "dot.png", "image/png")
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        status = user.client.get(f"/api/assets/{asset_id}", headers=user.auth).json()["status"]
        if status in ("ready", "failed"):
            break
        time.sleep(1)
    assert status == "ready"

    project = create(user)
    doc = copy.deepcopy(project["doc"])
    doc["assets"].append(
        {
            "id": asset_id,
            "kind": "image",
            "name": "dot.png",
            "mimeType": "image/png",
            "sizeBytes": len(PNG),
            "source": "user",
            "image": {"width": 8, "height": 8},
        }
    )
    saved = save(user, project, doc).json()
    blocked = user.client.delete(f"/api/assets/{asset_id}", headers=user.auth)
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "asset_in_use"

    doc["assets"] = []
    assert save(user, saved, doc).status_code == 200
    assert user.client.delete(f"/api/assets/{asset_id}", headers=user.auth).status_code == 204
