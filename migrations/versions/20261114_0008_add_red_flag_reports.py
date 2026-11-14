"""Add red-flag reports and record who resolved an alert.

Revision ID: 20261114_0008
Revises: 20261114_0007
Create Date: 2026-11-14
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20261114_0008"
down_revision: str | None = "20261114_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "red_flag_reports",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("mission_id", sa.String(length=100), nullable=False),
        sa.Column("crew_member_id", sa.String(length=100), nullable=False),
        sa.Column("flags", sa.String(length=500), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False),
        sa.Column("source_id", sa.String(length=100), nullable=False),
        sa.Column("scenario_id", sa.String(length=100), nullable=True),
        sa.Column("evaluation_id", sa.Uuid(), nullable=False),
        sa.Column("ingested_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "(source_type = 'SYNTHETIC' AND scenario_id IS NOT NULL) OR "
            "(source_type = 'MANUAL' AND scenario_id IS NULL)",
            name="ck_red_flag_reports_source",
        ),
        sa.ForeignKeyConstraint(
            ["evaluation_id"],
            ["rule_evaluations.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_red_flag_reports_lookup",
        "red_flag_reports",
        ["mission_id", "crew_member_id", "observed_at"],
        unique=False,
    )
    # Nullable: earlier alerts were resolved automatically, not by a person.
    op.add_column(
        "alert_events",
        sa.Column("resolved_by", sa.String(length=100), nullable=True),
    )


def downgrade() -> None:
    with op.batch_alter_table("alert_events") as batch_op:
        batch_op.drop_column("resolved_by")
    op.drop_index("ix_red_flag_reports_lookup", table_name="red_flag_reports")
    op.drop_table("red_flag_reports")
