"""Add optional activity context to observations.

Revision ID: 20261114_0007
Revises: 20261114_0006
Create Date: 2026-11-14
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20261114_0007"
down_revision: str | None = "20261114_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Nullable: existing observations simply have no recorded activity context.
    op.add_column(
        "observations",
        sa.Column("activity_state", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    with op.batch_alter_table("observations") as batch_op:
        batch_op.drop_column("activity_state")
