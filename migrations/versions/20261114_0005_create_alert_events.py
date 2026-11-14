"""Create alert events with a tracked lifecycle.

Revision ID: 20261114_0005
Revises: 20261114_0004
Create Date: 2026-11-14
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20261114_0005"
down_revision: str | None = "20261114_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "alert_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("mission_id", sa.String(length=100), nullable=False),
        sa.Column("target_id", sa.String(length=100), nullable=False),
        sa.Column("rule_id", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("health_attention", sa.String(length=32), nullable=False),
        sa.Column("action_card_id", sa.String(length=100), nullable=True),
        sa.Column("action_card_version", sa.Integer(), nullable=True),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("opened_evaluation_id", sa.Uuid(), nullable=False),
        sa.Column("last_evaluated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_evaluation_id", sa.Uuid(), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_by", sa.String(length=100), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_evaluation_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')",
            name="ck_alert_events_status",
        ),
        sa.CheckConstraint(
            "(status = 'OPEN' AND acknowledged_at IS NULL "
            "AND resolved_at IS NULL) OR "
            "(status = 'ACKNOWLEDGED' AND acknowledged_at IS NOT NULL "
            "AND resolved_at IS NULL) OR "
            "(status = 'RESOLVED' AND resolved_at IS NOT NULL)",
            name="ck_alert_events_lifecycle",
        ),
        sa.ForeignKeyConstraint(
            ["opened_evaluation_id"],
            ["rule_evaluations.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["last_evaluation_id"],
            ["rule_evaluations.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["resolved_evaluation_id"],
            ["rule_evaluations.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_alert_events_lookup",
        "alert_events",
        ["mission_id", "target_id", "rule_id", "opened_at"],
        unique=False,
    )
    op.create_index(
        "ix_alert_events_status",
        "alert_events",
        ["mission_id", "status", "opened_at"],
        unique=False,
    )
    op.create_index(
        "uq_alert_events_active",
        "alert_events",
        ["mission_id", "target_id", "rule_id"],
        unique=True,
        sqlite_where=sa.text("status IN ('OPEN', 'ACKNOWLEDGED')"),
    )


def downgrade() -> None:
    op.drop_index("uq_alert_events_active", table_name="alert_events")
    op.drop_index("ix_alert_events_status", table_name="alert_events")
    op.drop_index("ix_alert_events_lookup", table_name="alert_events")
    op.drop_table("alert_events")
