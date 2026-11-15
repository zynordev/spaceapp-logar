"""Create routine schedules and completions.

Revision ID: 20261115_0016
Revises: 20261115_0015
Create Date: 2026-11-15
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20261115_0016"
down_revision: str | None = "20261115_0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

KINDS = (
    "HYDRATION",
    "EXERCISE",
    "SLEEP_WINDOW",
    "CHECK_IN",
    "BODY_MASS_WEEKLY",
    "GRIP_STRENGTH_WEEKLY",
    "MUSCULOSKELETAL_ASSESSMENT_BIWEEKLY",
)
KIND_LIST = ", ".join(f"'{kind}'" for kind in KINDS)


def upgrade() -> None:
    op.create_table(
        "routine_schedules",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("mission_id", sa.String(length=100), nullable=False),
        sa.Column("crew_member_id", sa.String(length=100), nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("interval_minutes", sa.Integer(), nullable=False),
        sa.Column("anchor_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            f"kind IN ({KIND_LIST})", name="ck_routine_schedules_kind"
        ),
        sa.CheckConstraint(
            "interval_minutes >= 30 AND interval_minutes <= 20160",
            name="ck_routine_schedules_interval",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_routine_schedules_lookup",
        "routine_schedules",
        ["mission_id", "crew_member_id", "kind"],
    )
    op.create_table(
        "routine_completions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("schedule_id", sa.Uuid(), nullable=False),
        sa.Column("crew_member_id", sa.String(length=100), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "source_type IN ('MANUAL')", name="ck_routine_completions_source"
        ),
        sa.ForeignKeyConstraint(
            ["schedule_id"], ["routine_schedules.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_routine_completions_schedule",
        "routine_completions",
        ["schedule_id", "completed_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_routine_completions_schedule", table_name="routine_completions")
    op.drop_table("routine_completions")
    op.drop_index("ix_routine_schedules_lookup", table_name="routine_schedules")
    op.drop_table("routine_schedules")
