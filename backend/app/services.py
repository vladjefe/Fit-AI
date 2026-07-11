from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
import json
from pathlib import Path
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from fastapi import HTTPException, status
from openai import AsyncOpenAI
from starlette.datastructures import UploadFile
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.config import BASE_DIR, Settings
from backend.app.models import (
    AIReport,
    BodyWeight,
    CardioLog,
    ExerciseSet,
    ExerciseTemplate,
    Goal,
    NutritionLog,
    ProgressPhoto,
    PullUpLog,
    ProgressionAction,
    Reminder,
    Role,
    TrainerFeedback,
    User,
    WellbeingLog,
    WorkoutSession,
    WorkoutStatus,
    WorkoutTemplate,
    utcnow,
)
from backend.app.schemas import (
    BodyWeightInput,
    CardioInput,
    CompleteWorkoutInput,
    ExerciseSetInput,
    GoalCreateInput,
    GoalUpdateInput,
    NutritionInput,
    PullUpInput,
    ReminderUpdateInput,
    TrainerFeedbackInput,
    WellbeingInput,
)


def _as_float(value: Decimal | None) -> float | None:
    return float(value) if value is not None else None


def _moscow_today() -> date:
    return utcnow().astimezone(ZoneInfo("Europe/Moscow")).date()


async def _template_for_position(db: AsyncSession, position: int) -> WorkoutTemplate:
    template = await db.scalar(
        select(WorkoutTemplate)
        .options(selectinload(WorkoutTemplate.exercises))
        .where(
            WorkoutTemplate.cycle_position == position,
            WorkoutTemplate.is_active.is_(True),
        )
    )
    if template is None:
        raise HTTPException(status_code=503, detail="Программа тренировок не настроена")
    return template


async def _last_sets_for_exercise(
    db: AsyncSession, user_id: int, exercise_id: int
) -> list[ExerciseSet]:
    latest_session_id = await db.scalar(
        select(WorkoutSession.id)
        .join(ExerciseSet, ExerciseSet.workout_session_id == WorkoutSession.id)
        .where(
            WorkoutSession.user_id == user_id,
            WorkoutSession.status == WorkoutStatus.COMPLETED,
            ExerciseSet.exercise_template_id == exercise_id,
            ExerciseSet.is_completed.is_(True),
        )
        .order_by(WorkoutSession.completed_at.desc())
        .limit(1)
    )
    if latest_session_id is None:
        return []
    return list(
        (
            await db.scalars(
                select(ExerciseSet)
                .where(
                    ExerciseSet.workout_session_id == latest_session_id,
                    ExerciseSet.exercise_template_id == exercise_id,
                    ExerciseSet.is_completed.is_(True),
                )
                .order_by(ExerciseSet.set_number)
            )
        ).all()
    )


def progression_for(
    exercise: ExerciseTemplate, sets: list[ExerciseSet]
) -> dict[str, Any]:
    base_weight = _as_float(exercise.base_weight_kg) or 0.0
    if not sets:
        return {
            "action": ProgressionAction.KEEP.value,
            "recommended_weight_kg": base_weight,
            "recommended_sets": exercise.target_sets,
            "reason": "Стартовый рабочий вес",
        }

    weights = [float(item.weight_kg) for item in sets]
    reps = [item.reps for item in sets]
    working_weight = max(weights)
    full_set_count = len(sets) >= exercise.target_sets

    if full_set_count and all(rep >= exercise.rep_max for rep in reps[: exercise.target_sets]):
        return {
            "action": ProgressionAction.INCREASE.value,
            "recommended_weight_kg": round(working_weight + 2.5, 2),
            "recommended_sets": exercise.target_sets,
            "reason": "Верх диапазона выполнен во всех подходах",
        }

    average_reps = sum(reps) / len(reps)
    strong_shortfall = (not full_set_count) or average_reps < max(1, exercise.rep_min - 2)
    if strong_shortfall:
        return {
            "action": ProgressionAction.REDUCE_VOLUME.value,
            "recommended_weight_kg": working_weight,
            "recommended_sets": max(2, exercise.target_sets - 1),
            "reason": "Сильный недобор: сохранить вес и временно снизить объем",
        }

    return {
        "action": ProgressionAction.KEEP.value,
        "recommended_weight_kg": working_weight,
        "recommended_sets": exercise.target_sets,
        "reason": "Оставить вес до уверенного верхнего диапазона",
    }


async def _exercise_payload(
    db: AsyncSession, owner: User, exercise: ExerciseTemplate
) -> dict[str, Any]:
    last_sets = await _last_sets_for_exercise(db, owner.id, exercise.id)
    return {
        "id": exercise.id,
        "name": exercise.name,
        "image_key": exercise.image_key,
        "image_path": f"/assets/exercises/{exercise.image_key}.png",
        "target_sets": exercise.target_sets,
        "rep_min": exercise.rep_min,
        "rep_max": exercise.rep_max,
        "progression": progression_for(exercise, last_sets),
        "last_sets": [
            {
                "set_number": item.set_number,
                "weight_kg": _as_float(item.weight_kg),
                "reps": item.reps,
            }
            for item in last_sets
        ],
    }


async def _workout_template_payload(
    db: AsyncSession, owner: User, template: WorkoutTemplate
) -> dict[str, Any]:
    return {
        "template_id": template.id,
        "name": template.name,
        "cycle_position": template.cycle_position,
        "cycle_number": owner.cycle_number,
        "is_next": (
            template.id == owner.selected_workout_template_id
            if owner.selected_workout_template_id is not None
            else template.cycle_position == owner.current_cycle_position
        ),
        "exercises": [
            await _exercise_payload(db, owner, exercise)
            for exercise in template.exercises
        ],
    }


async def next_workout(db: AsyncSession, owner: User) -> dict[str, Any]:
    active = await get_active_session(db, owner.id)
    selected_id = active.workout_template_id if active else owner.selected_workout_template_id
    template = None
    if selected_id is not None:
        template = await db.scalar(
            select(WorkoutTemplate)
            .options(selectinload(WorkoutTemplate.exercises))
            .where(WorkoutTemplate.id == selected_id, WorkoutTemplate.is_active.is_(True))
        )
    if template is None:
        template = await _template_for_position(db, owner.current_cycle_position)
    return await _workout_template_payload(db, owner, template)


async def select_workout(
    db: AsyncSession, owner: User, template_id: int
) -> dict[str, Any]:
    if await get_active_session(db, owner.id) is not None:
        raise HTTPException(status_code=409, detail="Сначала завершите или сбросьте активную тренировку")
    template = await db.scalar(
        select(WorkoutTemplate)
        .options(selectinload(WorkoutTemplate.exercises))
        .where(WorkoutTemplate.id == template_id, WorkoutTemplate.is_active.is_(True))
    )
    if template is None:
        raise HTTPException(status_code=404, detail="Тренировка не найдена")
    owner.selected_workout_template_id = template.id
    await db.commit()
    return await _workout_template_payload(db, owner, template)


async def workout_templates(db: AsyncSession, owner: User) -> list[dict[str, Any]]:
    templates = list(
        (
            await db.scalars(
                select(WorkoutTemplate)
                .options(selectinload(WorkoutTemplate.exercises))
                .where(WorkoutTemplate.is_active.is_(True))
                .order_by(WorkoutTemplate.cycle_position)
            )
        ).all()
    )
    return [await _workout_template_payload(db, owner, template) for template in templates]


async def get_active_session(db: AsyncSession, owner_id: int) -> WorkoutSession | None:
    return await db.scalar(
        select(WorkoutSession)
        .where(
            WorkoutSession.user_id == owner_id,
            WorkoutSession.status == WorkoutStatus.IN_PROGRESS,
        )
        .order_by(WorkoutSession.started_at.desc())
    )


async def start_workout(
    db: AsyncSession, owner: User, template_id: int | None = None
) -> dict[str, Any]:
    active = await get_active_session(db, owner.id)
    if active is not None:
        return {
            "session_id": active.id,
            "status": active.status.value,
            "resumed": True,
            "started_at": _aware_utc(active.started_at),
            "template_id": active.workout_template_id,
        }
    selected_id = template_id or owner.selected_workout_template_id
    if selected_id is None:
        template = await _template_for_position(db, owner.current_cycle_position)
    else:
        template = await db.scalar(
            select(WorkoutTemplate)
            .options(selectinload(WorkoutTemplate.exercises))
            .where(WorkoutTemplate.id == selected_id, WorkoutTemplate.is_active.is_(True))
        )
        if template is None:
            raise HTTPException(status_code=404, detail="Тренировка не найдена")
    session = WorkoutSession(
        user_id=owner.id,
        workout_template_id=template.id,
        cycle_position=template.cycle_position,
        cycle_number=owner.cycle_number,
    )
    owner.selected_workout_template_id = template.id
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return {
        "session_id": session.id,
        "status": session.status.value,
        "resumed": False,
        "started_at": _aware_utc(session.started_at),
        "template_id": session.workout_template_id,
    }


async def save_set(
    db: AsyncSession, owner: User, session_id: int, payload: ExerciseSetInput
) -> dict[str, Any]:
    session = await db.scalar(
        select(WorkoutSession).where(
            WorkoutSession.id == session_id, WorkoutSession.user_id == owner.id
        )
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Тренировка не найдена")
    if session.status != WorkoutStatus.IN_PROGRESS:
        raise HTTPException(status_code=409, detail="Тренировка уже завершена")
    exercise = await db.scalar(
        select(ExerciseTemplate).where(
            ExerciseTemplate.id == payload.exercise_template_id,
            ExerciseTemplate.workout_template_id == session.workout_template_id,
        )
    )
    if exercise is None:
        raise HTTPException(status_code=422, detail="Упражнение не входит в тренировку")

    item = await db.scalar(
        select(ExerciseSet).where(
            ExerciseSet.workout_session_id == session.id,
            ExerciseSet.exercise_template_id == exercise.id,
            ExerciseSet.set_number == payload.set_number,
        )
    )
    if item is None:
        item = ExerciseSet(
            workout_session_id=session.id,
            exercise_template_id=exercise.id,
            set_number=payload.set_number,
            weight_kg=payload.weight_kg,
            reps=payload.reps,
            is_completed=payload.is_completed,
        )
        db.add(item)
    else:
        item.weight_kg = payload.weight_kg
        item.reps = payload.reps
        item.is_completed = payload.is_completed
        item.completed_at = utcnow()
    await db.commit()
    await db.refresh(item)
    return {
        "id": item.id,
        "exercise_template_id": item.exercise_template_id,
        "set_number": item.set_number,
        "weight_kg": _as_float(item.weight_kg),
        "reps": item.reps,
        "is_completed": item.is_completed,
    }


async def complete_workout(
    db: AsyncSession, owner: User, session_id: int, payload: CompleteWorkoutInput
) -> dict[str, Any]:
    session = await db.scalar(
        select(WorkoutSession)
        .options(selectinload(WorkoutSession.sets), selectinload(WorkoutSession.template))
        .where(WorkoutSession.id == session_id, WorkoutSession.user_id == owner.id)
        .with_for_update()
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Тренировка не найдена")
    if session.status == WorkoutStatus.COMPLETED:
        summary = await workout_summary(db, session)
        summary["newly_completed"] = False
        return summary
    if session.status != WorkoutStatus.IN_PROGRESS:
        raise HTTPException(status_code=409, detail="Нельзя завершить отмененную тренировку")
    completed_sets = [item for item in session.sets if item.is_completed]
    if not completed_sets:
        raise HTTPException(status_code=422, detail="Сохраните хотя бы один подход")

    session.status = WorkoutStatus.COMPLETED
    session.completed_at = utcnow()
    session.perceived_exertion = payload.perceived_exertion
    session.notes = payload.notes
    session.total_volume_kg = sum(
        (item.weight_kg * item.reps for item in completed_sets), Decimal("0")
    )

    if owner.current_cycle_position == session.cycle_position:
        if owner.current_cycle_position == 3:
            owner.current_cycle_position = 0
            owner.cycle_number += 1
        else:
            owner.current_cycle_position += 1
    owner.selected_workout_template_id = None
    await db.commit()
    await db.refresh(session)
    summary = await workout_summary(db, session)
    summary["newly_completed"] = True
    return summary


async def cancel_workout(db: AsyncSession, owner: User, session_id: int) -> dict[str, Any]:
    session = await db.scalar(
        select(WorkoutSession)
        .options(selectinload(WorkoutSession.template))
        .where(
            WorkoutSession.id == session_id,
            WorkoutSession.user_id == owner.id,
        )
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Тренировка не найдена")
    if session.status == WorkoutStatus.COMPLETED:
        raise HTTPException(status_code=409, detail="Завершённую тренировку нельзя сбросить")
    session.status = WorkoutStatus.CANCELLED
    await db.commit()
    return {"session_id": session.id, "status": session.status.value}


async def delete_workout_session(
    db: AsyncSession, owner: User, session_id: int
) -> dict[str, Any]:
    session = await db.scalar(
        select(WorkoutSession)
        .options(selectinload(WorkoutSession.template))
        .where(
            WorkoutSession.id == session_id,
            WorkoutSession.user_id == owner.id,
        )
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Тренировка не найдена")
    deleted_name = session.template.name if session.template else None
    await db.delete(session)
    await db.flush()
    await _recalculate_cycle_from_completed(db, owner)
    await db.commit()
    return {"deleted": True, "session_id": session_id, "workout_name": deleted_name}


async def delete_latest_workout_session(db: AsyncSession, owner: User) -> dict[str, Any]:
    session = await db.scalar(
        select(WorkoutSession)
        .where(
            WorkoutSession.user_id == owner.id,
            WorkoutSession.status.in_([WorkoutStatus.IN_PROGRESS, WorkoutStatus.COMPLETED]),
        )
        .order_by(desc(WorkoutSession.started_at))
        .limit(1)
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Тренировок для удаления нет")
    return await delete_workout_session(db, owner, session.id)


async def _recalculate_cycle_from_completed(db: AsyncSession, owner: User) -> None:
    completed_count = await db.scalar(
        select(func.count(WorkoutSession.id)).where(
            WorkoutSession.user_id == owner.id,
            WorkoutSession.status == WorkoutStatus.COMPLETED,
        )
    )
    count = int(completed_count or 0)
    owner.current_cycle_position = count % 4
    owner.cycle_number = count // 4 + 1


async def workout_summary(db: AsyncSession, session: WorkoutSession) -> dict[str, Any]:
    if "sets" not in session.__dict__:
        session = await db.scalar(
            select(WorkoutSession)
            .options(selectinload(WorkoutSession.sets), selectinload(WorkoutSession.template))
            .where(WorkoutSession.id == session.id)
        )
        assert session is not None
    grouped: dict[int, list[ExerciseSet]] = defaultdict(list)
    for item in session.sets:
        if item.is_completed:
            grouped[item.exercise_template_id].append(item)
    exercise_rows = list(
        (
            await db.scalars(
                select(ExerciseTemplate)
                .where(ExerciseTemplate.id.in_(grouped.keys()))
                .order_by(ExerciseTemplate.sort_order)
            )
        ).all()
    ) if grouped else []
    progression = [
        {
            "exercise_id": exercise.id,
            "exercise_name": exercise.name,
            **progression_for(exercise, grouped[exercise.id]),
        }
        for exercise in exercise_rows
    ]
    return {
        "session_id": session.id,
        "status": session.status.value,
        "workout_name": session.template.name,
        "completed_at": session.completed_at,
        "total_volume_kg": _as_float(session.total_volume_kg),
        "next_cycle_position": (session.cycle_position + 1) % 4,
        "progression": progression,
    }


async def dashboard(db: AsyncSession, owner: User) -> dict[str, Any]:
    upcoming = await next_workout(db, owner)
    templates = await workout_templates(db, owner)
    active = await get_active_session(db, owner.id)
    latest_weight = await db.scalar(
        select(BodyWeight).where(BodyWeight.user_id == owner.id).order_by(desc(BodyWeight.measured_at))
    )
    today_local = _moscow_today()
    today_utc = utcnow().date()
    nutrition_dates = [today_local] if today_local == today_utc else [today_local, today_utc]
    today_nutrition = await db.scalar(
        select(NutritionLog)
        .where(
            NutritionLog.user_id == owner.id,
            NutritionLog.log_date.in_(nutrition_dates),
        )
        .order_by(desc(NutritionLog.log_date))
    )
    last_session = await db.scalar(
        select(WorkoutSession)
        .options(selectinload(WorkoutSession.template))
        .where(
            WorkoutSession.user_id == owner.id,
            WorkoutSession.status == WorkoutStatus.COMPLETED,
        )
        .order_by(desc(WorkoutSession.completed_at))
    )
    best_pullups = await db.scalar(
        select(func.max(PullUpLog.reps)).where(PullUpLog.user_id == owner.id)
    )
    latest_cardio = await db.scalar(
        select(CardioLog)
        .where(CardioLog.user_id == owner.id)
        .order_by(desc(CardioLog.performed_at))
    )
    return {
        "user": {"display_name": owner.display_name, "cycle_number": owner.cycle_number},
        "next_workout": upcoming,
        "workout_templates": templates,
        "active_session_id": active.id if active else None,
        "active_session_started_at": _aware_utc(active.started_at) if active else None,
        "active_workout_template_id": active.workout_template_id if active else None,
        "latest_weight_kg": _as_float(latest_weight.weight_kg) if latest_weight else None,
        "nutrition_today": _nutrition_dict(today_nutrition) if today_nutrition else None,
        "best_pullups": best_pullups or 0,
        "latest_cardio": (
            {
                "distance_km": _as_float(latest_cardio.distance_km),
                "duration_seconds": latest_cardio.duration_seconds,
                "pace_seconds_per_km": round(latest_cardio.pace_seconds_per_km, 2),
                "average_speed_kmh": round(latest_cardio.average_speed_kmh, 2),
                "is_personal_best": latest_cardio.is_personal_best,
            }
            if latest_cardio
            else None
        ),
        "last_workout": (
            {
                "id": last_session.id,
                "name": last_session.template.name,
                "completed_at": last_session.completed_at,
                "total_volume_kg": _as_float(last_session.total_volume_kg),
            }
            if last_session
            else None
        ),
    }


async def add_body_weight(
    db: AsyncSession, owner: User, payload: BodyWeightInput
) -> dict[str, Any]:
    item = BodyWeight(
        user_id=owner.id,
        weight_kg=payload.weight_kg,
        measured_at=payload.measured_at or utcnow(),
        note=payload.note,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return {"id": item.id, "weight_kg": _as_float(item.weight_kg), "measured_at": item.measured_at}


def _nutrition_dict(item: NutritionLog) -> dict[str, Any]:
    return {
        "id": item.id,
        "log_date": item.log_date,
        "calories": item.calories,
        "protein_g": _as_float(item.protein_g),
        "fat_g": _as_float(item.fat_g),
        "carbs_g": _as_float(item.carbs_g),
        "note": item.note,
    }


async def add_nutrition(
    db: AsyncSession, owner: User, payload: NutritionInput
) -> dict[str, Any]:
    item = await db.scalar(
        select(NutritionLog).where(
            NutritionLog.user_id == owner.id, NutritionLog.log_date == payload.log_date
        )
    )
    if item is None:
        item = NutritionLog(user_id=owner.id, log_date=payload.log_date)
        db.add(item)
    item.calories = payload.calories
    item.protein_g = payload.protein_g
    item.fat_g = payload.fat_g
    item.carbs_g = payload.carbs_g
    item.note = payload.note
    await db.commit()
    await db.refresh(item)
    return _nutrition_dict(item)


async def add_cardio(db: AsyncSession, owner: User, payload: CardioInput) -> dict[str, Any]:
    distance = float(payload.distance_km)
    pace = payload.duration_seconds / distance
    speed = distance / (payload.duration_seconds / 3600)
    best_speed = await db.scalar(
        select(func.max(CardioLog.average_speed_kmh)).where(
            CardioLog.user_id == owner.id,
            CardioLog.activity_type == payload.activity_type,
        )
    )
    is_best = best_speed is None or speed > float(best_speed)
    if is_best:
        previous_best = list(
            (
                await db.scalars(
                    select(CardioLog).where(
                        CardioLog.user_id == owner.id,
                        CardioLog.activity_type == payload.activity_type,
                        CardioLog.is_personal_best.is_(True),
                    )
                )
            ).all()
        )
        for old in previous_best:
            old.is_personal_best = False
    item = CardioLog(
        user_id=owner.id,
        performed_at=payload.performed_at or utcnow(),
        activity_type=payload.activity_type,
        distance_km=payload.distance_km,
        duration_seconds=payload.duration_seconds,
        pace_seconds_per_km=pace,
        average_speed_kmh=speed,
        is_personal_best=is_best,
        note=payload.note,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return {
        "id": item.id,
        "distance_km": _as_float(item.distance_km),
        "duration_seconds": item.duration_seconds,
        "pace_seconds_per_km": round(item.pace_seconds_per_km, 2),
        "average_speed_kmh": round(item.average_speed_kmh, 2),
        "is_personal_best": item.is_personal_best,
    }


async def add_pull_up(db: AsyncSession, owner: User, payload: PullUpInput) -> dict[str, Any]:
    item = PullUpLog(
        user_id=owner.id,
        reps=payload.reps,
        added_weight_kg=payload.added_weight_kg,
        performed_at=payload.performed_at or utcnow(),
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return {
        "id": item.id,
        "reps": item.reps,
        "added_weight_kg": _as_float(item.added_weight_kg),
        "performed_at": item.performed_at,
    }


async def add_wellbeing(
    db: AsyncSession, owner: User, payload: WellbeingInput
) -> dict[str, Any]:
    item = WellbeingLog(
        user_id=owner.id,
        score=payload.score,
        sleep_hours=payload.sleep_hours,
        energy=payload.energy,
        soreness=payload.soreness,
        recorded_at=payload.recorded_at or utcnow(),
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return {
        "id": item.id,
        "score": item.score,
        "sleep_hours": _as_float(item.sleep_hours),
        "energy": item.energy,
        "soreness": item.soreness,
        "recorded_at": item.recorded_at,
    }


async def goals(db: AsyncSession, owner: User) -> list[dict[str, Any]]:
    rows = (
        await db.scalars(
            select(Goal).where(Goal.user_id == owner.id, Goal.is_active.is_(True))
        )
    ).all()
    return [_goal_dict(item) for item in rows]


async def create_goal(
    db: AsyncSession, owner: User, payload: GoalCreateInput
) -> dict[str, Any]:
    goal = Goal(
        user_id=owner.id,
        goal_type=payload.goal_type.strip() or "custom",
        title=payload.title.strip(),
        current_value=payload.current_value,
        target_value=payload.target_value,
        unit=payload.unit.strip() if payload.unit else None,
        target_date=payload.target_date,
    )
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return _goal_dict(goal)


async def update_goal(
    db: AsyncSession, owner: User, goal_id: int, payload: GoalUpdateInput
) -> dict[str, Any]:
    goal = await db.scalar(
        select(Goal).where(Goal.id == goal_id, Goal.user_id == owner.id)
    )
    if goal is None:
        raise HTTPException(status_code=404, detail="Цель не найдена")
    if "current_value" in payload.model_fields_set:
        goal.current_value = payload.current_value
    if "target_value" in payload.model_fields_set:
        goal.target_value = payload.target_value
    if "target_date" in payload.model_fields_set:
        goal.target_date = payload.target_date
    await db.commit()
    await db.refresh(goal)
    return _goal_dict(goal)


def _goal_dict(item: Goal) -> dict[str, Any]:
    return {
        "id": item.id,
        "type": item.goal_type,
        "title": item.title,
        "target_value": _as_float(item.target_value),
        "current_value": _as_float(item.current_value),
        "unit": item.unit,
        "target_date": item.target_date,
    }


async def reminders(db: AsyncSession, owner: User) -> list[dict[str, Any]]:
    rows = list(
        (
            await db.scalars(
                select(Reminder)
                .where(Reminder.user_id == owner.id)
                .order_by(Reminder.local_time, Reminder.id)
            )
        ).all()
    )
    return [_reminder_dict(item) for item in rows]


async def update_reminder(
    db: AsyncSession, owner: User, reminder_id: int, payload: ReminderUpdateInput
) -> dict[str, Any]:
    reminder = await db.scalar(
        select(Reminder).where(Reminder.id == reminder_id, Reminder.user_id == owner.id)
    )
    if reminder is None:
        raise HTTPException(status_code=404, detail="Напоминание не найдено")
    if "is_active" in payload.model_fields_set:
        reminder.is_active = bool(payload.is_active)
    if payload.local_time is not None:
        reminder.local_time = payload.local_time
    if payload.timezone:
        reminder.timezone = payload.timezone
    await db.commit()
    await db.refresh(reminder)
    return _reminder_dict(reminder)


def _reminder_dict(item: Reminder) -> dict[str, Any]:
    return {
        "id": item.id,
        "type": item.reminder_type,
        "local_time": item.local_time.isoformat(timespec="minutes"),
        "timezone": item.timezone,
        "message": item.message,
        "is_active": item.is_active,
        "last_sent_at": item.last_sent_at,
    }


async def workout_detail(db: AsyncSession, owner: User, session_id: int) -> dict[str, Any]:
    session = await db.scalar(
        select(WorkoutSession)
        .options(
            selectinload(WorkoutSession.template),
            selectinload(WorkoutSession.sets).selectinload(ExerciseSet.exercise),
        )
        .where(WorkoutSession.id == session_id, WorkoutSession.user_id == owner.id)
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Тренировка не найдена")
    grouped: dict[int, list[ExerciseSet]] = defaultdict(list)
    for item in sorted(
        session.sets,
        key=lambda value: (value.exercise.sort_order, value.set_number),
    ):
        if item.is_completed:
            grouped[item.exercise_template_id].append(item)
    exercises = []
    for exercise_id, rows in grouped.items():
        exercise = rows[0].exercise
        exercises.append(
            {
                "id": exercise_id,
                "name": exercise.name,
                "image_key": exercise.image_key,
                "image_path": f"/assets/exercises/{exercise.image_key}.png",
                "sets": [
                    {
                        "set_number": row.set_number,
                        "weight_kg": _as_float(row.weight_kg),
                        "reps": row.reps,
                    }
                    for row in rows
                ],
            }
        )
    return {
        "session_id": session.id,
        "status": session.status.value,
        "workout_name": session.template.name,
        "started_at": session.started_at,
        "completed_at": session.completed_at,
        "total_volume_kg": _as_float(session.total_volume_kg),
        "perceived_exertion": session.perceived_exertion,
        "notes": session.notes,
        "exercises": exercises,
    }


async def progress_photos(db: AsyncSession, owner: User) -> list[dict[str, Any]]:
    rows = list(
        (
            await db.scalars(
                select(ProgressPhoto)
                .where(ProgressPhoto.user_id == owner.id)
                .order_by(desc(ProgressPhoto.taken_at))
                .limit(30)
            )
        ).all()
    )
    return [_progress_photo_dict(item) for item in rows]


async def progress_photo_path(
    db: AsyncSession, owner: User, photo_id: int
) -> Path:
    item = await db.scalar(
        select(ProgressPhoto).where(
            ProgressPhoto.id == photo_id,
            ProgressPhoto.user_id == owner.id,
        )
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Фото не найдено")
    path = (BASE_DIR / item.storage_path).resolve()
    allowed = (BASE_DIR / "data" / "progress_photos" / str(owner.id)).resolve()
    if allowed not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="Файл фото не найден")
    return path


async def add_progress_photo(
    db: AsyncSession,
    owner: User,
    upload: UploadFile,
    pose: str | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    content_type = (upload.content_type or "").lower()
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=422, detail="Загрузите изображение")
    suffix = _safe_image_suffix(upload.filename, content_type)
    content = await upload.read()
    if not content:
        raise HTTPException(status_code=422, detail="Файл пустой")
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Фото должно быть меньше 8 МБ")

    directory = BASE_DIR / "data" / "progress_photos" / str(owner.id)
    directory.mkdir(parents=True, exist_ok=True)
    filename = f"{utcnow().strftime('%Y%m%d%H%M%S')}-{uuid4().hex}{suffix}"
    path = directory / filename
    path.write_bytes(content)
    relative_path = path.relative_to(BASE_DIR).as_posix()
    item = ProgressPhoto(
        user_id=owner.id,
        storage_path=relative_path,
        pose=pose or None,
        note=note or None,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return _progress_photo_dict(item)


def _safe_image_suffix(filename: str | None, content_type: str) -> str:
    suffix = Path(filename or "").suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}:
        return suffix
    if content_type == "image/png":
        return ".png"
    if content_type == "image/webp":
        return ".webp"
    if content_type in {"image/heic", "image/heif"}:
        return ".heic"
    return ".jpg"


def _progress_photo_dict(item: ProgressPhoto) -> dict[str, Any]:
    return {
        "id": item.id,
        "taken_at": item.taken_at,
        "pose": item.pose,
        "note": item.note,
        "stored": True,
    }


async def progress(db: AsyncSession, owner: User, weeks: int = 8) -> dict[str, Any]:
    since = utcnow() - timedelta(weeks=weeks)
    sessions = list(
        (
            await db.scalars(
                select(WorkoutSession)
                .options(selectinload(WorkoutSession.template), selectinload(WorkoutSession.sets))
                .where(
                    WorkoutSession.user_id == owner.id,
                    WorkoutSession.status == WorkoutStatus.COMPLETED,
                    WorkoutSession.completed_at >= since,
                )
                .order_by(WorkoutSession.completed_at)
            )
        ).all()
    )
    weights = list(
        (
            await db.scalars(
                select(BodyWeight)
                .where(BodyWeight.user_id == owner.id, BodyWeight.measured_at >= since)
                .order_by(BodyWeight.measured_at)
            )
        ).all()
    )
    nutrition = list(
        (
            await db.scalars(
                select(NutritionLog)
                .where(
                    NutritionLog.user_id == owner.id,
                    NutritionLog.log_date >= since.date(),
                )
                .order_by(NutritionLog.log_date)
            )
        ).all()
    )
    cardio = list(
        (
            await db.scalars(
                select(CardioLog)
                .where(CardioLog.user_id == owner.id, CardioLog.performed_at >= since)
                .order_by(CardioLog.performed_at)
            )
        ).all()
    )
    first_weight = _as_float(weights[0].weight_kg) if weights else None
    latest_weight = _as_float(weights[-1].weight_kg) if weights else None
    calories = [item.calories for item in nutrition if item.calories is not None]
    protein = [
        float(item.protein_g)
        for item in nutrition
        if item.protein_g is not None
    ]
    average_calories = round(sum(calories) / len(calories)) if calories else None
    average_protein = round(sum(protein) / len(protein), 1) if protein else None
    return {
        "period_weeks": weeks,
        "workouts_completed": len(sessions),
        "total_volume_kg": round(sum(float(s.total_volume_kg or 0) for s in sessions), 2),
        "weight_stats": {
            "first_kg": first_weight,
            "latest_kg": latest_weight,
            "change_kg": round(latest_weight - first_weight, 2)
            if latest_weight is not None and first_weight is not None
            else None,
            "entries": len(weights),
            "min_kg": min((_as_float(item.weight_kg) or 0 for item in weights), default=None),
            "max_kg": max((_as_float(item.weight_kg) or 0 for item in weights), default=None),
        },
        "nutrition_stats": {
            "logged_days": len(nutrition),
            "average_calories": average_calories,
            "average_protein_g": average_protein,
        },
        "workouts": [
            {
                "id": s.id,
                "name": s.template.name,
                "completed_at": s.completed_at,
                "volume_kg": _as_float(s.total_volume_kg),
                "exercise_count": len({item.exercise_template_id for item in s.sets}),
            }
            for s in sessions
        ],
        "body_weight": [
            {"measured_at": w.measured_at, "weight_kg": _as_float(w.weight_kg)} for w in weights
        ],
        "nutrition": [_nutrition_dict(item) for item in nutrition],
        "cardio": [
            {
                "performed_at": c.performed_at,
                "activity_type": c.activity_type,
                "distance_km": _as_float(c.distance_km),
                "pace_seconds_per_km": round(c.pace_seconds_per_km, 2),
                "average_speed_kmh": round(c.average_speed_kmh, 2),
                "is_personal_best": c.is_personal_best,
            }
            for c in cardio
        ],
    }


def _local_day_bounds(day: date, timezone_name: str = "Europe/Moscow") -> tuple[datetime, datetime]:
    tz = ZoneInfo(timezone_name)
    start = datetime.combine(day, time.min, tzinfo=tz)
    end = start + timedelta(days=1)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


async def daily_summary(
    db: AsyncSession, owner: User, day: date | None = None
) -> dict[str, Any]:
    day = day or _moscow_today()
    start_dt, end_dt = _local_day_bounds(day)
    weights = list(
        (
            await db.scalars(
                select(BodyWeight)
                .where(
                    BodyWeight.user_id == owner.id,
                    BodyWeight.measured_at >= start_dt,
                    BodyWeight.measured_at < end_dt,
                )
                .order_by(BodyWeight.measured_at)
            )
        ).all()
    )
    nutrition = await db.scalar(
        select(NutritionLog).where(
            NutritionLog.user_id == owner.id,
            NutritionLog.log_date == day,
        )
    )
    sessions = list(
        (
            await db.scalars(
                select(WorkoutSession)
                .options(
                    selectinload(WorkoutSession.template),
                    selectinload(WorkoutSession.sets).selectinload(ExerciseSet.exercise),
                )
                .where(
                    WorkoutSession.user_id == owner.id,
                    WorkoutSession.status == WorkoutStatus.COMPLETED,
                    WorkoutSession.completed_at >= start_dt,
                    WorkoutSession.completed_at < end_dt,
                )
                .order_by(WorkoutSession.completed_at)
            )
        ).all()
    )
    pull_ups = list(
        (
            await db.scalars(
                select(PullUpLog)
                .where(
                    PullUpLog.user_id == owner.id,
                    PullUpLog.performed_at >= start_dt,
                    PullUpLog.performed_at < end_dt,
                )
                .order_by(PullUpLog.performed_at)
            )
        ).all()
    )
    return {
        "date": day.isoformat(),
        "weight": (
            {
                "first_kg": _as_float(weights[0].weight_kg),
                "latest_kg": _as_float(weights[-1].weight_kg),
                "entries": len(weights),
            }
            if weights
            else None
        ),
        "nutrition": _nutrition_dict(nutrition) if nutrition else None,
        "workouts": [
            {
                "id": session.id,
                "name": session.template.name,
                "completed_at": session.completed_at,
                "exercise_count": len({item.exercise_template_id for item in session.sets if item.is_completed}),
                "sets_count": len([item for item in session.sets if item.is_completed]),
            }
            for session in sessions
        ],
        "pull_ups": [
            {
                "reps": item.reps,
                "added_weight_kg": _as_float(item.added_weight_kg),
                "performed_at": item.performed_at,
            }
            for item in pull_ups
        ],
    }


def format_daily_summary(summary: dict[str, Any]) -> str:
    day = datetime.fromisoformat(summary["date"]).strftime("%d.%m.%Y")
    weight = summary.get("weight")
    nutrition = summary.get("nutrition")
    workouts = summary.get("workouts") or []
    pull_ups = summary.get("pull_ups") or []

    lines = [f"📅 FIT AI · статистика дня {day}"]
    if weight:
        lines.append(f"⚖️ Вес: {weight['latest_kg']:g} кг")
    else:
        lines.append("⚖️ Вес: не записан")

    if nutrition:
        protein = nutrition.get("protein_g")
        lines.append(
            f"🥗 Питание: {nutrition.get('calories') or 0} ккал"
            + (f", белок {protein:g} г" if protein is not None else "")
        )
    else:
        lines.append("🥗 Питание: не записано")

    if workouts:
        for workout in workouts:
            lines.append(
                f"💪 {workout['name']}: {workout['exercise_count']} упр., {workout['sets_count']} подходов"
            )
    else:
        lines.append("💪 Тренировка: нет")

    if pull_ups:
        best = max(item["reps"] for item in pull_ups)
        lines.append(f"🏆 Подтягивания: максимум {best}")

    lines.append("—")
    lines.append("Можно переслать это сообщение тренеру или себе в заметки.")
    return "\n".join(lines)


def _aware_utc(value: datetime | None) -> datetime:
    value = value or utcnow()
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


async def build_ai_context(
    db: AsyncSession, owner_id: int, as_of: datetime | None = None
) -> dict[str, Any]:
    """Build an allowlisted fitness-only context for the rolling last seven days."""
    end_dt = _aware_utc(as_of)
    start_dt = end_dt - timedelta(days=7)
    end_date_exclusive = end_dt.date() + timedelta(days=1)

    sessions = list(
        (
            await db.scalars(
                select(WorkoutSession)
                .options(
                    selectinload(WorkoutSession.template),
                    selectinload(WorkoutSession.sets).selectinload(ExerciseSet.exercise),
                )
                .where(
                    WorkoutSession.user_id == owner_id,
                    WorkoutSession.status == WorkoutStatus.COMPLETED,
                    WorkoutSession.completed_at >= start_dt,
                    WorkoutSession.completed_at <= end_dt,
                )
                .order_by(WorkoutSession.completed_at)
            )
        ).all()
    )
    nutrition = list(
        (
            await db.scalars(
                select(NutritionLog)
                .where(
                    NutritionLog.user_id == owner_id,
                    NutritionLog.log_date >= start_dt.date(),
                    NutritionLog.log_date < end_date_exclusive,
                )
                .order_by(NutritionLog.log_date)
            )
        ).all()
    )
    weights = list(
        (
            await db.scalars(
                select(BodyWeight)
                .where(
                    BodyWeight.user_id == owner_id,
                    BodyWeight.measured_at >= start_dt,
                    BodyWeight.measured_at <= end_dt,
                )
                .order_by(BodyWeight.measured_at)
            )
        ).all()
    )
    cardio = list(
        (
            await db.scalars(
                select(CardioLog)
                .where(
                    CardioLog.user_id == owner_id,
                    CardioLog.performed_at >= start_dt,
                    CardioLog.performed_at <= end_dt,
                )
                .order_by(CardioLog.performed_at)
            )
        ).all()
    )
    pull_ups = list(
        (
            await db.scalars(
                select(PullUpLog)
                .where(
                    PullUpLog.user_id == owner_id,
                    PullUpLog.performed_at >= start_dt,
                    PullUpLog.performed_at <= end_dt,
                )
                .order_by(PullUpLog.performed_at)
            )
        ).all()
    )
    wellbeing = list(
        (
            await db.scalars(
                select(WellbeingLog)
                .where(
                    WellbeingLog.user_id == owner_id,
                    WellbeingLog.recorded_at >= start_dt,
                    WellbeingLog.recorded_at <= end_dt,
                )
                .order_by(WellbeingLog.recorded_at)
            )
        ).all()
    )

    # This payload intentionally contains no user id/name/Telegram data, notes or photos.
    return {
        "period": {
            "days": 7,
            "from": start_dt.isoformat(),
            "to": end_dt.isoformat(),
        },
        "body_weight": [
            {"date": item.measured_at.date().isoformat(), "kg": _as_float(item.weight_kg)}
            for item in weights
        ],
        "nutrition": [
            {
                "date": item.log_date.isoformat(),
                "calories": item.calories,
                "protein_g": _as_float(item.protein_g),
                "fat_g": _as_float(item.fat_g),
                "carbs_g": _as_float(item.carbs_g),
            }
            for item in nutrition
        ],
        "workouts": [
            {
                "date": (item.completed_at or item.started_at).date().isoformat(),
                "name": item.template.name,
                "perceived_exertion": item.perceived_exertion,
                "sets": [
                    {
                        "exercise": set_item.exercise.name,
                        "weight_kg": _as_float(set_item.weight_kg),
                        "reps": set_item.reps,
                    }
                    for set_item in item.sets
                    if set_item.is_completed
                ],
            }
            for item in sessions
        ],
        "cardio": [
            {
                "date": item.performed_at.date().isoformat(),
                "type": item.activity_type,
                "distance_km": _as_float(item.distance_km),
                "duration_seconds": item.duration_seconds,
                "pace_seconds_per_km": round(item.pace_seconds_per_km, 2),
                "average_speed_kmh": round(item.average_speed_kmh, 2),
            }
            for item in cardio
        ],
        "pull_ups": [
            {
                "date": item.performed_at.date().isoformat(),
                "reps": item.reps,
                "added_weight_kg": _as_float(item.added_weight_kg),
            }
            for item in pull_ups
        ],
        "wellbeing": [
            {
                "date": item.recorded_at.date().isoformat(),
                "score": item.score,
                "sleep_hours": _as_float(item.sleep_hours),
                "energy": item.energy,
                "soreness": item.soreness,
            }
            for item in wellbeing
        ],
    }


async def weekly_ai_analysis(
    db: AsyncSession,
    owner: User,
    settings: Settings,
    as_of: datetime | None = None,
    client: Any | None = None,
) -> dict[str, Any]:
    if owner.role != Role.OWNER:
        raise HTTPException(status_code=403, detail="⛔ Доступ запрещен")
    context = await build_ai_context(db, owner.id, as_of)
    report_model = settings.openai_model
    if client is None:
        if not settings.openai_api_key:
            text = _local_ai_stub(context)
            report_model = "local-stub-v1"
        else:
            client = AsyncOpenAI(api_key=settings.openai_api_key)

    if client is not None:
        response = await client.responses.create(
            model=settings.openai_model,
            instructions=(
                "Ты AI Coach в личном фитнес-дневнике. Используй только переданные данные за 7 дней. "
                "Фокусируйся на весе, питании и силовых тренировках; кардио не анализируй. "
                "Ответь кратко на русском ровно тремя нумерованными разделами: "
                "1) Что хорошо. 2) Что улучшить. 3) Что делать на следующей неделе. "
                "В каждом разделе не более двух коротких предложений. Не ставь диагнозы, "
                "не выдумывай данные и не упоминай персональные данные."
            ),
            input=json.dumps(context, ensure_ascii=False, default=str),
            max_output_tokens=350,
        )
        text = response.output_text.strip()
    if not text:
        raise HTTPException(status_code=502, detail="AI Coach вернул пустой ответ")
    start = datetime.fromisoformat(context["period"]["from"]).date()
    report = AIReport(
        user_id=owner.id,
        week_start=start,
        prompt_version="rolling-7d-v2",
        model=report_model,
        report_text=text,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return {"id": report.id, "period": context["period"], "analysis": text}


def _local_ai_stub(context: dict[str, Any]) -> str:
    workouts = context["workouts"]
    nutrition = context["nutrition"]
    weights = context["body_weight"]
    total_sets = sum(len(item["sets"]) for item in workouts)
    protein_values = [item["protein_g"] for item in nutrition if item["protein_g"] is not None]
    calorie_values = [item["calories"] for item in nutrition if item["calories"] is not None]
    avg_protein = round(sum(protein_values) / len(protein_values), 1) if protein_values else None
    avg_calories = round(sum(calorie_values) / len(calorie_values)) if calorie_values else None
    weight_delta = (
        round(weights[-1]["kg"] - weights[0]["kg"], 1)
        if len(weights) >= 2 and weights[0]["kg"] is not None and weights[-1]["kg"] is not None
        else None
    )

    if workouts:
        good = f"{len(workouts)} трен. и {total_sets} записанных подходов"
    elif weights or nutrition:
        good = "ты уже ведёшь вес и питание, база для анализа появилась"
    else:
        good = "данных пока мало, но дневник готов к нормальному трекингу"

    if weight_delta is not None:
        trend = "вес снижается" if weight_delta < 0 else "вес растёт" if weight_delta > 0 else "вес стабилен"
        good += f"; {trend} ({weight_delta:+g} кг)"

    if not weights:
        improve = "добавь утренние измерения веса"
    elif not nutrition:
        improve = "записывай калории и белок каждый день"
    elif not protein_values:
        improve = "записывай белок вместе с калориями"
    elif avg_protein is not None and avg_protein < 130:
        improve = f"подними средний белок: сейчас около {avg_protein:g} г"
    elif len(nutrition) < 4:
        improve = "сделай питание регулярнее: сейчас мало дней с записями"
    else:
        improve = "следи за восстановлением и качеством рабочих подходов"

    nutrition_target = (
        f"держи около {avg_calories} ккал и {avg_protein:g} г белка"
        if avg_calories and avg_protein
        else "запиши калории и белок минимум 4 дня подряд"
    )
    next_action = (
        f"сохрани ритм тренировок, {nutrition_target}"
        if workouts
        else f"выполни выбранную тренировку и {nutrition_target}"
    )
    return (
        f"1) Что хорошо: {good}.\n"
        f"2) Что улучшить: {improve}.\n"
        f"3) Что делать на следующей неделе: {next_action}."
    )


async def weekly_summary(
    db: AsyncSession, owner_id: int, as_of: datetime | None = None
) -> dict[str, Any]:
    context = await build_ai_context(db, owner_id, as_of)
    weights = context["body_weight"]
    nutrition = context["nutrition"]
    cardio = context["cardio"]
    pull_ups = context["pull_ups"]
    workouts = context["workouts"]

    weight_change = None
    if len(weights) >= 2:
        weight_change = round(weights[-1]["kg"] - weights[0]["kg"], 2)

    bench_values = [
        set_item["weight_kg"]
        for workout in workouts
        for set_item in workout["sets"]
        if "жим лежа" in set_item["exercise"].lower()
    ]
    calories = [item["calories"] for item in nutrition if item["calories"] is not None]
    protein = [item["protein_g"] for item in nutrition if item["protein_g"] is not None]
    best_cardio = max(cardio, key=lambda item: item["average_speed_kmh"], default=None)

    avg_protein = round(sum(protein) / len(protein), 1) if protein else None
    if len(workouts) < 2:
        recommendation = "Добавь одну тренировку в следующем 7-дневном цикле."
    elif avg_protein is not None and avg_protein < 120:
        recommendation = "Подними средний белок и сохраняй текущий тренировочный объем."
    elif not weights:
        recommendation = "Записывай утренний вес, чтобы видеть недельный тренд."
    else:
        recommendation = "Сохраняй ритм и повышай нагрузку только после верхнего диапазона повторов."

    return {
        "period": context["period"],
        "weight_change_kg": weight_change,
        "workouts_count": len(workouts),
        "best_bench_kg": max(bench_values) if bench_values else None,
        "max_pull_ups": max((item["reps"] for item in pull_ups), default=None),
        "best_cardio": best_cardio,
        "average_calories": round(sum(calories) / len(calories)) if calories else None,
        "average_protein_g": avg_protein,
        "recommendation": recommendation,
    }


def format_weekly_summary(summary: dict[str, Any]) -> str:
    weight_change = summary["weight_change_kg"]
    weight_text = "нет данных" if weight_change is None else f"{weight_change:+g} кг"
    return "\n".join(
        [
            "📊 Отчет за последние 7 дней",
            f"Вес: {weight_text}",
            f"Тренировки: {summary['workouts_count']}",
            f"Лучший жим: {summary['best_bench_kg'] or 'нет данных'} кг" if summary["best_bench_kg"] else "Лучший жим: нет данных",
            f"Подтягивания: {summary['max_pull_ups'] or 'нет данных'}" if summary["max_pull_ups"] is not None else "Подтягивания: нет данных",
            f"Средние калории: {summary['average_calories'] or 'нет данных'}",
            f"Средний белок: {summary['average_protein_g'] or 'нет данных'} г" if summary["average_protein_g"] is not None else "Средний белок: нет данных",
            f"Рекомендация: {summary['recommendation']}",
        ]
    )


async def trainer_report_data(
    db: AsyncSession, owner_id: int, session_id: int | None = None
) -> dict[str, Any]:
    query = (
        select(WorkoutSession)
        .options(
            selectinload(WorkoutSession.template),
            selectinload(WorkoutSession.sets).selectinload(ExerciseSet.exercise),
        )
        .where(
            WorkoutSession.user_id == owner_id,
            WorkoutSession.status == WorkoutStatus.COMPLETED,
        )
    )
    if session_id is not None:
        query = query.where(WorkoutSession.id == session_id)
    session = await db.scalar(query.order_by(desc(WorkoutSession.completed_at)))
    if session is None:
        raise HTTPException(status_code=404, detail="Завершенная тренировка не найдена")

    report_timezone = ZoneInfo("Europe/Moscow")
    session_date = _aware_utc(session.completed_at or utcnow()).astimezone(report_timezone).date()
    day_start = datetime.combine(
        session_date, datetime.min.time(), tzinfo=report_timezone
    ).astimezone(timezone.utc)
    day_end = day_start + timedelta(days=1)
    day_weight = await db.scalar(
        select(BodyWeight)
        .where(
            BodyWeight.user_id == owner_id,
            BodyWeight.measured_at >= day_start,
            BodyWeight.measured_at < day_end,
        )
        .order_by(desc(BodyWeight.measured_at))
    )
    session_utc_date = _aware_utc(session.completed_at or utcnow()).date()
    nutrition_dates = (
        [session_date]
        if session_date == session_utc_date
        else [session_date, session_utc_date]
    )
    nutrition = await db.scalar(
        select(NutritionLog)
        .where(
            NutritionLog.user_id == owner_id,
            NutritionLog.log_date.in_(nutrition_dates),
        )
        .order_by(desc(NutritionLog.log_date))
    )
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in sorted(session.sets, key=lambda value: (value.exercise.sort_order, value.set_number)):
        if item.is_completed:
            grouped[item.exercise.name].append(
                {
                    "set_number": item.set_number,
                    "weight_kg": _as_float(item.weight_kg),
                    "reps": item.reps,
                }
            )
    # Intentionally excludes AI reports, progress photos and personal goals.
    return {
        "session_id": session.id,
        "workout_name": session.template.name,
        "date": session_date,
        "duration_seconds": max(
            0,
            int(
                (
                    _aware_utc(session.completed_at or utcnow())
                    - _aware_utc(session.started_at)
                ).total_seconds()
            ),
        ),
        "exercises": [{"name": name, "sets": sets} for name, sets in grouped.items()],
        "body_weight_kg": _as_float(day_weight.weight_kg) if day_weight else None,
        "nutrition": (
            {
                "calories": nutrition.calories,
                "protein_g": _as_float(nutrition.protein_g),
                "fat_g": _as_float(nutrition.fat_g),
                "carbs_g": _as_float(nutrition.carbs_g),
            }
            if nutrition
            else None
        ),
    }


def format_trainer_report(report: dict[str, Any]) -> str:
    lines = [
        f"🏋️ {report['workout_name']}",
        f"Дата: {report['date'].strftime('%d.%m.%Y')}",
    ]
    for exercise in report["exercises"]:
        values = ", ".join(
            f"{item['weight_kg']:g}×{item['reps']}" for item in exercise["sets"]
        )
        lines.append(f"• {exercise['name']}: {values}")
    lines.append(
        f"Вес: {report['body_weight_kg']:g} кг"
        if report.get("body_weight_kg") is not None
        else "Вес: нет данных"
    )
    nutrition = report.get("nutrition")
    if nutrition:
        lines.append(
            "Питание: "
            f"{nutrition.get('calories') or 0} ккал, "
            f"Б {nutrition.get('protein_g') or 0:g} / "
            f"Ж {nutrition.get('fat_g') or 0:g} / "
            f"У {nutrition.get('carbs_g') or 0:g}"
        )
    else:
        lines.append("Питание: нет данных")
    return "\n".join(lines)


def format_owner_workout_report(report: dict[str, Any]) -> str:
    duration = int(report.get("duration_seconds") or 0)
    duration_text = f"{duration // 60}:{duration % 60:02d}"
    lines = [
        "✅ Тренировка завершена",
        f"🏋️ {report['workout_name']}",
        f"📅 {report['date'].strftime('%d.%m.%Y')} · ⏱ {duration_text}",
        "",
    ]
    for index, exercise in enumerate(report["exercises"], start=1):
        lines.append(f"{index}. {exercise['name']}")
        for item in exercise["sets"]:
            lines.append(
                f"   Подход {item['set_number']}: {item['weight_kg']:g} кг × {item['reps']}"
            )
    return "\n".join(lines)


async def send_owner_workout_report(
    db: AsyncSession, owner: User, settings: Settings, session_id: int
) -> dict[str, Any]:
    report = await trainer_report_data(db, owner.id, session_id)
    async with Bot(settings.bot_token) as bot:
        message = await bot.send_message(
            settings.owner_telegram_id,
            format_owner_workout_report(report),
        )
    return {"sent": True, "message_id": message.message_id, "session_id": session_id}


def trainer_report_keyboard(session_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="👍 Отличная тренировка",
                    callback_data=f"trainer:like:{session_id}",
                )
            ],
            [
                InlineKeyboardButton(
                    text="💬 Комментарий",
                    callback_data=f"trainer:comment:{session_id}",
                )
            ],
        ]
    )


async def send_trainer_report(
    db: AsyncSession, owner: User, settings: Settings, session_id: int | None
) -> dict[str, Any]:
    if settings.trainer_telegram_id is None:
        raise HTTPException(status_code=409, detail="Тренер пока не настроен")
    report = await trainer_report_data(db, owner.id, session_id)
    async with Bot(settings.bot_token) as bot:
        message = await bot.send_message(
            settings.trainer_telegram_id,
            format_trainer_report(report),
            reply_markup=trainer_report_keyboard(report["session_id"]),
        )
    return {"sent": True, "message_id": message.message_id, "session_id": report["session_id"]}


async def save_trainer_feedback(
    db: AsyncSession,
    trainer: User,
    session_id: int,
    payload: TrainerFeedbackInput,
) -> dict[str, Any]:
    session_exists = await db.scalar(
        select(WorkoutSession.id).where(
            WorkoutSession.id == session_id,
            WorkoutSession.status == WorkoutStatus.COMPLETED,
        )
    )
    if session_exists is None:
        raise HTTPException(status_code=404, detail="Отчет не найден")
    feedback = await db.scalar(
        select(TrainerFeedback).where(TrainerFeedback.workout_session_id == session_id)
    )
    if feedback is None:
        feedback = TrainerFeedback(workout_session_id=session_id, trainer_id=trainer.id)
        db.add(feedback)
    if "reaction" in payload.model_fields_set:
        feedback.reaction = payload.reaction
    if "comment" in payload.model_fields_set:
        feedback.comment = payload.comment
    await db.commit()
    await db.refresh(feedback)
    return {
        "session_id": session_id,
        "reaction": feedback.reaction,
        "comment": feedback.comment,
        "updated_at": feedback.updated_at,
    }
