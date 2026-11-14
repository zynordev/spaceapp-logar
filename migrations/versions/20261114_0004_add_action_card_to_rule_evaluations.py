"""Record which approved action card a rule evaluation showed.

Revision ID: 20261114_0004
Revises: 20261114_0003
Create Date: 2026-11-14
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20261114_0004"
down_revision: str | None = "20261114_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Nullable additions: existing evaluations simply showed no card.
    op.add_column(
        "rule_evaluations",
        sa.Column("action_card_id", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "rule_evaluations",
        sa.Column("action_card_version", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    with op.batch_alter_table("rule_evaluations") as batch_op:
        batch_op.drop_column("action_card_version")
        batch_op.drop_column("action_card_id")
