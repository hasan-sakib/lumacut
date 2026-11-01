"""Refresh token rotation with reuse detection.

Every refresh issues a new token in the same family and revokes the old one. Presenting a token
that was already rotated means it leaked (or was replayed): the whole family is revoked.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from lumacut_api.auth.tokens import hash_refresh_token, new_refresh_token
from lumacut_core.db import RefreshToken
from lumacut_core.ids import new_id


class RefreshError(Exception):
    """Unknown, expired or reused refresh token: the client must log in again."""


@dataclass(frozen=True)
class IssuedRefresh:
    raw: str
    user_id: str
    expires_at: datetime


async def issue_refresh(
    session: AsyncSession, user_id: str, ttl_s: int, family_id: str | None = None
) -> IssuedRefresh:
    raw, digest = new_refresh_token()
    expires = datetime.now(UTC) + timedelta(seconds=ttl_s)
    session.add(
        RefreshToken(
            id=new_id(),
            user_id=user_id,
            family_id=family_id or new_id(),
            token_hash=digest,
            expires_at=expires,
        )
    )
    await session.flush()
    return IssuedRefresh(raw=raw, user_id=user_id, expires_at=expires)


async def revoke_family(session: AsyncSession, family_id: str) -> None:
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


async def rotate_refresh(session: AsyncSession, raw: str, ttl_s: int) -> IssuedRefresh:
    token = await session.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == hash_refresh_token(raw))
        .with_for_update()
    )
    if token is None:
        raise RefreshError("unknown refresh token")
    if token.revoked_at is not None:
        await revoke_family(session, token.family_id)
        raise RefreshError("refresh token reuse detected; all sessions of this login were revoked")
    if token.expires_at <= datetime.now(UTC):
        raise RefreshError("refresh token expired")
    token.revoked_at = datetime.now(UTC)
    return await issue_refresh(session, token.user_id, ttl_s, family_id=token.family_id)


async def revoke_by_raw(session: AsyncSession, raw: str) -> None:
    token = await session.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw))
    )
    if token is not None:
        await revoke_family(session, token.family_id)
