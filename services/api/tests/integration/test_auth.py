import httpx2
import pytest
from api_testkit import API_URL, PASSWORD, LoggedIn, register, unique_email

pytestmark = pytest.mark.integration


def test_register_sets_refresh_cookie_and_returns_session(api: httpx2.Client) -> None:
    email = unique_email()
    res = api.post("/api/auth/register", json={"email": email.upper(), "password": PASSWORD})
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["user"]["email"] == email  # normalized to lowercase
    assert body["accessToken"] and body["expiresAt"]
    cookie = res.headers["set-cookie"]
    assert "lumacut_refresh=" in cookie
    assert "HttpOnly" in cookie and "Path=/api/auth" in cookie and "SameSite=strict" in cookie


def test_me_requires_a_valid_access_token(api: httpx2.Client, user: LoggedIn) -> None:
    assert api.get("/api/auth/me", headers=user.auth).json() == {
        "id": user.user_id,
        "email": user.email,
    }
    res = api.get("/api/auth/me")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "unauthorized"
    assert res.headers["www-authenticate"] == "Bearer"
    assert api.get("/api/auth/me", headers={"Authorization": "Bearer junk"}).status_code == 401


def test_duplicate_email_and_weak_password(api: httpx2.Client, user: LoggedIn) -> None:
    dup = api.post("/api/auth/register", json={"email": user.email, "password": PASSWORD})
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "email_taken"
    weak = api.post("/api/auth/register", json={"email": unique_email(), "password": "short"})
    assert weak.status_code == 422 and weak.json()["error"]["code"] == "weak_password"
    bad = api.post("/api/auth/register", json={"email": "not-an-email", "password": PASSWORD})
    assert bad.status_code == 422 and "email" in bad.json()["error"]["fields"]


def test_login_with_right_and_wrong_credentials(user: LoggedIn) -> None:
    with httpx2.Client(base_url=API_URL) as fresh:
        wrong = fresh.post("/api/auth/login", json={"email": user.email, "password": "nope-nope-1"})
        assert wrong.status_code == 401
        assert wrong.json()["error"] == {
            "code": "invalid_credentials",
            "message": "Email or password is incorrect.",
        }
        unknown = fresh.post(
            "/api/auth/login", json={"email": unique_email(), "password": PASSWORD}
        )
        assert unknown.json()["error"]["code"] == "invalid_credentials"
        ok = fresh.post("/api/auth/login", json={"email": user.email, "password": PASSWORD})
        assert ok.status_code == 200 and ok.json()["user"]["id"] == user.user_id


def test_refresh_rotates_and_reuse_revokes_the_family() -> None:
    with httpx2.Client(base_url=API_URL) as client:
        session = register(client)
        first_cookie = client.cookies["lumacut_refresh"]

        rotated = client.post("/api/auth/refresh")
        assert rotated.status_code == 200, rotated.text
        assert rotated.json()["user"]["id"] == session.user_id
        second_cookie = client.cookies["lumacut_refresh"]
        assert second_cookie != first_cookie

        # Replaying the already-rotated token is treated as theft: the family is revoked...
        with httpx2.Client(base_url=API_URL, cookies={"lumacut_refresh": first_cookie}) as thief:
            replay = thief.post("/api/auth/refresh")
            assert replay.status_code == 401
            assert replay.json()["error"]["code"] == "session_expired"
        # ...so even the legitimate, newest token no longer works.
        client.cookies.set("lumacut_refresh", second_cookie, path="/api/auth")
        assert client.post("/api/auth/refresh").status_code == 401


def test_logout_revokes_refresh(api: httpx2.Client) -> None:
    with httpx2.Client(base_url=API_URL) as client:
        register(client)
        token = client.cookies["lumacut_refresh"]
        assert client.post("/api/auth/logout").status_code == 204
        with httpx2.Client(base_url=API_URL, cookies={"lumacut_refresh": token}) as again:
            assert again.post("/api/auth/refresh").status_code == 401
    assert api.post("/api/auth/refresh").json()["error"]["code"] == "no_session"
