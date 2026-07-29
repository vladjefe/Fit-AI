from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Header, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.config import Settings, get_settings
from backend.app.db import SessionFactory, get_db
from backend.app.models import Role, User
from backend.app.schemas import (
    BodyWeightInput,
    CardioInput,
    CompleteWorkoutInput,
    DevicePairInput,
    ExerciseSetInput,
    GoalCreateInput,
    GoalUpdateInput,
    NutritionInput,
    PullUpInput,
    ReminderUpdateInput,
    SendTrainerReportInput,
    SelectWorkoutInput,
    StartWorkoutInput,
    TrainerFeedbackInput,
    WellbeingInput,
    WeeklyAIInput,
)
from backend.app.security import (
    get_current_user,
    redeem_pairing_code,
    require_owner,
    require_trainer,
    revoke_device_token,
)
from backend.app import services


router = APIRouter(prefix="/api/v1")
logger = logging.getLogger(__name__)


async def _send_completed_report(owner_id: int, session_id: int) -> None:
    settings = get_settings()
    try:
        async with SessionFactory() as db:
            owner = await db.get(User, owner_id)
            if owner is not None:
                await services.send_owner_workout_report(db, owner, settings, session_id)
                if settings.trainer_telegram_id is not None:
                    await services.send_trainer_report(db, owner, settings, session_id)
    except Exception:
        logger.exception("Automatic trainer report failed for session %s", session_id)


async def _notify_owner_feedback(text: str) -> None:
    from aiogram import Bot

    settings = get_settings()
    try:
        async with Bot(settings.bot_token) as bot:
            await bot.send_message(settings.owner_telegram_id, text)
    except Exception:
        logger.exception("Trainer feedback notification failed")


@router.post("/auth/pair", tags=["auth"])
async def pair_device(
    payload: DevicePairInput,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """Обменивает одноразовый код из бота на постоянный токен устройства."""
    token, user = await redeem_pairing_code(db, settings, payload.code, payload.device_name)
    return {
        "token": token,
        "role": user.role.value,
        "display_name": user.display_name,
    }


@router.get("/auth/me", tags=["auth"])
async def get_auth_me(user: User = Depends(get_current_user)):
    return {"role": user.role.value, "display_name": user.display_name}


@router.post("/auth/logout", tags=["auth"])
async def logout_device(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if not authorization or not authorization.lower().startswith("bearer "):
        return {"revoked": False}
    return {"revoked": await revoke_device_token(db, authorization[7:].strip())}


@router.get("/dashboard", tags=["owner"])
async def get_dashboard(
    owner: User = Depends(require_owner), db: AsyncSession = Depends(get_db)
):
    return await services.dashboard(db, owner)


@router.get("/workouts/next", tags=["workouts"])
async def get_next_workout(
    owner: User = Depends(require_owner), db: AsyncSession = Depends(get_db)
):
    return await services.next_workout(db, owner)


@router.get("/workouts/templates", tags=["workouts"])
async def get_workout_templates(
    owner: User = Depends(require_owner), db: AsyncSession = Depends(get_db)
):
    return await services.workout_templates(db, owner)


@router.post("/workouts/start", tags=["workouts"])
async def start_workout(
    payload: StartWorkoutInput | None = None,
    owner: User = Depends(require_owner), db: AsyncSession = Depends(get_db)
):
    return await services.start_workout(db, owner, payload.template_id if payload else None)


@router.post("/workouts/select", tags=["workouts"])
async def select_workout(
    payload: SelectWorkoutInput,
    owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    return await services.select_workout(db, owner, payload.template_id)


@router.put("/workouts/{session_id}/sets", tags=["workouts"])
async def save_workout_set(
    session_id: int,
    payload: ExerciseSetInput,
    owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    return await services.save_set(db, owner, session_id, payload)


@router.post("/workouts/{session_id}/complete", tags=["workouts"])
async def complete_workout(
    session_id: int,
    payload: CompleteWorkoutInput,
    background_tasks: BackgroundTasks,
    owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    result = await services.complete_workout(db, owner, session_id, payload)
    if result.get("newly_completed"):
        background_tasks.add_task(_send_completed_report, owner.id, session_id)
    return result


@router.post("/workouts/{session_id}/cancel", tags=["workouts"])
async def cancel_workout(
    session_id: int,
    owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    return await services.cancel_workout(db, owner, session_id)


@router.delete("/workouts/latest", tags=["workouts"])
async def delete_latest_workout(
    owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    return await services.delete_latest_workout_session(db, owner)


@router.delete("/workouts/{session_id}", tags=["workouts"])
async def delete_workout(
    session_id: int,
    owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    return await services.delete_workout_session(db, owner, session_id)


@router.get("/workouts/{session_id}", tags=["workouts"])
async def get_workout_detail(
    session_id: int,
    owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    return await services.workout_detail(db, owner, session_id)


@router.get("/progress", tags=["tracking"])
async def get_progress(
    weeks: int = Query(default=4, ge=1, le=52),
    owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    return await services.progress(db, owner, weeks)


@router.get("/stats/day", tags=["tracking"])
async def get_day_stats(
    owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    return await services.daily_summary(db, owner)


@router.post("/body-weight", status_code=201, tags=["tracking"])
async def add_body_weight(
    payload: BodyWeightInput,
    owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    return await services.add_body_weight(db, owner, payload)


@router.post("/nutrition", tags=["tracking"])
async def add_nutrition(
    payload: NutritionInput,
    owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    return await services.add_nutrition(db, owner, payload)


@router.post("/cardio", status_code=201, tags=["tracking"])
async def add_cardio(
    payload: CardioInput,
    owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    return await services.add_cardio(db, owner, payload)


@router.post("/pull-ups", status_code=201, tags=["tracking"])
async def add_pull_up(
    payload: PullUpInput,
    owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    return await services.add_pull_up(db, owner, payload)


@router.post("/wellbeing", status_code=201, tags=["tracking"])
async def add_wellbeing(
    payload: WellbeingInput,
    owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    return await services.add_wellbeing(db, owner, payload)


@router.get("/goals", tags=["owner-private"])
async def get_goals(
    owner: User = Depends(require_owner), db: AsyncSession = Depends(get_db)
):
    return await services.goals(db, owner)


@router.post("/goals", status_code=201, tags=["owner-private"])
async def post_goal(
    payload: GoalCreateInput,
    owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    return await services.create_goal(db, owner, payload)


@router.put("/goals/{goal_id}", tags=["owner-private"])
async def put_goal(
    goal_id: int,
    payload: GoalUpdateInput,
    owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    return await services.update_goal(db, owner, goal_id, payload)


@router.get("/reminders", tags=["owner-private"])
async def get_reminders(
    owner: User = Depends(require_owner), db: AsyncSession = Depends(get_db)
):
    return await services.reminders(db, owner)


@router.put("/reminders/{reminder_id}", tags=["owner-private"])
async def put_reminder(
    reminder_id: int,
    payload: ReminderUpdateInput,
    owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    return await services.update_reminder(db, owner, reminder_id, payload)


@router.get("/progress-photos", tags=["owner-private"])
async def get_progress_photos(
    owner: User = Depends(require_owner), db: AsyncSession = Depends(get_db)
):
    return await services.progress_photos(db, owner)


@router.get("/progress-photos/{photo_id}/file", tags=["owner-private"])
async def get_progress_photo_file(
    photo_id: int,
    owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    path = await services.progress_photo_path(db, owner, photo_id)
    return FileResponse(path, filename=path.name, content_disposition_type="inline")


@router.post("/progress-photos", status_code=201, tags=["owner-private"])
async def upload_progress_photo(
    file: UploadFile = File(...),
    pose: str | None = Form(default=None),
    note: str | None = Form(default=None),
    owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    return await services.add_progress_photo(db, owner, file, pose, note)


@router.post("/ai/weekly-analysis", tags=["owner-private"])
async def analyze_week(
    payload: WeeklyAIInput,
    owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    return await services.weekly_ai_analysis(db, owner, settings, payload.as_of)


@router.post("/trainer/report", tags=["reports"])
async def send_report_to_trainer(
    payload: SendTrainerReportInput,
    owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    return await services.send_trainer_report(
        db, owner, settings, payload.workout_session_id
    )


@router.get("/trainer/reports/latest", tags=["trainer"])
async def get_latest_trainer_report(
    _trainer: User = Depends(require_trainer), db: AsyncSession = Depends(get_db)
):
    owner_id = await db.scalar(select(User.id).where(User.role == Role.OWNER))
    if owner_id is None:
        return None
    return await services.trainer_report_data(db, owner_id)


@router.put("/trainer/reports/{session_id}/feedback", tags=["trainer"])
async def put_trainer_feedback(
    session_id: int,
    payload: TrainerFeedbackInput,
    background_tasks: BackgroundTasks,
    trainer: User = Depends(require_trainer),
    db: AsyncSession = Depends(get_db),
):
    result = await services.save_trainer_feedback(db, trainer, session_id, payload)
    text = (
        f"💬 Комментарий тренера:\n{payload.comment}"
        if payload.comment
        else "👍 Тренер оценил тренировку: отличная работа!"
    )
    background_tasks.add_task(_notify_owner_feedback, text)
    return result
