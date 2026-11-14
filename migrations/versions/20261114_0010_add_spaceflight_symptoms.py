"""Add optional spaceflight-specific symptoms to subjective check-ins.

Revision ID: 20261114_0010
Revises: 20261114_0009
Create Date: 2026-11-14
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20261114_0010"
down_revision: str | None = "20261114_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUMNS = ("vision_change", "back_pain", "congestion")


def upgrade() -> None:
    # Nullable: earlier check-ins did not ask these questions.
    for name in COLUMNS:
        op.add_column(
            "subjective_check_ins",
            sa.Column(name, sa.SmallInteger(), nullable=True),
        )


def downgrade() -> None:
    with op.batch_alter_table("subjective_check_ins") as batch_op:
        for name in reversed(COLUMNS):
            batch_op.drop_column(name)
