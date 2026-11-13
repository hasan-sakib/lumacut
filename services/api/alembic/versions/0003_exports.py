"""server exports

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-13
"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = sa.String(21)


def _ts(name: str) -> sa.Column[Any]:
    return sa.Column(name, sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())


def upgrade() -> None:
    op.create_table(
        "exports",
        sa.Column("id", ID, nullable=False),
        sa.Column("owner_id", ID, nullable=False),
        sa.Column("project_id", ID, nullable=False),
        sa.Column("composition_id", ID, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("settings", postgresql.JSONB, nullable=False),
        sa.Column("doc", postgresql.JSONB, nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("progress", sa.Float, nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("warnings", postgresql.JSONB, nullable=True),
        sa.Column("output_key", sa.Text, nullable=True),
        sa.Column("size_bytes", sa.BigInteger, nullable=True),
        _ts("created_at"),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_exports"),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], ondelete="CASCADE", name="fk_exports_owner_id_users"
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            ondelete="CASCADE",
            name="fk_exports_project_id_projects",
        ),
    )
    op.create_index("ix_exports_owner_id", "exports", ["owner_id"])
    op.create_index("ix_exports_project_id", "exports", ["project_id"])
    op.create_index("ix_exports_status", "exports", ["status"])
    op.create_index("ix_exports_owner_created", "exports", ["owner_id", sa.text("created_at DESC")])


def downgrade() -> None:
    op.drop_table("exports")
