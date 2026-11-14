"""Create append-only periodic laboratory results.

Revision ID: 20261114_0006
Revises: 20261114_0005
Create Date: 2026-11-14
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20261114_0006"
down_revision: str | None = "20261114_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "lab_results",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("mission_id", sa.String(length=100), nullable=False),
        sa.Column("crew_member_id", sa.String(length=100), nullable=False),
        sa.Column("analyte", sa.String(length=32), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(length=32), nullable=False),
        sa.Column("reference_low", sa.Float(), nullable=False),
        sa.Column("reference_high", sa.Float(), nullable=False),
        sa.Column("phase", sa.String(length=32), nullable=False),
        sa.Column("sampled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False),
        sa.Column("source_id", sa.String(length=100), nullable=False),
        sa.Column("scenario_id", sa.String(length=100), nullable=True),
        sa.Column("ingested_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "reference_low <= reference_high",
            name="ck_lab_results_reference_range",
        ),
        sa.CheckConstraint(
            "(source_type = 'SYNTHETIC' AND scenario_id IS NOT NULL) OR "
            "(source_type <> 'SYNTHETIC' AND scenario_id IS NULL)",
            name="ck_lab_results_synthetic_scenario",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_lab_results_lookup",
        "lab_results",
        ["mission_id", "crew_member_id", "analyte", "sampled_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_lab_results_lookup", table_name="lab_results")
    op.drop_table("lab_results")
