"""Helpers for black-box API integration tests (on pytest's `pythonpath`)."""

import json
import os
import threading
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import httpx2

API_URL = os.environ.get("LUMACUT_API_URL", "http://localhost:8000")
PASSWORD = "integration-test-password"


@dataclass
class LoggedIn:
    client: httpx2.Client
    user_id: str
    email: str
    access_token: str

    @property
    def auth(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.access_token}"}


def unique_email() -> str:
    return f"it-{uuid.uuid4().hex[:12]}@example.com"


def register(client: httpx2.Client, email: str | None = None) -> LoggedIn:
    """Create an account using `client` (its cookie jar receives the refresh cookie)."""
    email = email or unique_email()
    res = client.post("/api/auth/register", json={"email": email, "password": PASSWORD})
    assert res.status_code == 201, res.text
    body = res.json()
    return LoggedIn(client, body["user"]["id"], email, body["accessToken"])


MIB = 1024 * 1024


def upload_bytes(user: LoggedIn, data: bytes, file_name: str, mime_type: str) -> str:
    """Full resumable-upload flow for an in-memory file; returns the asset id."""
    created = user.client.post(
        "/api/uploads",
        json={"fileName": file_name, "sizeBytes": len(data), "mimeType": mime_type},
        headers=user.auth,
    )
    assert created.status_code == 201, created.text
    asset_id: str = created.json()["assetId"]
    part_size: int = created.json()["partSizeBytes"]
    count: int = created.json()["partCount"]
    urls = user.client.post(
        f"/api/uploads/{asset_id}/part-urls",
        json={"partNumbers": list(range(1, count + 1))},
        headers=user.auth,
    ).json()["urls"]
    for part in urls:
        n = part["partNumber"]
        res = httpx2.put(
            part["url"], content=data[(n - 1) * part_size : n * part_size], timeout=120
        )
        assert res.status_code == 200, res.text
    done = user.client.post(f"/api/uploads/{asset_id}/complete", headers=user.auth)
    assert done.status_code == 200, done.text
    return asset_id


@dataclass
class SseEvent:
    event: str
    data: Any


class EventCollector:
    """Reads /api/events in a background thread until `stop()` (or the predicate is met)."""

    def __init__(self, user: LoggedIn):
        self.events: list[SseEvent] = []
        self._user = user
        self._stop = threading.Event()
        self._connected = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def __enter__(self) -> "EventCollector":
        self._thread.start()
        assert self._connected.wait(10), "SSE stream did not open"
        return self

    def __exit__(self, *_: object) -> None:
        self._stop.set()
        self._thread.join(timeout=5)

    def _run(self) -> None:
        with (
            httpx2.Client(base_url=API_URL, timeout=httpx2.Timeout(5, read=30)) as client,
            client.stream("GET", "/api/events", headers=self._user.auth) as res,
        ):
            assert res.status_code == 200
            assert res.headers["content-type"].startswith("text/event-stream")
            event, data = "message", ""
            for line in res.iter_lines():
                if line.startswith("event:"):
                    event = line.split(":", 1)[1].strip()
                elif line.startswith("data:"):
                    data += line.split(":", 1)[1].strip()
                elif line == "" and data:
                    self.events.append(SseEvent(event, json.loads(data)))
                    if event == "snapshot":
                        self._connected.set()
                    event, data = "message", ""
                if self._stop.is_set():
                    return

    def wait_for(self, predicate: Callable[[SseEvent], bool], timeout_s: float) -> SseEvent:
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            for e in list(self.events):
                if predicate(e):
                    return e
            time.sleep(0.1)
        raise AssertionError(f"no matching event within {timeout_s}s; got {self.events[-5:]}")

    def for_asset(self, asset_id: str) -> list[dict[str, Any]]:
        return [e.data for e in self.events if e.event == "asset" and e.data["assetId"] == asset_id]
