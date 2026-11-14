"""Store rule source descriptions as unbounded text.

PostgreSQL enforces VARCHAR(255); a radiation rule source is longer (266
characters) and every demo scenario failed there. SQLite never enforced it.

Revision ID: 20261114_0014
Revises: 20261114_0013
Create Date: 2026-11-14
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20261114_0014"
down_revision: str | None = "20261114_0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("rule_evaluations") as batch_op:
        batch_op.alter_column(
            "source",
            existing_type=sa.String(length=255),
            type_=sa.Text(),
            existing_nullable=False,
        )


def downgrade() -> None:
    # Shorten first; narrowing would otherwise fail on PostgreSQL.
    op.execute("UPDATE rule_evaluations SET source = SUBSTR(source, 1, 255)")
    with op.batch_alter_table("rule_evaluations") as batch_op:
        batch_op.alter_column(
            "source",
            existing_type=sa.Text(),
            type_=sa.String(length=255),
            existing_nullable=False,
        )
