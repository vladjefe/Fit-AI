"""add selected workout to user

Revision ID: 7b18de44a7a1
Revises: 2e2bac33da0f
Create Date: 2026-07-11
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "7b18de44a7a1"
down_revision: Union[str, None] = "2e2bac33da0f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("selected_workout_template_id", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "selected_workout_template_id")
