"""Record which personal baseline a rule evaluation used.

Revision ID: 20261114_0013
Revises: 20261114_0012
Create Date: 2026-11-14
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20261114_0013"
down_revision: str | None = "20261114_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUMNS = (
    ("baseline_value", sa.Float()),
    ("baseline_classification", sa.String(length=32)),
    ("baseline_sample_count", sa.Integer()),
    ("baseline_profile_version", sa.Integer()),
)


def upgrade() -> None:
    # Nullable: most rules and all earlier evaluations use no personal baseline.
    for name, column_type in COLUMNS:
        op.add_column("rule_evaluations", sa.Column(name, column_type, nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("rule_evaluations") as batch_op:
        for name, _ in reversed(COLUMNS):
            batch_op.drop_column(name)
