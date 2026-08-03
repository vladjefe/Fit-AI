"""drop cardio entries from the workout catalog

Revision ID: b3d17e88c5a1
Revises: a82be5104d77
Create Date: 2026-08-03

Кардио не описывается подходами, повторами и весом, а для него уже есть
отдельная запись с дистанцией и темпом. Записи, попавшие в чью-то тренировку,
не трогаем — на них ссылаются строки шаблонов.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "b3d17e88c5a1"
down_revision: Union[str, None] = "a82be5104d77"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DELETE FROM exercises
        WHERE muscle_group = 'Кардио'
          AND user_id IS NULL
          AND id NOT IN (
              SELECT exercise_id FROM exercise_templates WHERE exercise_id IS NOT NULL
          )
        """
    )


def downgrade() -> None:
    # Записи вернёт сид каталога, если кардио снова добавят в exercise_catalog.py.
    pass
