"""Create append-only mission environment contexts.

Revision ID: 20261114_0011
Revises: 20261114_0010
Create Date: 2026-11-14
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261114_0011"
down_revision: str | None = "20261114_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "environment_contexts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("mission_id", sa.String(length=100), nullable=False),
        sa.Column("location", sa.String(length=32), nullable=False),
        sa.Column("gravity_g", sa.Float(), nullable=False),
        sa.Column("eva_state", sa.String(length=32), nullable=False),
        sa.Column("communication_delay_seconds", sa.Float(), nullable=False),
        sa.Column("expected_metrics", sa.JSON(), nullable=False),
        sa.Column("sensor_set", sa.JSON(), nullable=False),
        sa.Column("effective_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False),
        sa.Column("source_id", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "location IN ('EARTH', 'ISS', 'TRANSIT_VEHICLE', 'LUNAR_HABITAT', "
            "'MARS_HABITAT', 'EVA')",
            name="ck_environment_contexts_location",
        ),
        sa.CheckConstraint(
            "gravity_g >= 0 AND gravity_g <= 3",
            name="ck_environment_contexts_gravity",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_environment_contexts_lookup",
        "environment_contexts",
        ["mission_id", "effective_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_environment_contexts_lookup", table_name="environment_contexts")
    op.drop_table("environment_contexts")
