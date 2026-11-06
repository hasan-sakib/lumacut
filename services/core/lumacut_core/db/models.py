"""SQLAlchemy models. Migrations live in services/api/alembic (the API owns the schema)."""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

NAMING = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

ID = String(21)


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING)
    # Fetch server-generated values (created_at/updated_at) via RETURNING on flush. Otherwise
    # they expire and reading them later would need a lazy load, which async sessions forbid.
    __mapper_args__ = {"eager_defaults": True}  # noqa: RUF012 (SQLAlchemy declarative API)


def _now() -> Any:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(ID, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = _now()


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(ID, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    family_id: Mapped[str] = mapped_column(ID, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = _now()
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Asset(Base):
    __tablename__ = "assets"
    __table_args__ = (
        Index("ix_assets_owner_created", "owner_id", text("created_at DESC")),
        # Trigram index for name search (ILIKE '%term%').
        Index(
            "ix_assets_name_trgm",
            "name",
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
        ),
    )

    id: Mapped[str] = mapped_column(ID, primary_key=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # video | audio | image; None until known (guessed from MIME at upload, confirmed by probe).
    kind: Mapped[str | None] = mapped_column(String(10))
    name: Mapped[str] = mapped_column(String(255))
    original_filename: Mapped[str] = mapped_column(String(1024))
    mime_type: Mapped[str] = mapped_column(String(255))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(16), index=True)
    stage: Mapped[str | None] = mapped_column(String(32))
    progress: Mapped[float] = mapped_column(Float, default=0.0, server_default="0")
    error_code: Mapped[str | None] = mapped_column(String(64))
    error_message: Mapped[str | None] = mapped_column(Text)
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    upload_id: Mapped[str | None] = mapped_column(Text)
    original_key: Mapped[str] = mapped_column(Text)
    media: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    renditions: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = _now()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    ready_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ProjectRecord(Base):
    """A project document (the `Project` of packages/schema, as JSON) with optimistic concurrency.

    `version` starts at 1 and increases by one on every save; a save must name the version it was
    based on (HTTP `If-Match`), so two tabs can't silently overwrite each other.
    """

    __tablename__ = "projects"
    __table_args__ = (Index("ix_projects_owner_updated", "owner_id", text("updated_at DESC")),)

    id: Mapped[str] = mapped_column(ID, primary_key=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(10))
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    doc: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = _now()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ProjectSnapshot(Base):
    """A named copy of a project document at one version (restorable)."""

    __tablename__ = "project_snapshots"

    id: Mapped[str] = mapped_column(ID, primary_key=True)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    version: Mapped[int] = mapped_column(Integer)
    label: Mapped[str | None] = mapped_column(String(255))
    doc: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = _now()
