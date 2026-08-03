"""distinguish counted exercises from timed ones

Revision ID: a82be5104d77
Revises: f1c7a90d34be
Create Date: 2026-08-03

Планка и прочая статика меряются секундами: без признака единицы их пришлось бы
записывать повторениями.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a82be5104d77"
down_revision: Union[str, None] = "f1c7a90d34be"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table in ("exercises", "exercise_templates"):
        op.add_column(
            table,
            sa.Column("unit", sa.String(length=10), nullable=False, server_default="reps"),
        )
    op.execute("UPDATE exercises SET unit = 'seconds' WHERE name = 'Планка'")


def downgrade() -> None:
    op.drop_column("exercise_templates", "unit")
    op.drop_column("exercises", "unit")
