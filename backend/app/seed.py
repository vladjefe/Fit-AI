from __future__ import annotations

import asyncio
import argparse
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.config import get_settings
from backend.app.db import SessionFactory
from backend.app.exercise_catalog import CATALOG
from backend.app.models import (
    BodyWeight,
    Exercise,
    CardioLog,
    ExerciseSet,
    ExerciseTemplate,
    Goal,
    NutritionLog,
    PullUpLog,
    Reminder,
    Role,
    User,
    WellbeingLog,
    WorkoutSession,
    WorkoutStatus,
    WorkoutTemplate,
)



async def seed_exercise_catalog(db: AsyncSession) -> int:
    """Наполняет общий каталог. Повторный запуск только дописывает недостающее."""
    existing = set(
        (await db.scalars(select(Exercise.name).where(Exercise.user_id.is_(None)))).all()
    )
    added = 0
    for entry in CATALOG:
        if entry.name in existing:
            continue
        db.add(
            Exercise(
                user_id=None,
                name=entry.name,
                muscle_group=entry.muscle_group,
                equipment=entry.equipment,
                image_key=entry.image_key,
            )
        )
        added += 1
    if added:
        await db.flush()
    return added


WORKOUTS = [
    (
        "Ноги 1",
        [
            ("Присед в гакке", "hack-squat", "65", 3, 10, 12),
            ("Разгибание голени сидя", "seated-leg-extension", "42.5", 3, 10, 12),
            ("Сгибание голени лежа", "lying-leg-curl", "42.5", 3, 10, 12),
            ("Махи на среднюю дельту", "lateral-raise", "10", 3, 10, 12),
            ("Икры", "calf-raise", "110", 3, 12, 15),
        ],
    ),
    (
        "Верх 1",
        [
            ("Тяга вертикальная узким хватом", "close-grip-lat-pulldown", "55", 3, 10, 12),
            ("Тяга горизонтальная рычажная", "lever-seated-row", "40", 3, 10, 12),
            ("Жим от груди рычажный", "lever-chest-press", "32.5", 3, 8, 10),
            ("Сведение на грудь стоя", "standing-cable-fly", "32.5", 3, 10, 12),
            ("Бицепс со штангой", "barbell-curl", "22.5", 3, 10, 12),
        ],
    ),
    (
        "Ноги 2",
        [
            ("Жим ногами", "leg-press", "190", 3, 10, 12),
            ("Ягодичный мост", "hip-thrust", "35", 3, 10, 12),
            ("Сгибание голени сидя", "seated-leg-curl", "60", 3, 10, 12),
            ("Жим гантелей на переднюю дельту", "dumbbell-shoulder-press", "14", 3, 8, 10),
            ("Пек-дек на заднюю дельту", "reverse-pec-deck", "15", 3, 10, 12),
        ],
    ),
    (
        "Верх 2",
        [
            ("Жим лежа", "barbell-bench-press", "70", 3, 6, 8),
            ("Жим гантелей", "dumbbell-bench-press", "18", 3, 8, 10),
            ("Т-гриф", "t-bar-row", "35", 3, 10, 12),
            ("Тяга вертикальная рычажная", "lever-lat-pulldown", "37.5", 3, 10, 12),
            ("Трицепс косичка", "rope-triceps-pushdown", "20", 3, 10, 12),
        ],
    ),
]

DEFAULT_REMINDERS = [
    ("morning_weight", time(8, 30), "⚖️ Доброе утро! Запиши вес после пробуждения."),
    ("evening_nutrition", time(20, 30), "🥗 Заполни питание за сегодня: калории и белок."),
    ("workout_rest", time(18, 0), "💪 Прошло 2 дня после тренировки. Следующая уже готова."),
    ("progress_photo", time(10, 0), "📸 Пора обновить приватное фото формы."),
    ("weekly_report", time(21, 0), "📊 Готов недельный отчет FIT AI."),
]


async def seed_database(db: AsyncSession, include_demo: bool = False) -> None:
    settings = get_settings()
    expected_users = [(settings.owner_telegram_id, Role.OWNER, "Владелец")]
    if settings.trainer_telegram_id is not None:
        expected_users.append((settings.trainer_telegram_id, Role.TRAINER, "Тренер"))

    for telegram_id, role, default_name in expected_users:
        user = await db.scalar(select(User).where(User.telegram_id == telegram_id))
        if user is None:
            db.add(User(telegram_id=telegram_id, role=role, display_name=default_name))
        else:
            user.role = role

    await db.flush()
    owner = await db.scalar(select(User).where(User.telegram_id == settings.owner_telegram_id))
    assert owner is not None
    for reminder_type, local_time, message in DEFAULT_REMINDERS:
        reminder = await db.scalar(
            select(Reminder).where(
                Reminder.user_id == owner.id,
                Reminder.reminder_type == reminder_type,
            )
        )
        if reminder is None:
            db.add(
                Reminder(
                    user_id=owner.id,
                    reminder_type=reminder_type,
                    local_time=local_time,
                    timezone="Europe/Moscow",
                    message=message,
                )
            )
        else:
            reminder.local_time = local_time
            reminder.message = message

    goals = [
        ("weight", "Вес", Decimal("80"), Decimal("84.6"), "кг"),
        ("pull_ups", "Подтягивания", Decimal("20"), Decimal("11"), "повт."),
        ("bench_press", "Жим лежа", Decimal("90"), Decimal("70"), "кг"),
        ("cardio_5k", "Кардио 5 км", Decimal("1500"), Decimal("1780"), "сек."),
    ]
    for goal_type, title, target, current, unit in goals:
        goal = await db.scalar(
            select(Goal).where(Goal.user_id == owner.id, Goal.goal_type == goal_type)
        )
        if goal is None:
            db.add(
                Goal(
                    user_id=owner.id,
                    goal_type=goal_type,
                    title=title,
                    target_value=target,
                    current_value=current,
                    unit=unit,
                )
            )
        else:
            goal.title = title
            goal.target_value = target
            goal.unit = unit

    await seed_exercise_catalog(db)

    for position, (name, exercise_rows) in enumerate(WORKOUTS):
        template = await db.scalar(
            select(WorkoutTemplate)
            .options(selectinload(WorkoutTemplate.exercises))
            .where(
                WorkoutTemplate.cycle_position == position,
                WorkoutTemplate.user_id == owner.id,
            )
        )
        if template is None:
            template = WorkoutTemplate(
                name=name, cycle_position=position, user_id=owner.id, exercises=[]
            )
            db.add(template)
            await db.flush()
        else:
            template.name = name
            template.is_active = True

        existing = {item.sort_order: item for item in template.exercises}
        for order, (exercise_name, image_key, weight, sets, rep_min, rep_max) in enumerate(
            exercise_rows, start=1
        ):
            exercise = existing.get(order)
            if exercise is None:
                exercise = ExerciseTemplate(
                    workout_template_id=template.id,
                    sort_order=order,
                    name=exercise_name,
                    image_key=image_key,
                    base_weight_kg=Decimal(weight),
                    target_sets=sets,
                    rep_min=rep_min,
                    rep_max=rep_max,
                )
                db.add(exercise)
            else:
                exercise.name = exercise_name
                exercise.image_key = image_key
                exercise.base_weight_kg = Decimal(weight)
                exercise.target_sets = sets
                exercise.rep_min = rep_min
                exercise.rep_max = rep_max
        for order, stale in existing.items():
            if order > len(exercise_rows):
                await db.delete(stale)
    await db.flush()
    if include_demo:
        await seed_demo_data(db, owner)
    await db.commit()


async def seed_demo_data(db: AsyncSession, owner: User) -> None:
    """Create idempotent local demo history without overwriting user-entered rows."""
    now = datetime.now(timezone.utc).replace(microsecond=0)
    templates = list(
        (
            await db.scalars(
                select(WorkoutTemplate)
                .options(selectinload(WorkoutTemplate.exercises))
                .order_by(WorkoutTemplate.cycle_position)
            )
        ).all()
    )
    demo_offsets = [10, 7, 4, 1]
    for template, days_ago in zip(templates, demo_offsets, strict=True):
        marker = f"demo-seed:v1:{template.cycle_position}"
        existing_session = await db.scalar(
            select(WorkoutSession.id).where(
                WorkoutSession.user_id == owner.id,
                WorkoutSession.notes == marker,
            )
        )
        if existing_session is not None:
            continue
        completed_at = now - timedelta(days=days_ago)
        session = WorkoutSession(
            user_id=owner.id,
            workout_template_id=template.id,
            cycle_position=template.cycle_position,
            cycle_number=1,
            status=WorkoutStatus.COMPLETED,
            started_at=completed_at - timedelta(minutes=52),
            completed_at=completed_at,
            perceived_exertion=7 + template.cycle_position % 2,
            notes=marker,
        )
        db.add(session)
        await db.flush()
        volume = Decimal("0")
        for exercise in template.exercises:
            for set_number in range(1, exercise.target_sets + 1):
                reps = min(exercise.rep_max, exercise.rep_min + (set_number % 2))
                db.add(
                    ExerciseSet(
                        workout_session_id=session.id,
                        exercise_template_id=exercise.id,
                        set_number=set_number,
                        weight_kg=exercise.base_weight_kg,
                        reps=reps,
                        completed_at=completed_at,
                    )
                )
                volume += exercise.base_weight_kg * reps
        session.total_volume_kg = volume

    if not await db.scalar(
        select(BodyWeight.id).where(BodyWeight.user_id == owner.id, BodyWeight.note == "demo-seed")
    ):
        for days_ago, value in [(10, "85.6"), (7, "85.2"), (4, "84.9"), (1, "84.6")]:
            db.add(
                BodyWeight(
                    user_id=owner.id,
                    measured_at=now - timedelta(days=days_ago),
                    weight_kg=Decimal(value),
                    note="demo-seed",
                )
            )

    for days_ago in range(7):
        log_date = (now - timedelta(days=days_ago)).date()
        existing_nutrition = await db.scalar(
            select(NutritionLog.id).where(
                NutritionLog.user_id == owner.id,
                NutritionLog.log_date == log_date,
            )
        )
        if existing_nutrition is None:
            db.add(
                NutritionLog(
                    user_id=owner.id,
                    log_date=log_date,
                    calories=2250 + days_ago * 25,
                    protein_g=Decimal(150 - days_ago),
                    fat_g=Decimal("72"),
                    carbs_g=Decimal("245"),
                    note="demo-seed",
                )
            )

    if not await db.scalar(
        select(CardioLog.id).where(CardioLog.user_id == owner.id, CardioLog.note == "demo-seed")
    ):
        for days_ago, seconds in [(9, 1920), (5, 1840), (2, 1780)]:
            distance = Decimal("5")
            speed = float(distance) / (seconds / 3600)
            db.add(
                CardioLog(
                    user_id=owner.id,
                    performed_at=now - timedelta(days=days_ago),
                    activity_type="run",
                    distance_km=distance,
                    duration_seconds=seconds,
                    pace_seconds_per_km=seconds / float(distance),
                    average_speed_kmh=speed,
                    is_personal_best=days_ago == 2,
                    note="demo-seed",
                )
            )

    pull_up_count = await db.scalar(
        select(func.count(PullUpLog.id)).where(PullUpLog.user_id == owner.id)
    )
    if not pull_up_count:
        for days_ago, reps in [(8, 9), (4, 10), (1, 11)]:
            db.add(
                PullUpLog(
                    user_id=owner.id,
                    performed_at=now - timedelta(days=days_ago),
                    reps=reps,
                )
            )

    wellbeing_count = await db.scalar(
        select(func.count(WellbeingLog.id)).where(WellbeingLog.user_id == owner.id)
    )
    if not wellbeing_count:
        for days_ago, score, energy in [(6, 7, 7), (3, 8, 8), (1, 8, 8)]:
            db.add(
                WellbeingLog(
                    user_id=owner.id,
                    recorded_at=now - timedelta(days=days_ago),
                    score=score,
                    sleep_hours=Decimal("7.5"),
                    energy=energy,
                    soreness=3,
                )
            )


async def main() -> None:
    parser = argparse.ArgumentParser(description="Seed FIT AI data")
    parser.add_argument(
        "--demo",
        action="store_true",
        help="also add idempotent sample history for local UI/testing",
    )
    args = parser.parse_args()
    async with SessionFactory() as db:
        await seed_database(db, include_demo=args.demo)
    suffix = ", demo history" if args.demo else ""
    print(f"FIT AI seed completed: 4 workouts, 20 exercises, goals, reminders{suffix}")


if __name__ == "__main__":
    asyncio.run(main())
