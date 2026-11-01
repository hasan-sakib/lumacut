import pytest
from fastapi.testclient import TestClient

from lumacut_api.health import HealthCheck
from lumacut_api.main import create_app
from lumacut_api.settings import Settings


async def ok() -> None:
    return None


async def down() -> None:
    raise RuntimeError("no RQ worker is registered")


def client(checks: dict[str, HealthCheck]) -> TestClient:
    return TestClient(create_app(Settings(log_json=False), health_checks=checks))


def test_health_returns_200_when_everything_is_ok() -> None:
    with client({"database": ok, "worker": ok}) as c:
        res = c.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {
        "status": "ok",
        "checks": {
            "database": {"status": "ok", "detail": None},
            "worker": {"status": "ok", "detail": None},
        },
    }


def test_health_returns_503_with_failing_check_detail() -> None:
    with client({"database": ok, "worker": down}) as c:
        res = c.get("/api/health")
    assert res.status_code == 503
    body = res.json()
    assert body["status"] == "degraded"
    assert body["checks"]["worker"] == {
        "status": "error",
        "detail": "RuntimeError: no RQ worker is registered",
    }


def test_settings_read_lumacut_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LUMACUT_S3_BUCKET", "other-bucket")
    assert Settings().s3_bucket == "other-bucket"
