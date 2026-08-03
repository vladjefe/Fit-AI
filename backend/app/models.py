from __future__ import annotations

from datetime import date, datetime, time, timezone
from decimal import Decimal
import enum

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Role(str, enum.Enum):
    OWNER = "owner"
    TRAINER = "trainer"


class WorkoutStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class ProgressionAction(str, enum.Enum):
    INCREASE = "increase_weight"
    KEEP = "keep_weight"
    REDUCE_VOLUME = "reduce_volume"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    role: Mapped[Role] = mapped_column(Enum(Role, native_enum=False), index=True)
    display_name: Mapped[str | None] = mapped_column(String(100))
    current_cycle_position: Mapped[int] = mapped_column(Integer, default=0)
    cycle_number: Mapped[int] = mapped_column(Integer, default=1)
    selected_workout_template_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class Exercise(Base):
    """Каталог упражнений. user_id = NULL — общий справочник, иначе своё упражнение."""

    __tablename__ = "exercises"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    muscle_group: Mapped[str] = mapped_column(String(40), index=True)
    equipment: Mapped[str] = mapped_column(String(40), index=True)
    image_key: Mapped[str | None] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class WorkoutTemplate(Base):
    """Тренировка пользователя. Позиция в цикле уникальна в пределах владельца."""

    __tablename__ = "workout_templates"
    __table_args__ = (UniqueConstraint("user_id", "cycle_position"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    cycle_position: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    exercises: Mapped[list[ExerciseTemplate]] = relationship(
        back_populates="workout_template",
        cascade="all, delete-orphan",
        order_by="ExerciseTemplate.sort_order",
    )


class ExerciseTemplate(Base):
    __tablename__ = "exercise_templates"
    __table_args__ = (
        UniqueConstraint("workout_template_id", "sort_order"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    workout_template_id: Mapped[int] = mapped_column(
        ForeignKey("workout_templates.id", ondelete="CASCADE"), index=True
    )
    # name и image_key продублированы намеренно: правка каталога не должна
    # задним числом менять уже проведённые тренировки.
    exercise_id: Mapped[int | None] = mapped_column(ForeignKey("exercises.id"))
    # Убранное из тренировки упражнение гасится, а не удаляется: на его строку
    # ссылаются уже записанные подходы.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    name: Mapped[str] = mapped_column(String(160))
    image_key: Mapped[str] = mapped_column(String(160))
    sort_order: Mapped[int] = mapped_column(Integer)
    base_weight_kg: Mapped[Decimal] = mapped_column(Numeric(7, 2))
    target_sets: Mapped[int] = mapped_column(Integer, default=3)
    rep_min: Mapped[int] = mapped_column(Integer)
    rep_max: Mapped[int] = mapped_column(Integer)

    workout_template: Mapped[WorkoutTemplate] = relationship(back_populates="exercises")


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    workout_template_id: Mapped[int] = mapped_column(
        ForeignKey("workout_templates.id"), index=True
    )
    cycle_position: Mapped[int] = mapped_column(Integer)
    cycle_number: Mapped[int] = mapped_column(Integer)
    status: Mapped[WorkoutStatus] = mapped_column(
        Enum(WorkoutStatus, native_enum=False), default=WorkoutStatus.IN_PROGRESS, index=True
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    perceived_exertion: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)
    total_volume_kg: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))

    template: Mapped[WorkoutTemplate] = relationship()
    sets: Mapped[list[ExerciseSet]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class ExerciseSet(Base):
    __tablename__ = "exercise_sets"
    __table_args__ = (
        UniqueConstraint("workout_session_id", "exercise_template_id", "set_number"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    workout_session_id: Mapped[int] = mapped_column(
        ForeignKey("workout_sessions.id", ondelete="CASCADE"), index=True
    )
    exercise_template_id: Mapped[int] = mapped_column(
        ForeignKey("exercise_templates.id"), index=True
    )
    set_number: Mapped[int] = mapped_column(Integer)
    weight_kg: Mapped[Decimal] = mapped_column(Numeric(7, 2))
    reps: Mapped[int] = mapped_column(Integer)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    session: Mapped[WorkoutSession] = relationship(back_populates="sets")
    exercise: Mapped[ExerciseTemplate] = relationship()


class BodyWeight(Base):
    __tablename__ = "body_weight"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    weight_kg: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    note: Mapped[str | None] = mapped_column(String(500))


class NutritionLog(Base):
    __tablename__ = "nutrition_logs"
    __table_args__ = (UniqueConstraint("user_id", "log_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    log_date: Mapped[date] = mapped_column(Date, default=date.today)
    calories: Mapped[int | None] = mapped_column(Integer)
    protein_g: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    fat_g: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    carbs_g: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    note: Mapped[str | None] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class CardioLog(Base):
    __tablename__ = "cardio_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    performed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    activity_type: Mapped[str] = mapped_column(String(50), default="other")
    distance_km: Mapped[Decimal] = mapped_column(Numeric(9, 3))
    duration_seconds: Mapped[int] = mapped_column(Integer)
    pace_seconds_per_km: Mapped[float] = mapped_column(Float)
    average_speed_kmh: Mapped[float] = mapped_column(Float)
    is_personal_best: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[str | None] = mapped_column(String(500))


class PullUpLog(Base):
    __tablename__ = "pull_up_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    performed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    reps: Mapped[int] = mapped_column(Integer)
    added_weight_kg: Mapped[Decimal] = mapped_column(Numeric(7, 2), default=Decimal("0"))


class WellbeingLog(Base):
    __tablename__ = "wellbeing_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    score: Mapped[int] = mapped_column(Integer)
    sleep_hours: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    energy: Mapped[int | None] = mapped_column(Integer)
    soreness: Mapped[int | None] = mapped_column(Integer)


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    goal_type: Mapped[str] = mapped_column(String(50))
    title: Mapped[str] = mapped_column(String(160))
    target_value: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    current_value: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    unit: Mapped[str | None] = mapped_column(String(30))
    target_date: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ProgressPhoto(Base):
    __tablename__ = "progress_photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    taken_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    storage_path: Mapped[str] = mapped_column(String(500))
    pose: Mapped[str | None] = mapped_column(String(30))
    note: Mapped[str | None] = mapped_column(String(500))


class AIReport(Base):
    __tablename__ = "ai_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    week_start: Mapped[date] = mapped_column(Date, index=True)
    prompt_version: Mapped[str] = mapped_column(String(30), default="weekly-v1")
    model: Mapped[str] = mapped_column(String(100))
    report_text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TrainerFeedback(Base):
    __tablename__ = "trainer_feedback"

    id: Mapped[int] = mapped_column(primary_key=True)
    workout_session_id: Mapped[int] = mapped_column(
        ForeignKey("workout_sessions.id", ondelete="CASCADE"), unique=True, index=True
    )
    trainer_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    reaction: Mapped[str | None] = mapped_column(String(20))
    comment: Mapped[str | None] = mapped_column(String(2000))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class Reminder(Base):
    __tablename__ = "reminders"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    reminder_type: Mapped[str] = mapped_column(String(50), default="workout")
    local_time: Mapped[time] = mapped_column(Time)
    timezone: Mapped[str] = mapped_column(String(64), default="Europe/Moscow")
    message: Mapped[str] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PairingCode(Base):
    """Одноразовый код, который бот выдаёт для привязки Android-приложения."""

    __tablename__ = "pairing_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, index=True)
    code_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DeviceToken(Base):
    """Долгоживущий токен устройства: заменяет Telegram initData вне мини-аппа."""

    __tablename__ = "device_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    device_name: Mapped[str | None] = mapped_column(String(100))
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
