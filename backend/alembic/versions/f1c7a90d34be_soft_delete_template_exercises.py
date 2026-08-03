"""keep exercise template rows that recorded sets reference

Revision ID: f1c7a90d34be
Revises: d5f30c81ae64
Create Date: 2026-08-03

Правка тренировки пересоздавала строки упражнений. Записанные подходы ссылаются
на них без каскада, поэтому в бою удаление падало на FOREIGN KEY, а с
выключенными ключами SQLite переиспользовал id и подход доставался чужому
упражнению. Теперь строка гасится флагом.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f1c7a90d34be"
down_revision: Union[str, None] = "d5f30c81ae64"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "exercise_templates",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("exercise_templates", "is_active")
