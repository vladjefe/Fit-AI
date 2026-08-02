"""add exercise catalog and user-owned workout templates

Revision ID: d5f30c81ae64
Revises: c4a91f7d2b18
Create Date: 2026-08-02

Шаблоны тренировок были глобальными: UNIQUE на name и cycle_position означал,
что во всей базе существует ровно четыре тренировки. Конструктор требует
привязки к пользователю, поэтому таблица пересоздаётся — в SQLite безымянные
UNIQUE-ограничения иначе не снять.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d5f30c81ae64"
down_revision: Union[str, None] = "c4a91f7d2b18"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "exercises",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("muscle_group", sa.String(length=40), nullable=False),
        sa.Column("equipment", sa.String(length=40), nullable=False),
        sa.Column("image_key", sa.String(length=160), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_exercises_user_id", "exercises", ["user_id"])
    op.create_index("ix_exercises_name", "exercises", ["name"])
    op.create_index("ix_exercises_muscle_group", "exercises", ["muscle_group"])
    op.create_index("ix_exercises_equipment", "exercises", ["equipment"])

    op.create_table(
        "workout_templates_new",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("cycle_position", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "cycle_position"),
    )
    # Существующие шаблоны отдаём владельцу: до сих пор они были общими на всю базу.
    op.execute(
        """
        INSERT INTO workout_templates_new (id, user_id, name, cycle_position, is_active, created_at)
        SELECT id,
               (SELECT id FROM users WHERE role IN ('OWNER', 'owner') ORDER BY id LIMIT 1),
               name, cycle_position, is_active, created_at
        FROM workout_templates
        """
    )
    op.drop_table("workout_templates")
    op.rename_table("workout_templates_new", "workout_templates")
    op.create_index("ix_workout_templates_user_id", "workout_templates", ["user_id"])

    with op.batch_alter_table("exercise_templates") as batch:
        batch.add_column(sa.Column("exercise_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_exercise_templates_exercise_id", "exercises", ["exercise_id"], ["id"]
        )


def downgrade() -> None:
    with op.batch_alter_table("exercise_templates") as batch:
        batch.drop_constraint("fk_exercise_templates_exercise_id", type_="foreignkey")
        batch.drop_column("exercise_id")

    op.create_table(
        "workout_templates_old",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("cycle_position", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
        sa.UniqueConstraint("cycle_position"),
    )
    # Уникальность вернуть можно только для одного пользователя — берём владельца.
    op.execute(
        """
        INSERT INTO workout_templates_old (id, name, cycle_position, is_active, created_at)
        SELECT id, name, cycle_position, is_active, created_at
        FROM workout_templates
        WHERE user_id = (SELECT id FROM users WHERE role IN ('OWNER', 'owner') ORDER BY id LIMIT 1)
           OR user_id IS NULL
        """
    )
    op.drop_table("workout_templates")
    op.rename_table("workout_templates_old", "workout_templates")

    op.drop_index("ix_exercises_equipment", table_name="exercises")
    op.drop_index("ix_exercises_muscle_group", table_name="exercises")
    op.drop_index("ix_exercises_name", table_name="exercises")
    op.drop_index("ix_exercises_user_id", table_name="exercises")
    op.drop_table("exercises")
