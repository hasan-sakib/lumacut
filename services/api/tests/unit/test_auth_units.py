from datetime import UTC, datetime, timedelta

import jwt
import pytest

from lumacut_api.auth.passwords import hash_password, verify_password
from lumacut_api.auth.tokens import (
    InvalidTokenError,
    TokenService,
    hash_refresh_token,
    new_refresh_token,
)
from lumacut_api.settings import DEV_JWT_SECRET, Settings

SECRET = "unit-test-secret-0123456789abcdef-0123"
OTHER_SECRET = "another-secret-0123456789abcdef-012345"


def test_password_hash_round_trip() -> None:
    digest = hash_password("correct horse battery")
    assert digest.startswith("$argon2id$")
    assert verify_password(digest, "correct horse battery")
    assert not verify_password(digest, "wrong password!")


def test_unknown_user_never_verifies() -> None:
    assert not verify_password(None, "lumacut-timing-equalizer")
    assert not verify_password("not-a-hash", "anything")


def test_access_token_round_trip_and_expiry() -> None:
    tokens = TokenService(SECRET, access_ttl_s=60)
    issued = tokens.issue_access("user-1")
    assert tokens.user_id_from_access(issued.token) == "user-1"

    stale = tokens.issue_access("user-1", now=datetime.now(UTC) - timedelta(minutes=5))
    with pytest.raises(InvalidTokenError):
        tokens.user_id_from_access(stale.token)


def test_access_token_rejects_tampering_wrong_secret_and_wrong_type() -> None:
    tokens = TokenService(SECRET, access_ttl_s=60)
    token = tokens.issue_access("user-1").token
    with pytest.raises(InvalidTokenError):
        TokenService(OTHER_SECRET, access_ttl_s=60).user_id_from_access(token)
    with pytest.raises(InvalidTokenError):
        tokens.user_id_from_access(token[:-2] + ("AA" if token[-2:] != "AA" else "BB"))
    now = datetime.now(UTC)
    refresh_like = jwt.encode(
        {"sub": "user-1", "typ": "refresh", "iat": now, "exp": now + timedelta(minutes=1)},
        SECRET,
        algorithm="HS256",
    )
    with pytest.raises(InvalidTokenError):
        tokens.user_id_from_access(refresh_like)
    unsigned = jwt.encode({"sub": "user-1"}, key=None, algorithm="none")
    with pytest.raises(InvalidTokenError):
        tokens.user_id_from_access(unsigned)


def test_refresh_tokens_are_random_and_stored_hashed() -> None:
    raw1, hash1 = new_refresh_token()
    raw2, _ = new_refresh_token()
    assert raw1 != raw2 and len(raw1) >= 43
    assert hash1 == hash_refresh_token(raw1) and raw1 not in hash1


def test_settings_refuse_dev_secret_outside_dev() -> None:
    assert Settings(env="dev").jwt_secret == DEV_JWT_SECRET
    with pytest.raises(ValueError, match="LUMACUT_JWT_SECRET"):
        Settings(env="prod")
    assert Settings(env="prod", jwt_secret="x" * 40).env == "prod"
    with pytest.raises(ValueError, match="32 bytes"):
        Settings(env="prod", jwt_secret="too-short")
    with pytest.raises(ValueError, match="5 MiB"):
        Settings(upload_part_size_bytes=1024)
