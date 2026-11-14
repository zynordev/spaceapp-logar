"""Create auditable rule evaluation storage.

Revision ID: 20261114_0002
Revises: 20261114_0001
Create Date: 2026-11-14
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20261114_0002"
down_revision: str | None = "20261114_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "rule_evaluations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("mission_id", sa.String(length=100), nullable=False),
        sa.Column("target_id", sa.String(length=100), nullable=False),
        sa.Column("rule_id", sa.String(length=100), nullable=False),
        sa.Column("rule_version", sa.Integer(), nullable=False),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("data_quality", sa.String(length=32), nullable=False),
        sa.Column("health_attention", sa.String(length=32), nullable=False),
        sa.Column("observed_value", sa.Float(), nullable=True),
        sa.Column("unit", sa.String(length=32), nullable=False),
        sa.Column("threshold", sa.Float(), nullable=False),
        sa.Column("comparison", sa.String(length=16), nullable=False),
        sa.Column("window_minutes", sa.Integer(), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("window_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("valid_minute_buckets", sa.Integer(), nullable=False),
        sa.Column("required_minute_buckets", sa.Integer(), nullable=False),
        sa.Column("longest_missing_run_minutes", sa.Integer(), nullable=False),
        sa.Column("ignored_observations", sa.Integer(), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("source", sa.String(length=255), nullable=False),
        sa.Column("source_uri", sa.String(length=500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_rule_evaluations_lookup",
        "rule_evaluations",
        ["mission_id", "target_id", "rule_id", "evaluated_at"],
        unique=False,
    )
    op.create_table(
        "rule_evaluation_evidence",
        sa.Column("evaluation_id", sa.Uuid(), nullable=False),
        sa.Column("observation_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["evaluation_id"],
            ["rule_evaluations.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["observation_id"],
            ["observations.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("evaluation_id", "observation_id"),
    )


def downgrade() -> None:
    op.drop_table("rule_evaluation_evidence")
    op.drop_index("ix_rule_evaluations_lookup", table_name="rule_evaluations")
    op.drop_table("rule_evaluations")

