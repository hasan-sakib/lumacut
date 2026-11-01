"""Identity providers. Password login is the v1 implementation; OIDC etc. plug in here later."""

from typing import Protocol

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from lumacut_api.auth.passwords import MIN_PASSWORD_LENGTH, hash_password, verify_password
from lumacut_core.db import User
from lumacut_core.ids import new_id


class EmailTakenError(Exception):
    pass


class WeakPasswordError(Exception):
    pass


class AuthProvider(Protocol):
    async def register(self, session: AsyncSession, email: str, password: str) -> User: ...

    async def authenticate(self, session: AsyncSession, email: str, password: str) -> User | None:
        """The user for valid credentials, otherwise None (never says which part was wrong)."""
        ...


def normalize_email(email: str) -> str:
    return email.strip().lower()


class PasswordAuthProvider:
    async def register(self, session: AsyncSession, email: str, password: str) -> User:
        if len(password) < MIN_PASSWORD_LENGTH:
            raise WeakPasswordError
        user = User(
            id=new_id(), email=normalize_email(email), password_hash=hash_password(password)
        )
        session.add(user)
        try:
            await session.flush()
        except IntegrityError as exc:
            raise EmailTakenError from exc
        return user

    async def authenticate(self, session: AsyncSession, email: str, password: str) -> User | None:
        user = await session.scalar(select(User).where(User.email == normalize_email(email)))
        if not verify_password(user.password_hash if user else None, password):
            return None
        return user
