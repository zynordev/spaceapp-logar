"""Create immutable subjective check-in storage.

Revision ID: 20261114_0003
Revises: 20261114_0002
Create Date: 2026-11-14
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20261114_0003"
down_revision: str | None = "20261114_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "subjective_check_ins",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("mission_id", sa.String(length=100), nullable=False),
        sa.Column("crew_member_id", sa.String(length=100), nullable=False),
        sa.Column("fatigue", sa.SmallInteger(), nullable=False),
        sa.Column("dizziness", sa.SmallInteger(), nullable=False),
        sa.Column("nausea", sa.SmallInteger(), nullable=False),
        sa.Column("pain", sa.SmallInteger(), nullable=False),
        sa.Column("mood_distress", sa.SmallInteger(), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False),
        sa.Column("source_id", sa.String(length=100), nullable=False),
        sa.Column("scenario_id", sa.String(length=100), nullable=True),
        sa.Column("ingested_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "fatigue BETWEEN 0 AND 4",
            name="ck_subjective_check_ins_fatigue",
        ),
        sa.CheckConstraint(
            "dizziness BETWEEN 0 AND 4",
            name="ck_subjective_check_ins_dizziness",
        ),
        sa.CheckConstraint(
            "nausea BETWEEN 0 AND 4",
            name="ck_subjective_check_ins_nausea",
        ),
        sa.CheckConstraint(
            "pain BETWEEN 0 AND 4",
            name="ck_subjective_check_ins_pain",
        ),
        sa.CheckConstraint(
            "mood_distress BETWEEN 0 AND 4",
            name="ck_subjective_check_ins_mood_distress",
        ),
        sa.CheckConstraint(
            "(source_type = 'SYNTHETIC' AND scenario_id IS NOT NULL) OR "
            "(source_type = 'MANUAL' AND scenario_id IS NULL)",
            name="ck_subjective_check_ins_source",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_subjective_check_ins_lookup",
        "subjective_check_ins",
        ["mission_id", "crew_member_id", "observed_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_subjective_check_ins_lookup",
        table_name="subjective_check_ins",
    )
    op.drop_table("subjective_check_ins")

