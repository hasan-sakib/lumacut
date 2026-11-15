"""saved templates

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = sa.String(21)


def upgrade() -> None:
    op.create_table(
        "templates",
        sa.Column("id", ID, nullable=False),
        sa.Column("owner_id", ID, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column("aspect", sa.String(16), nullable=False),
        sa.Column("doc", postgresql.JSONB, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.PrimaryKeyConstraint("id", name="pk_templates"),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], ondelete="CASCADE", name="fk_templates_owner_id_users"
        ),
    )
    op.create_index("ix_templates_owner_id", "templates", ["owner_id"])
    op.create_index(
        "ix_templates_owner_created", "templates", ["owner_id", sa.text("created_at DESC")]
    )


def downgrade() -> None:
    op.drop_table("templates")
