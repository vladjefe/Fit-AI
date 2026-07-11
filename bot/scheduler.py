from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
import logging
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from aiogram import Bot
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app import services
from backend.app.db import SessionFactory
from backend.app.models import (
    BodyWeight,
    NutritionLog,
    ProgressPhoto,
    Reminder,
    Role,
    User,
    WorkoutSession,
    WorkoutStatus,
)


logger = logging.getLogger(__name__)


def _aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _local_day_bounds(day: date, tz: ZoneInfo) -> tuple[datetime, datetime]:
    start = datetime.combine(day, time.min, tzinfo=tz).astimezone(timezone.utc)
    return start, start + timedelta(days=1)


def _at_or_after(local_now: datetime, local_time: time) -> bool:
    return (local_now.hour, local_now.minute) >= (local_time.hour, local_time.minute)


def _sent_today(reminder: Reminder, local_now: datetime, tz: ZoneInfo) -> bool:
    if reminder.last_sent_at is None:
        return False
    return _aware_utc(reminder.last_sent_at).astimezone(tz).date() == local_now.date()


async def _daily_weight_due(
    db: AsyncSession, owner: User, reminder: Reminder, local_now: datetime, tz: ZoneInfo
) -> bool:
    if not _at_or_after(local_now, reminder.local_time) or _sent_today(reminder, local_now, tz):
        return False
    start, end = _local_day_bounds(local_now.date(), tz)
    entry = await db.scalar(
        select(BodyWeight.id).where(
            BodyWeight.user_id == owner.id,
            BodyWeight.measured_at >= start,
            BodyWeight.measured_at < end,
        )
    )
    return entry is None


async def _daily_nutrition_due(
    db: AsyncSession, owner: User, reminder: Reminder, local_now: datetime, tz: ZoneInfo
) -> bool:
    if not _at_or_after(local_now, reminder.local_time) or _sent_today(reminder, local_now, tz):
        return False
    entry = await db.scalar(
        select(NutritionLog.id).where(
            NutritionLog.user_id == owner.id,
            NutritionLog.log_date == local_now.date(),
        )
    )
    return entry is None


async def _workout_due(
    db: AsyncSession, owner: User, reminder: Reminder, now_utc: datetime, local_now: datetime
) -> bool:
    if not _at_or_after(local_now, reminder.local_time):
        return False
    latest = await db.scalar(
        select(WorkoutSession.completed_at)
        .where(
            WorkoutSession.user_id == owner.id,
            WorkoutSession.status == WorkoutStatus.COMPLETED,
        )
        .order_by(desc(WorkoutSession.completed_at))
    )
    anchor = _aware_utc(latest) if latest else _aware_utc(owner.created_at)
    if now_utc - anchor < timedelta(days=2):
        return False
    return reminder.last_sent_at is None or _aware_utc(reminder.last_sent_at) < anchor


async def _photo_due(
    db: AsyncSession, owner: User, reminder: Reminder, now_utc: datetime, local_now: datetime
) -> bool:
    if not _at_or_after(local_now, reminder.local_time):
        return False
    last_photo = await db.scalar(
        select(ProgressPhoto.taken_at)
        .where(ProgressPhoto.user_id == owner.id)
        .order_by(desc(ProgressPhoto.taken_at))
    )
    anchor = _aware_utc(last_photo) if last_photo else _aware_utc(owner.created_at)
    if now_utc - anchor < timedelta(days=14):
        return False
    return (
        reminder.last_sent_at is None
        or now_utc - _aware_utc(reminder.last_sent_at) >= timedelta(days=14)
    )


async def _weekly_due(
    owner: User, reminder: Reminder, now_utc: datetime, local_now: datetime
) -> bool:
    if not _at_or_after(local_now, reminder.local_time):
        return False
    if now_utc - _aware_utc(owner.created_at) < timedelta(days=7):
        return False
    return (
        reminder.last_sent_at is None
        or now_utc - _aware_utc(reminder.last_sent_at) >= timedelta(days=7)
    )


async def process_automations(
    db: AsyncSession, bot: Bot, now_utc: datetime | None = None
) -> list[str]:
    now_utc = _aware_utc(now_utc or datetime.now(timezone.utc))
    owner = await db.scalar(select(User).where(User.role == Role.OWNER))
    if owner is None:
        return []
    reminders = list(
        (
            await db.scalars(
                select(Reminder).where(
                    Reminder.user_id == owner.id,
                    Reminder.is_active.is_(True),
                )
            )
        ).all()
    )
    sent: list[str] = []
    for reminder in reminders:
        try:
            try:
                tz = ZoneInfo(reminder.timezone)
            except ZoneInfoNotFoundError:
                tz = ZoneInfo("UTC")
            local_now = now_utc.astimezone(tz)
            due = False
            text = reminder.message
            if reminder.reminder_type == "morning_weight":
                due = await _daily_weight_due(db, owner, reminder, local_now, tz)
            elif reminder.reminder_type == "evening_nutrition":
                due = await _daily_nutrition_due(db, owner, reminder, local_now, tz)
            elif reminder.reminder_type == "workout_rest":
                due = await _workout_due(db, owner, reminder, now_utc, local_now)
            elif reminder.reminder_type == "progress_photo":
                due = await _photo_due(db, owner, reminder, now_utc, local_now)
            elif reminder.reminder_type == "weekly_report":
                due = await _weekly_due(owner, reminder, now_utc, local_now)
                if due:
                    text = services.format_weekly_summary(
                        await services.weekly_summary(db, owner.id, now_utc)
                    )
            if due:
                await bot.send_message(owner.telegram_id, text)
                reminder.last_sent_at = now_utc
                sent.append(reminder.reminder_type)
        except Exception:
            logger.exception("Automation failed: %s", reminder.reminder_type)
    if sent:
        await db.commit()
    return sent


async def send_due_reminders(bot: Bot) -> None:
    async with SessionFactory() as db:
        await process_automations(db, bot)


def build_scheduler(bot: Bot) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(
        send_due_reminders,
        trigger="interval",
        minutes=15,
        args=[bot],
        id="fit-ai-automations",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
    )
    return scheduler
