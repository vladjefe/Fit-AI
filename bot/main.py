from __future__ import annotations

import asyncio
import logging
from decimal import Decimal, InvalidOperation

from aiogram import Bot, Dispatcher, F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    BotCommand,
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    MenuButtonWebApp,
    Message,
    ReplyKeyboardMarkup,
    WebAppInfo,
)
from fastapi import HTTPException
from sqlalchemy import select

from backend.app import services
from backend.app.config import Settings, get_settings
from backend.app.db import SessionFactory
from backend.app.models import Role, User
from backend.app.schemas import BodyWeightInput, NutritionInput, TrainerFeedbackInput
from bot.scheduler import build_scheduler


router = Router()
settings: Settings


class TrainerCommentState(StatesGroup):
    waiting_for_comment = State()


class OwnerLogState(StatesGroup):
    waiting_for_weight = State()
    waiting_for_calories = State()
    waiting_for_protein = State()


def owner_menu_keyboard() -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    if settings.mini_app_url:
        rows.append(
            [
                InlineKeyboardButton(
                    text="🚀 Открыть FIT AI",
                    web_app=WebAppInfo(url=settings.mini_app_url),
                )
            ]
        )
    rows.extend(
        [
            [
                InlineKeyboardButton(text="💪 Следующая", callback_data="owner:next"),
                InlineKeyboardButton(text="📊 Прогресс", callback_data="owner:progress"),
            ],
            [
                InlineKeyboardButton(text="📅 Статистика дня", callback_data="owner:day"),
            ],
            [
                InlineKeyboardButton(text="⚖️ Ввести вес", callback_data="owner:log_weight"),
                InlineKeyboardButton(text="🥗 Ввести питание", callback_data="owner:log_nutrition"),
            ],
            [
                InlineKeyboardButton(text="🤖 AI-неделя", callback_data="owner:ai"),
                InlineKeyboardButton(text="🧹 Удалить тест", callback_data="owner:delete_latest_confirm"),
            ],
        ]
    )
    if settings.mini_app_url:
        rows.append([InlineKeyboardButton(text="🌐 Ссылка для ПК", url=settings.mini_app_url)])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def confirm_delete_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="Да, удалить", callback_data="owner:delete_latest_yes"),
                InlineKeyboardButton(text="Отмена", callback_data="owner:menu"),
            ]
        ]
    )


async def resolve_user(telegram_id: int, display_name: str | None = None) -> User | None:
    if telegram_id not in settings.allowed_telegram_ids:
        return None
    role = Role.OWNER if telegram_id == settings.owner_telegram_id else Role.TRAINER
    async with SessionFactory() as db:
        user = await db.scalar(select(User).where(User.telegram_id == telegram_id))
        if user is None:
            user = User(telegram_id=telegram_id, role=role, display_name=display_name)
            db.add(user)
            await db.commit()
            await db.refresh(user)
        elif user.role != role or (display_name and user.display_name != display_name):
            user.role = role
            if display_name:
                user.display_name = display_name
            await db.commit()
        return user


async def actor_from_message(message: Message) -> User | None:
    if message.from_user is None:
        return None
    user = await resolve_user(message.from_user.id, message.from_user.full_name)
    if user is None:
        await message.answer("⛔ Доступ запрещен")
    return user


@router.message(CommandStart())
async def start(message: Message) -> None:
    actor = await actor_from_message(message)
    if actor is None:
        return
    if actor.role == Role.TRAINER:
        await message.answer("FIT AI Trainer\n/reports — последний отчёт")
        return
    if settings.mini_app_url:
        keyboard = ReplyKeyboardMarkup(
            keyboard=[
                [
                    KeyboardButton(
                        text="Открыть FIT AI",
                        web_app=WebAppInfo(url=settings.mini_app_url),
                    )
                ]
            ],
            resize_keyboard=True,
            one_time_keyboard=False,
        )
        await message.answer(
            "FIT AI готов.\n\n"
            "На телефоне нажми «🚀 Открыть FIT AI» — так Telegram передаст авторизацию и можно будет записывать данные.\n"
            "В боте есть быстрые кнопки: статистика дня, ввод веса/питания, следующая тренировка, прогресс, AI и удаление тестовой тренировки.",
            reply_markup=owner_menu_keyboard(),
        )
        await message.answer("Быстрый запуск Mini App оставил внизу 👇", reply_markup=keyboard)
    else:
        await message.answer(
            "FIT AI готов. MINI_APP_URL пока не настроен.\n"
            "/next — следующая тренировка\n"
            "/progress — прогресс\n"
            "/ai — AI-анализ недели"
        )


async def actor_from_callback(callback: CallbackQuery) -> User | None:
    user = await resolve_user(callback.from_user.id, callback.from_user.full_name)
    if user is None:
        await callback.answer("⛔ Доступ запрещен", show_alert=True)
    return user


async def safe_edit_message(
    message: Message | None,
    text: str,
    reply_markup: InlineKeyboardMarkup | None = None,
) -> None:
    if message is None:
        return
    try:
        await message.edit_text(text, reply_markup=reply_markup)
    except TelegramBadRequest as exc:
        if "message is not modified" in str(exc):
            return
        raise


def parse_decimal(text: str | None) -> Decimal | None:
    if not text:
        return None
    try:
        value = Decimal(text.strip().replace(",", "."))
    except (InvalidOperation, ValueError):
        return None
    return value if value > 0 else None


def format_progress_summary(data: dict) -> str:
    weight = data.get("weight_stats") or {}
    nutrition = data.get("nutrition_stats") or {}
    change = weight.get("change_kg")
    change_text = "нет динамики" if change is None else f"{change:+g} кг"
    latest_weight = weight.get("latest_kg")
    weight_text = f"{latest_weight:g} кг" if latest_weight is not None else "нет данных"
    calories = nutrition.get("average_calories")
    protein = nutrition.get("average_protein_g")
    return (
        "📊 Прогресс за 4 недели\n"
        f"Тренировок: {data['workouts_completed']}\n"
        f"Вес: {weight_text} ({change_text})\n"
        f"Питание: {nutrition.get('logged_days') or 0} дней\n"
        f"Средние калории: {calories if calories is not None else 'нет данных'}\n"
        f"Средний белок: {protein if protein is not None else 'нет данных'} г"
    )


@router.callback_query(F.data == "owner:menu")
async def owner_menu_callback(callback: CallbackQuery) -> None:
    actor = await actor_from_callback(callback)
    if actor is None or actor.role != Role.OWNER:
        return
    await safe_edit_message(callback.message, "FIT AI: быстрые действия", owner_menu_keyboard())
    await callback.answer()


@router.callback_query(F.data == "owner:next")
async def owner_next_callback(callback: CallbackQuery) -> None:
    actor = await actor_from_callback(callback)
    if actor is None or actor.role != Role.OWNER:
        return
    async with SessionFactory() as db:
        data = await services.next_workout(db, actor)
    lines = [f"💪 Следующая: {data['name']} · цикл {data['cycle_number']}"]
    for item in data["exercises"]:
        p = item["progression"]
        lines.append(
            f"• {item['name']}: {p['recommended_weight_kg']:g} кг, "
            f"{p['recommended_sets']}×{item['rep_min']}–{item['rep_max']}"
        )
    await safe_edit_message(callback.message, "\n".join(lines), owner_menu_keyboard())
    await callback.answer()


@router.callback_query(F.data == "owner:progress")
async def owner_progress_callback(callback: CallbackQuery) -> None:
    actor = await actor_from_callback(callback)
    if actor is None or actor.role != Role.OWNER:
        return
    async with SessionFactory() as db:
        data = await services.progress(db, actor, 4)
    await safe_edit_message(callback.message, format_progress_summary(data), owner_menu_keyboard())
    await callback.answer()


@router.callback_query(F.data == "owner:day")
async def owner_day_callback(callback: CallbackQuery) -> None:
    actor = await actor_from_callback(callback)
    if actor is None or actor.role != Role.OWNER:
        return
    async with SessionFactory() as db:
        summary = await services.daily_summary(db, actor)
    await safe_edit_message(
        callback.message,
        services.format_daily_summary(summary),
        owner_menu_keyboard(),
    )
    await callback.answer("Готово")


@router.callback_query(F.data == "owner:log_weight")
async def owner_log_weight_callback(callback: CallbackQuery, state: FSMContext) -> None:
    actor = await actor_from_callback(callback)
    if actor is None or actor.role != Role.OWNER:
        return
    await state.set_state(OwnerLogState.waiting_for_weight)
    if callback.message:
        await callback.message.answer("⚖️ Напиши вес одним числом, например: 84.6")
    await callback.answer()


@router.callback_query(F.data == "owner:log_nutrition")
async def owner_log_nutrition_callback(callback: CallbackQuery, state: FSMContext) -> None:
    actor = await actor_from_callback(callback)
    if actor is None or actor.role != Role.OWNER:
        return
    await state.set_state(OwnerLogState.waiting_for_calories)
    if callback.message:
        await callback.message.answer("🥗 Напиши калории за сегодня одним числом, например: 2300")
    await callback.answer()


@router.callback_query(F.data == "owner:ai")
async def owner_ai_callback(callback: CallbackQuery) -> None:
    actor = await actor_from_callback(callback)
    if actor is None or actor.role != Role.OWNER:
        return
    await callback.answer("Анализирую…")
    try:
        async with SessionFactory() as db:
            result = await services.weekly_ai_analysis(db, actor, settings, None)
        await safe_edit_message(callback.message, result["analysis"][:4000], owner_menu_keyboard())
    except HTTPException as exc:
        await safe_edit_message(callback.message, str(exc.detail), owner_menu_keyboard())


@router.callback_query(F.data == "owner:delete_latest_confirm")
async def owner_delete_latest_confirm(callback: CallbackQuery) -> None:
    actor = await actor_from_callback(callback)
    if actor is None or actor.role != Role.OWNER:
        return
    await safe_edit_message(
        callback.message,
        "Удалить последнюю тренировку? Это удобно для тестов: удаляется последняя активная или завершенная тренировка, а цикл пересчитывается.",
        confirm_delete_keyboard(),
    )
    await callback.answer()


@router.callback_query(F.data == "owner:delete_latest_yes")
async def owner_delete_latest_yes(callback: CallbackQuery) -> None:
    actor = await actor_from_callback(callback)
    if actor is None or actor.role != Role.OWNER:
        return
    try:
        async with SessionFactory() as db:
            result = await services.delete_latest_workout_session(db, actor)
    except HTTPException as exc:
        await safe_edit_message(callback.message, str(exc.detail), owner_menu_keyboard())
        await callback.answer()
        return
    text = f"🧹 Удалено: {result.get('workout_name') or 'тренировка'}"
    await safe_edit_message(callback.message, text, owner_menu_keyboard())
    await callback.answer("Удалено")


@router.message(Command("next"))
async def next_command(message: Message) -> None:
    actor = await actor_from_message(message)
    if actor is None:
        return
    if actor.role != Role.OWNER:
        await message.answer("⛔ Доступ запрещен")
        return
    async with SessionFactory() as db:
        data = await services.next_workout(db, actor)
    lines = [f"Следующая: {data['name']} · цикл {data['cycle_number']}"]
    for item in data["exercises"]:
        p = item["progression"]
        lines.append(
            f"• {item['name']}: {p['recommended_weight_kg']:g} кг, "
            f"{p['recommended_sets']}×{item['rep_min']}–{item['rep_max']}"
        )
    await message.answer("\n".join(lines))


@router.message(Command("progress"))
async def progress_command(message: Message) -> None:
    actor = await actor_from_message(message)
    if actor is None:
        return
    if actor.role != Role.OWNER:
        await message.answer("⛔ Доступ запрещен")
        return
    async with SessionFactory() as db:
        data = await services.progress(db, actor, 4)
    await message.answer(format_progress_summary(data))


@router.message(Command("day"))
async def day_command(message: Message) -> None:
    actor = await actor_from_message(message)
    if actor is None:
        return
    if actor.role != Role.OWNER:
        await message.answer("⛔ Доступ запрещен")
        return
    async with SessionFactory() as db:
        summary = await services.daily_summary(db, actor)
    await message.answer(services.format_daily_summary(summary))


@router.message(Command("ai"))
async def ai_command(message: Message) -> None:
    actor = await actor_from_message(message)
    if actor is None:
        return
    if actor.role != Role.OWNER:
        await message.answer("⛔ Доступ запрещен")
        return
    await message.answer("Анализирую неделю…")
    try:
        async with SessionFactory() as db:
            result = await services.weekly_ai_analysis(db, actor, settings, None)
        await message.answer(result["analysis"][:4000])
    except HTTPException as exc:
        await message.answer(str(exc.detail))


@router.message(Command("report"))
async def report_command(message: Message) -> None:
    actor = await actor_from_message(message)
    if actor is None:
        return
    if actor.role != Role.OWNER:
        await message.answer("⛔ Доступ запрещен")
        return
    try:
        async with SessionFactory() as db:
            await services.send_trainer_report(db, actor, settings, None)
        await message.answer("Отчет отправлен тренеру")
    except HTTPException as exc:
        await message.answer(str(exc.detail))


@router.message(Command("reports"))
async def trainer_reports_command(message: Message) -> None:
    actor = await actor_from_message(message)
    if actor is None:
        return
    if actor.role != Role.TRAINER:
        await message.answer("⛔ Доступ запрещен")
        return
    async with SessionFactory() as db:
        owner_id = await db.scalar(select(User.id).where(User.role == Role.OWNER))
        if owner_id is None:
            await message.answer("Отчетов пока нет")
            return
        try:
            report = await services.trainer_report_data(db, owner_id)
        except HTTPException:
            await message.answer("Отчетов пока нет")
            return
    await message.answer(
        services.format_trainer_report(report),
        reply_markup=services.trainer_report_keyboard(report["session_id"]),
    )


@router.callback_query(F.data.startswith("trainer:like:"))
async def feedback_like(callback: CallbackQuery) -> None:
    if callback.from_user.id != settings.trainer_telegram_id:
        await callback.answer("⛔ Доступ запрещен", show_alert=True)
        return
    actor = await resolve_user(callback.from_user.id, callback.from_user.full_name)
    if actor is None or actor.role != Role.TRAINER:
        await callback.answer("⛔ Доступ запрещен", show_alert=True)
        return
    try:
        session_id = int((callback.data or "").rsplit(":", 1)[1])
    except (ValueError, IndexError):
        await callback.answer("Некорректный отчет", show_alert=True)
        return
    try:
        async with SessionFactory() as db:
            await services.save_trainer_feedback(
                db, actor, session_id, TrainerFeedbackInput(reaction="thumbs_up")
            )
    except HTTPException as exc:
        await callback.answer(str(exc.detail), show_alert=True)
        return
    await callback.bot.send_message(
        settings.owner_telegram_id,
        "👍 Тренер оценил тренировку: отличная работа!",
    )
    await callback.answer("Оценка отправлена")


@router.callback_query(F.data.startswith("trainer:comment:"))
async def request_trainer_comment(callback: CallbackQuery, state: FSMContext) -> None:
    if callback.from_user.id != settings.trainer_telegram_id:
        await callback.answer("⛔ Доступ запрещен", show_alert=True)
        return
    try:
        session_id = int((callback.data or "").rsplit(":", 1)[1])
    except (ValueError, IndexError):
        await callback.answer("Некорректный отчет", show_alert=True)
        return
    await state.set_state(TrainerCommentState.waiting_for_comment)
    await state.update_data(session_id=session_id)
    await callback.bot.send_message(
        callback.from_user.id,
        "Напишите комментарий к тренировке одним сообщением.",
    )
    await callback.answer()


@router.message(OwnerLogState.waiting_for_weight)
async def receive_owner_weight(message: Message, state: FSMContext) -> None:
    actor = await actor_from_message(message)
    if actor is None:
        await state.clear()
        return
    if actor.role != Role.OWNER:
        await message.answer("⛔ Доступ запрещен")
        await state.clear()
        return
    value = parse_decimal(message.text)
    if value is None or value <= 20 or value >= 500:
        await message.answer("Напиши вес числом от 20 до 500. Например: 84.6")
        return
    async with SessionFactory() as db:
        await services.add_body_weight(db, actor, BodyWeightInput(weight_kg=value))
        summary = await services.daily_summary(db, actor)
    await state.clear()
    await message.answer("✅ Вес записан\n\n" + services.format_daily_summary(summary))


@router.message(OwnerLogState.waiting_for_calories)
async def receive_owner_calories(message: Message, state: FSMContext) -> None:
    actor = await actor_from_message(message)
    if actor is None:
        await state.clear()
        return
    if actor.role != Role.OWNER:
        await message.answer("⛔ Доступ запрещен")
        await state.clear()
        return
    calories = parse_decimal(message.text)
    if calories is None or calories > 20000:
        await message.answer("Напиши калории числом. Например: 2300")
        return
    await state.update_data(calories=int(calories))
    await state.set_state(OwnerLogState.waiting_for_protein)
    await message.answer("Теперь белок в граммах. Например: 160")


@router.message(OwnerLogState.waiting_for_protein)
async def receive_owner_protein(message: Message, state: FSMContext) -> None:
    actor = await actor_from_message(message)
    if actor is None:
        await state.clear()
        return
    if actor.role != Role.OWNER:
        await message.answer("⛔ Доступ запрещен")
        await state.clear()
        return
    protein = parse_decimal(message.text)
    if protein is None or protein > 2000:
        await message.answer("Напиши белок числом в граммах. Например: 160")
        return
    data = await state.get_data()
    calories = data.get("calories")
    if not isinstance(calories, int):
        await state.clear()
        await message.answer("Калории потерялись. Нажми «🥗 Ввести питание» ещё раз.")
        return
    async with SessionFactory() as db:
        await services.add_nutrition(
            db,
            actor,
            NutritionInput(
                log_date=services._moscow_today(),
                calories=calories,
                protein_g=protein,
            ),
        )
        summary = await services.daily_summary(db, actor)
    await state.clear()
    await message.answer("✅ Питание записано\n\n" + services.format_daily_summary(summary))


@router.message(TrainerCommentState.waiting_for_comment)
async def receive_trainer_comment(message: Message, state: FSMContext) -> None:
    actor = await actor_from_message(message)
    if actor is None:
        await state.clear()
        return
    if actor.role != Role.TRAINER:
        await message.answer("⛔ Доступ запрещен")
        await state.clear()
        return
    comment = (message.text or "").strip()
    if not comment:
        await message.answer("Комментарий не может быть пустым. Напишите текст сообщением.")
        return
    data = await state.get_data()
    session_id = data.get("session_id")
    if not isinstance(session_id, int):
        await state.clear()
        await message.answer("Отчет не найден. Нажмите «💬 Комментарий» еще раз.")
        return
    try:
        async with SessionFactory() as db:
            await services.save_trainer_feedback(
                db,
                actor,
                session_id,
                TrainerFeedbackInput(comment=comment),
            )
    except HTTPException as exc:
        await state.clear()
        await message.answer(str(exc.detail))
        return
    await message.bot.send_message(
        settings.owner_telegram_id,
        f"💬 Комментарий тренера:\n{comment}",
    )
    await state.clear()
    await message.answer("Комментарий отправлен владельцу")


@router.message()
async def fallback(message: Message) -> None:
    await actor_from_message(message)


async def main() -> None:
    global settings
    settings = get_settings()
    logging.basicConfig(level=logging.INFO)
    bot = Bot(settings.bot_token)
    if settings.mini_app_url:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(
                text="Открыть FIT AI",
                web_app=WebAppInfo(url=settings.mini_app_url),
            )
        )
    await bot.set_my_commands(
        [
            BotCommand(command="start", description="Открыть FIT AI"),
        ]
    )
    dispatcher = Dispatcher()
    dispatcher.include_router(router)
    scheduler = build_scheduler(bot)
    scheduler.start()
    try:
        await dispatcher.start_polling(bot)
    finally:
        scheduler.shutdown(wait=False)
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
