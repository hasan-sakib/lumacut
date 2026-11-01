"""Short-lived JWT access tokens and opaque, hashed refresh tokens."""

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt

ALGORITHM = "HS256"


class InvalidTokenError(Exception):
    pass


@dataclass(frozen=True)
class AccessToken:
    token: str
    expires_at: datetime


class TokenService:
    def __init__(self, secret: str, access_ttl_s: int):
        self._secret = secret
        self._ttl = timedelta(seconds=access_ttl_s)

    def issue_access(self, user_id: str, now: datetime | None = None) -> AccessToken:
        issued = now or datetime.now(UTC)
        expires = issued + self._ttl
        claims = {"sub": user_id, "typ": "access", "iat": issued, "exp": expires}
        return AccessToken(jwt.encode(claims, self._secret, algorithm=ALGORITHM), expires)

    def user_id_from_access(self, token: str) -> str:
        try:
            claims = jwt.decode(
                token,
                self._secret,
                algorithms=[ALGORITHM],
                options={"require": ["sub", "exp", "iat", "typ"]},
            )
        except jwt.PyJWTError as exc:
            raise InvalidTokenError(str(exc)) from exc
        if claims.get("typ") != "access" or not isinstance(claims.get("sub"), str):
            raise InvalidTokenError("not an access token")
        return str(claims["sub"])


def new_refresh_token() -> tuple[str, str]:
    """Returns (raw token for the client, sha256 hex digest to store)."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_refresh_token(raw)


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()
