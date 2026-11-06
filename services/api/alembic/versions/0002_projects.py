"""projects and project snapshots

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-06
"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = sa.String(21)


def _ts(name: str) -> sa.Column[Any]:
    return sa.Column(name, sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", ID, nullable=False),
        sa.Column("owner_id", ID, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("doc", postgresql.JSONB, nullable=False),
        _ts("created_at"),
        _ts("updated_at"),
        sa.PrimaryKeyConstraint("id", name="pk_projects"),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], ondelete="CASCADE", name="fk_projects_owner_id_users"
        ),
    )
    op.create_index("ix_projects_owner_id", "projects", ["owner_id"])
    op.create_index("ix_projects_owner_updated", "projects", ["owner_id", sa.text("updated_at DESC")])

    op.create_table(
        "project_snapshots",
        sa.Column("id", ID, nullable=False),
        sa.Column("project_id", ID, nullable=False),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("label", sa.String(255), nullable=True),
        sa.Column("doc", postgresql.JSONB, nullable=False),
        _ts("created_at"),
        sa.PrimaryKeyConstraint("id", name="pk_project_snapshots"),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            ondelete="CASCADE",
            name="fk_project_snapshots_project_id_projects",
        ),
    )
    op.create_index("ix_project_snapshots_project_id", "project_snapshots", ["project_id"])


def downgrade() -> None:
    op.drop_table("project_snapshots")
    op.drop_table("projects")
