"""Record which action-card steps a crew member completed.

Revision ID: 20261114_0009
Revises: 20261114_0008
Create Date: 2026-11-14
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20261114_0009"
down_revision: str | None = "20261114_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "action_step_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("alert_id", sa.Uuid(), nullable=False),
        sa.Column("card_id", sa.String(length=100), nullable=False),
        sa.Column("card_version", sa.Integer(), nullable=False),
        sa.Column("step_key", sa.String(length=100), nullable=False),
        sa.Column("crew_member_id", sa.String(length=100), nullable=False),
        sa.Column("done_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["alert_id"],
            ["alert_events.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_action_step_logs_step",
        "action_step_logs",
        ["alert_id", "card_id", "card_version", "step_key"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_action_step_logs_step", table_name="action_step_logs")
    op.drop_table("action_step_logs")
