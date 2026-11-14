"""Create immutable observation storage.

Revision ID: 20261114_0001
Revises:
Create Date: 2026-11-14
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20261114_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "observations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("mission_id", sa.String(length=100), nullable=False),
        sa.Column("target_type", sa.String(length=32), nullable=False),
        sa.Column("target_id", sa.String(length=100), nullable=False),
        sa.Column("metric", sa.String(length=100), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(length=32), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False),
        sa.Column("source_id", sa.String(length=100), nullable=False),
        sa.Column("scenario_id", sa.String(length=100), nullable=True),
        sa.Column("reported_quality", sa.String(length=32), nullable=False),
        sa.Column("ingested_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "(source_type = 'SYNTHETIC' AND scenario_id IS NOT NULL) OR "
            "(source_type <> 'SYNTHETIC' AND scenario_id IS NULL)",
            name="ck_observations_synthetic_scenario",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_observations_lookup",
        "observations",
        ["mission_id", "target_id", "metric", "observed_at"],
        unique=False,
    )
    op.create_index(
        "ix_observations_observed_at",
        "observations",
        ["observed_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_observations_observed_at", table_name="observations")
    op.drop_index("ix_observations_lookup", table_name="observations")
    op.drop_table("observations")

