"""FastAPI dependencies: resources, DB session per request, the authenticated user."""

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from lumacut_api.auth.provider import AuthProvider, PasswordAuthProvider
from lumacut_api.auth.tokens import InvalidTokenError, TokenService
from lumacut_api.errors import ApiError
from lumacut_api.resources import Resources
from lumacut_core.db import User

_bearer = HTTPBearer(auto_error=False, description="Access token from /api/auth/login")


def get_resources(request: Request) -> Resources:
    resources: Resources = request.app.state.resources
    return resources


ResourcesDep = Annotated[Resources, Depends(get_resources)]


async def get_session(resources: ResourcesDep) -> AsyncIterator[AsyncSession]:
    """One session per request. Mutating routes call `await session.commit()` themselves before
    returning, so the commit never races the response; anything uncommitted is rolled back."""
    async with resources.sessions() as session:
        try:
            yield session
        finally:
            await session.rollback()


SessionDep = Annotated[AsyncSession, Depends(get_session)]


def get_token_service(resources: ResourcesDep) -> TokenService:
    return TokenService(resources.settings.jwt_secret, resources.settings.access_token_ttl_s)


TokenServiceDep = Annotated[TokenService, Depends(get_token_service)]


def get_auth_provider() -> AuthProvider:
    return PasswordAuthProvider()


AuthProviderDep = Annotated[AuthProvider, Depends(get_auth_provider)]

UNAUTHORIZED = ApiError(
    401,
    "unauthorized",
    "Your session has expired or is invalid. Log in again.",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    session: SessionDep,
    tokens: TokenServiceDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None:
        raise UNAUTHORIZED
    try:
        user_id = tokens.user_id_from_access(credentials.credentials)
    except InvalidTokenError:
        raise UNAUTHORIZED from None
    user = await session.get(User, user_id)
    if user is None:
        raise UNAUTHORIZED
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
