from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Cookie, Response, status
from pydantic import EmailStr, Field

from lumacut_api.auth.provider import EmailTakenError, WeakPasswordError
from lumacut_api.auth.refresh import (
    IssuedRefresh,
    RefreshError,
    issue_refresh,
    revoke_by_raw,
    rotate_refresh,
)
from lumacut_api.deps import (
    AuthProviderDep,
    CurrentUser,
    ResourcesDep,
    SessionDep,
    TokenServiceDep,
)
from lumacut_api.errors import ApiError, error_responses
from lumacut_core.camel import CamelModel
from lumacut_core.db import User

router = APIRouter(prefix="/api/auth", tags=["auth"])

REFRESH_COOKIE = "lumacut_refresh"
REFRESH_COOKIE_PATH = "/api/auth"


class Credentials(CamelModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=1024)


class UserOut(CamelModel):
    id: str
    email: str


class SessionOut(CamelModel):
    access_token: str
    expires_at: datetime
    user: UserOut


def _set_refresh_cookie(response: Response, issued: IssuedRefresh, secure: bool) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        issued.raw,
        httponly=True,
        secure=secure,
        samesite="strict",
        path=REFRESH_COOKIE_PATH,
        expires=issued.expires_at,
    )


def _session_out(tokens: TokenServiceDep, user_id: str, email: str) -> SessionOut:
    access = tokens.issue_access(user_id)
    return SessionOut(
        access_token=access.token,
        expires_at=access.expires_at,
        user=UserOut(id=user_id, email=email),
    )


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(409, 422),
)
async def register(
    body: Credentials,
    response: Response,
    session: SessionDep,
    provider: AuthProviderDep,
    tokens: TokenServiceDep,
    resources: ResourcesDep,
) -> SessionOut:
    """Create an account and start a session."""
    try:
        user = await provider.register(session, body.email, body.password)
    except WeakPasswordError:
        raise ApiError(
            422, "weak_password", "Choose a password with at least 10 characters."
        ) from None
    except EmailTakenError:
        raise ApiError(
            409, "email_taken", "An account with this email already exists. Log in instead."
        ) from None
    settings = resources.settings
    issued = await issue_refresh(session, user.id, settings.refresh_token_ttl_s)
    await session.commit()
    _set_refresh_cookie(response, issued, settings.cookie_secure)
    return _session_out(tokens, user.id, user.email)


@router.post("/login", responses=error_responses(401, 422))
async def login(
    body: Credentials,
    response: Response,
    session: SessionDep,
    provider: AuthProviderDep,
    tokens: TokenServiceDep,
    resources: ResourcesDep,
) -> SessionOut:
    """Exchange email + password for an access token and a refresh cookie."""
    user = await provider.authenticate(session, body.email, body.password)
    if user is None:
        raise ApiError(401, "invalid_credentials", "Email or password is incorrect.")
    settings = resources.settings
    issued = await issue_refresh(session, user.id, settings.refresh_token_ttl_s)
    await session.commit()
    _set_refresh_cookie(response, issued, settings.cookie_secure)
    return _session_out(tokens, user.id, user.email)


@router.post("/refresh", responses=error_responses(401))
async def refresh(
    response: Response,
    session: SessionDep,
    tokens: TokenServiceDep,
    resources: ResourcesDep,
    lumacut_refresh: Annotated[str | None, Cookie()] = None,
) -> SessionOut:
    """Rotate the refresh cookie and return a new access token."""
    if not lumacut_refresh:
        raise ApiError(401, "no_session", "You are not logged in.")
    settings = resources.settings
    try:
        issued = await rotate_refresh(session, lumacut_refresh, settings.refresh_token_ttl_s)
    except RefreshError:
        # Keep the family revocation done on reuse detection, then fail.
        await session.commit()
        response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH)
        raise ApiError(401, "session_expired", "Your session has ended. Log in again.") from None
    user = await session.get(User, issued.user_id)
    if user is None:
        raise ApiError(401, "session_expired", "Your session has ended. Log in again.")
    await session.commit()
    _set_refresh_cookie(response, issued, settings.cookie_secure)
    return _session_out(tokens, user.id, user.email)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    session: SessionDep,
    lumacut_refresh: Annotated[str | None, Cookie()] = None,
) -> None:
    """Revoke this login's refresh tokens and clear the cookie."""
    if lumacut_refresh:
        await revoke_by_raw(session, lumacut_refresh)
        await session.commit()
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH)


@router.get("/me", responses=error_responses(401))
async def me(user: CurrentUser) -> UserOut:
    return UserOut(id=user.id, email=user.email)
