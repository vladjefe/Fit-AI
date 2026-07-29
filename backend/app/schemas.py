from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator


class ExerciseSetInput(BaseModel):
    exercise_template_id: int
    set_number: int = Field(ge=1, le=20)
    weight_kg: Decimal = Field(ge=0, le=2000)
    reps: int = Field(ge=0, le=1000)
    is_completed: bool = True


class StartWorkoutInput(BaseModel):
    template_id: int | None = Field(default=None, ge=1)


class SelectWorkoutInput(BaseModel):
    template_id: int = Field(ge=1)


class CompleteWorkoutInput(BaseModel):
    perceived_exertion: int | None = Field(default=None, ge=1, le=10)
    notes: str | None = Field(default=None, max_length=2000)


class BodyWeightInput(BaseModel):
    weight_kg: Decimal = Field(gt=20, lt=500)
    measured_at: datetime | None = None
    note: str | None = Field(default=None, max_length=500)


class NutritionInput(BaseModel):
    log_date: date = Field(default_factory=date.today)
    calories: int | None = Field(default=None, ge=0, le=20000)
    protein_g: Decimal | None = Field(default=None, ge=0, le=2000)
    fat_g: Decimal | None = Field(default=None, ge=0, le=2000)
    carbs_g: Decimal | None = Field(default=None, ge=0, le=3000)
    note: str | None = Field(default=None, max_length=1000)


class CardioInput(BaseModel):
    activity_type: str = Field(default="other", min_length=1, max_length=50)
    distance_km: Decimal = Field(gt=0, le=10000)
    duration_seconds: int = Field(gt=0, le=604800)
    performed_at: datetime | None = None
    note: str | None = Field(default=None, max_length=500)

    @field_validator("activity_type")
    @classmethod
    def normalize_activity_type(cls, value: str) -> str:
        return value.strip().lower()


class WeeklyAIInput(BaseModel):
    as_of: datetime | None = None


class PullUpInput(BaseModel):
    reps: int = Field(ge=0, le=100)
    added_weight_kg: Decimal = Field(default=Decimal("0"), ge=0, le=300)
    performed_at: datetime | None = None


class WellbeingInput(BaseModel):
    score: int = Field(ge=1, le=10)
    sleep_hours: Decimal | None = Field(default=None, ge=0, le=24)
    energy: int | None = Field(default=None, ge=1, le=10)
    soreness: int | None = Field(default=None, ge=1, le=10)
    recorded_at: datetime | None = None


class SendTrainerReportInput(BaseModel):
    workout_session_id: int | None = None


class TrainerFeedbackInput(BaseModel):
    reaction: str | None = Field(default=None, pattern="^(thumbs_up)?$")
    comment: str | None = Field(default=None, max_length=2000)


class GoalUpdateInput(BaseModel):
    current_value: Decimal | None = Field(default=None, ge=0, le=100000)
    target_value: Decimal | None = Field(default=None, ge=0, le=100000)
    target_date: date | None = None


class GoalCreateInput(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    goal_type: str = Field(default="custom", min_length=1, max_length=50)
    current_value: Decimal | None = Field(default=None, ge=0, le=100000)
    target_value: Decimal | None = Field(default=None, ge=0, le=100000)
    unit: str | None = Field(default=None, max_length=30)
    target_date: date | None = None


class ReminderUpdateInput(BaseModel):
    is_active: bool | None = None
    local_time: time | None = None
    timezone: str | None = Field(default=None, min_length=1, max_length=64)


class DevicePairInput(BaseModel):
    code: str = Field(min_length=4, max_length=32)
    device_name: str | None = Field(default=None, max_length=100)


class HealthResponse(BaseModel):
    status: str
