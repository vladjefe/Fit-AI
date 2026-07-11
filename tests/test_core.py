from __future__ import annotations

from datetime import datetime, timedelta, timezone
from dataclasses import replace
from decimal import Decimal
import hashlib
import hmac
import json
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlencode

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.app import api as api_module, services
from backend.app.config import BASE_DIR, get_settings
from backend.app.db import Base, get_db
from backend.app.main import app
from backend.app.models import (
    BodyWeight,
    CardioLog,
    ExerciseSet,
    ExerciseTemplate,
    Goal,
    NutritionLog,
    ProgressPhoto,
    PullUpLog,
    Role,
    TrainerFeedback,
    User,
    WellbeingLog,
    WorkoutSession,
)
from backend.app.schemas import (
    CardioInput,
    CompleteWorkoutInput,
    ExerciseSetInput,
    TrainerFeedbackInput,
)
from backend.app.security import validate_telegram_init_data
from backend.app.seed import seed_database
from bot.scheduler import process_automations


@pytest.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        await seed_database(session)
        yield session
    await engine.dispose()


@pytest.fixture
async def owner(db):
    return await db.scalar(select(User).where(User.role == Role.OWNER))


@pytest.fixture
async def trainer(db):
    user = User(telegram_id=222333444, role=Role.TRAINER, display_name="Тренер")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def create_completed_workout(db, owner, completed_at: datetime | None = None) -> int:
    upcoming = await services.next_workout(db, owner)
    started = await services.start_workout(db, owner)
    exercise_id = upcoming["exercises"][0]["id"]
    for set_number in range(1, 4):
        await services.save_set(
            db,
            owner,
            started["session_id"],
            ExerciseSetInput(
                exercise_template_id=exercise_id,
                set_number=set_number,
                weight_kg=Decimal("65"),
                reps=12,
            ),
        )
    await services.complete_workout(
        db, owner, started["session_id"], CompleteWorkoutInput(perceived_exertion=8)
    )
    if completed_at is not None:
        session = await db.get(WorkoutSession, started["session_id"])
        assert session is not None
        session.completed_at = completed_at
        await db.commit()
    return started["session_id"]


def test_progression_rules():
    exercise = ExerciseTemplate(
        workout_template_id=1,
        name="Тест",
        image_key="test",
        sort_order=1,
        base_weight_kg=Decimal("50"),
        target_sets=3,
        rep_min=10,
        rep_max=12,
    )
    top_sets = [
        ExerciseSet(
            workout_session_id=1,
            exercise_template_id=1,
            set_number=index,
            weight_kg=Decimal("50"),
            reps=12,
        )
        for index in range(1, 4)
    ]
    result = services.progression_for(exercise, top_sets)
    assert result["action"] == "increase_weight"
    assert result["recommended_weight_kg"] == 52.5

    weak_sets = [
        ExerciseSet(
            workout_session_id=1,
            exercise_template_id=1,
            set_number=1,
            weight_kg=Decimal("50"),
            reps=5,
        )
    ]
    result = services.progression_for(exercise, weak_sets)
    assert result["action"] == "reduce_volume"
    assert result["recommended_sets"] == 2


@pytest.mark.asyncio
async def test_workout_cycle_advances_once(db, owner):
    upcoming = await services.next_workout(db, owner)
    assert upcoming["name"] == "Ноги 1"
    exercise_id = upcoming["exercises"][0]["id"]

    started = await services.start_workout(db, owner)
    for set_number in range(1, 4):
        await services.save_set(
            db,
            owner,
            started["session_id"],
            ExerciseSetInput(
                exercise_template_id=exercise_id,
                set_number=set_number,
                weight_kg=Decimal("65"),
                reps=12,
            ),
        )
    result = await services.complete_workout(
        db, owner, started["session_id"], CompleteWorkoutInput(perceived_exertion=8)
    )
    assert result["status"] == "completed"
    assert result["newly_completed"] is True
    assert result["progression"][0]["recommended_weight_kg"] == 67.5
    assert owner.current_cycle_position == 1

    duplicate = await services.complete_workout(
        db, owner, started["session_id"], CompleteWorkoutInput(perceived_exertion=8)
    )
    assert duplicate["newly_completed"] is False
    assert owner.current_cycle_position == 1
    assert (await services.next_workout(db, owner))["name"] == "Верх 1"


@pytest.mark.asyncio
async def test_selected_workout_persists_and_is_started(db, owner):
    templates = await services.workout_templates(db, owner)
    selected = templates[2]
    result = await services.select_workout(db, owner, selected["template_id"])
    assert result["name"] == "Ноги 2"
    assert (await services.next_workout(db, owner))["name"] == "Ноги 2"

    started = await services.start_workout(db, owner)
    assert started["template_id"] == selected["template_id"]
    assert started["started_at"] is not None
    assert (await services.next_workout(db, owner))["name"] == "Ноги 2"


@pytest.mark.asyncio
async def test_cardio_calculates_metrics_and_best(db, owner):
    first = await services.add_cardio(
        db,
        owner,
        CardioInput(activity_type="run", distance_km=Decimal("5"), duration_seconds=1500),
    )
    assert first["pace_seconds_per_km"] == 300
    assert first["average_speed_kmh"] == 12
    assert first["is_personal_best"] is True

    slower = await services.add_cardio(
        db,
        owner,
        CardioInput(activity_type="run", distance_km=Decimal("5"), duration_seconds=1800),
    )
    assert slower["is_personal_best"] is False


@pytest.mark.asyncio
async def test_demo_seed_is_complete_and_idempotent(db, owner):
    await seed_database(db, include_demo=True)
    await seed_database(db, include_demo=True)

    demo_sessions = await db.scalar(
        select(func.count(WorkoutSession.id)).where(WorkoutSession.notes.like("demo-seed:v1:%"))
    )
    demo_weights = await db.scalar(
        select(func.count(BodyWeight.id)).where(BodyWeight.note == "demo-seed")
    )
    demo_cardio = await db.scalar(
        select(func.count(CardioLog.id)).where(CardioLog.note == "demo-seed")
    )
    nutrition_days = await db.scalar(select(func.count(NutritionLog.id)))
    goals = await db.scalar(select(func.count(Goal.id)).where(Goal.user_id == owner.id))

    assert demo_sessions == 4
    assert demo_weights == 4
    assert demo_cardio == 3
    assert nutrition_days == 7
    assert goals == 4


def test_telegram_init_data_signature_and_id():
    settings = get_settings()
    init_data = signed_init_data(settings.owner_telegram_id)
    parsed = validate_telegram_init_data(
        init_data, settings.bot_token, settings.telegram_init_data_ttl_seconds
    )
    assert parsed["id"] == settings.owner_telegram_id


def signed_init_data(telegram_id: int) -> str:
    settings = get_settings()
    values = {
        "auth_date": str(int(datetime.now(timezone.utc).timestamp())),
        "query_id": "test",
        "user": json.dumps(
            {"id": telegram_id, "first_name": "Owner"},
            separators=(",", ":"),
        ),
    }
    check = "\n".join(f"{key}={values[key]}" for key in sorted(values))
    secret = hmac.new(b"WebAppData", settings.bot_token.encode(), hashlib.sha256).digest()
    values["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(values)


@pytest.mark.asyncio
async def test_api_enforces_init_data_and_returns_dashboard(db):
    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            denied = await client.get("/api/v1/dashboard")
            assert denied.status_code == 403
            assert denied.json()["detail"] == "⛔ Доступ запрещен"

            outsider = await client.get(
                "/api/v1/dashboard",
                headers={"X-Telegram-Init-Data": signed_init_data(111222333)},
            )
            assert outsider.status_code == 403
            assert outsider.json()["detail"] == "⛔ Доступ запрещен"

            response = await client.get(
                "/api/v1/dashboard",
                headers={
                    "X-Telegram-Init-Data": signed_init_data(
                        get_settings().owner_telegram_id
                    )
                },
            )
            assert response.status_code == 200
            assert response.json()["next_workout"]["name"] == "Ноги 1"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_owner_api_user_journey(db, owner, monkeypatch):
    async def override_db():
        yield db

    test_settings = replace(get_settings(), openai_api_key="", trainer_telegram_id=None)
    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_settings] = lambda: test_settings
    headers = {"X-Telegram-Init-Data": signed_init_data(owner.telegram_id)}
    transport = ASGITransport(app=app)
    async def skip_notification(_owner_id: int, _session_id: int) -> None:
        return None
    monkeypatch.setattr(api_module, "_send_completed_report", skip_notification)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            dashboard = await client.get("/api/v1/dashboard", headers=headers)
            assert dashboard.status_code == 200
            exercise_id = dashboard.json()["next_workout"]["exercises"][0]["id"]

            started = await client.post("/api/v1/workouts/start", headers=headers)
            assert started.status_code == 200
            session_id = started.json()["session_id"]

            for set_number in range(1, 4):
                saved = await client.put(
                    f"/api/v1/workouts/{session_id}/sets",
                    headers=headers,
                    json={
                        "exercise_template_id": exercise_id,
                        "set_number": set_number,
                        "weight_kg": 65,
                        "reps": 12,
                        "is_completed": True,
                    },
                )
                assert saved.status_code == 200

            duplicate = await client.put(
                f"/api/v1/workouts/{session_id}/sets",
                headers=headers,
                json={
                    "exercise_template_id": exercise_id,
                    "set_number": 3,
                    "weight_kg": 65,
                    "reps": 11,
                    "is_completed": True,
                },
            )
            assert duplicate.status_code == 200
            set_count = await db.scalar(
                select(func.count(ExerciseSet.id)).where(
                    ExerciseSet.workout_session_id == session_id
                )
            )
            assert set_count == 3

            completed = await client.post(
                f"/api/v1/workouts/{session_id}/complete",
                headers=headers,
                json={"perceived_exertion": 8},
            )
            assert completed.status_code == 200
            assert completed.json()["status"] == "completed"

            weight = await client.post(
                "/api/v1/body-weight", headers=headers, json={"weight_kg": 84.6}
            )
            nutrition = await client.post(
                "/api/v1/nutrition",
                headers=headers,
                json={"calories": 2300, "protein_g": 160},
            )
            cardio = await client.post(
                "/api/v1/cardio",
                headers=headers,
                json={"activity_type": "run", "distance_km": 5, "duration_seconds": 1780},
            )
            assert weight.status_code == 201
            assert nutrition.status_code == 200
            assert cardio.status_code == 201
            assert cardio.json()["pace_seconds_per_km"] == 356

            progress = await client.get("/api/v1/progress?weeks=8", headers=headers)
            detail = await client.get(f"/api/v1/workouts/{session_id}", headers=headers)
            ai = await client.post(
                "/api/v1/ai/weekly-analysis", headers=headers, json={}
            )
            assert progress.status_code == 200
            assert progress.json()["workouts"]
            assert detail.status_code == 200
            assert detail.json()["exercises"][0]["sets"]
            assert ai.status_code == 200
            assert ai.json()["analysis"].startswith("1)")

            goals = await client.get("/api/v1/goals", headers=headers)
            assert goals.status_code == 200
            goal_id = goals.json()[0]["id"]
            updated_goal = await client.put(
                f"/api/v1/goals/{goal_id}",
                headers=headers,
                json={"current_value": 83.9},
            )
            assert updated_goal.status_code == 200
            assert updated_goal.json()["current_value"] == 83.9

            reminders = await client.get("/api/v1/reminders", headers=headers)
            assert reminders.status_code == 200
            reminder_id = reminders.json()[0]["id"]
            updated_reminder = await client.put(
                f"/api/v1/reminders/{reminder_id}",
                headers=headers,
                json={"is_active": False},
            )
            assert updated_reminder.status_code == 200
            assert updated_reminder.json()["is_active"] is False

            photo = await client.post(
                "/api/v1/progress-photos",
                headers=headers,
                files={"file": ("form.jpg", b"\xff\xd8\xff\xe0test", "image/jpeg")},
                data={"pose": "front"},
            )
            assert photo.status_code == 201
            assert photo.json()["stored"] is True
            stored_photo = await db.scalar(select(ProgressPhoto).where(ProgressPhoto.user_id == owner.id))
            assert stored_photo is not None
            stored_path = BASE_DIR / stored_photo.storage_path
            assert stored_path.exists()
            stored_path.unlink(missing_ok=True)

            deleted = await client.delete(f"/api/v1/workouts/{session_id}", headers=headers)
            assert deleted.status_code == 200
            assert deleted.json()["deleted"] is True
            missing_detail = await client.get(f"/api/v1/workouts/{session_id}", headers=headers)
            assert missing_detail.status_code == 404
    finally:
        app.dependency_overrides.clear()


class FakeOpenAIResponses:
    def __init__(self):
        self.calls: list[dict] = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(
            output_text=(
                "1) Что хорошо: тренировки стабильны.\n"
                "2) Что улучшить: следить за восстановлением.\n"
                "3) Что делать на следующей неделе: сохранить ритм."
            )
        )


class FakeOpenAI:
    def __init__(self):
        self.responses = FakeOpenAIResponses()


@pytest.mark.asyncio
async def test_ai_context_is_private_and_ai_is_owner_only(db, owner, trainer):
    now = datetime.now(timezone.utc)
    await create_completed_workout(db, owner, now - timedelta(days=1))
    db.add_all(
        [
            BodyWeight(user_id=owner.id, measured_at=now - timedelta(days=6), weight_kg=Decimal("85.2")),
            BodyWeight(user_id=owner.id, measured_at=now, weight_kg=Decimal("84.6")),
            NutritionLog(
                user_id=owner.id,
                log_date=now.date(),
                calories=2300,
                protein_g=Decimal("155"),
                note="личный секрет",
            ),
            PullUpLog(user_id=owner.id, performed_at=now, reps=12),
            WellbeingLog(
                user_id=owner.id,
                recorded_at=now,
                score=8,
                sleep_hours=Decimal("7.5"),
                energy=8,
                soreness=3,
            ),
            ProgressPhoto(
                user_id=owner.id,
                taken_at=now,
                storage_path="private/secret-photo.jpg",
            ),
        ]
    )
    await db.commit()

    context = await services.build_ai_context(db, owner.id, now + timedelta(seconds=1))
    serialized = json.dumps(context, ensure_ascii=False)
    assert set(context) == {
        "period",
        "body_weight",
        "nutrition",
        "workouts",
        "cardio",
        "pull_ups",
        "wellbeing",
    }
    assert owner.display_name not in serialized
    assert str(owner.telegram_id) not in serialized
    assert "secret-photo" not in serialized
    assert "личный секрет" not in serialized

    fake_client = FakeOpenAI()
    settings = replace(get_settings(), openai_api_key="test-key")
    result = await services.weekly_ai_analysis(
        db, owner, settings, now + timedelta(seconds=1), client=fake_client
    )
    assert result["analysis"].startswith("1) Что хорошо")
    sent_context = fake_client.responses.calls[0]["input"]
    assert "secret-photo" not in sent_context
    assert str(owner.telegram_id) not in sent_context

    with pytest.raises(HTTPException) as exc_info:
        await services.weekly_ai_analysis(db, trainer, settings, now, client=fake_client)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_owner_trainer_and_outsider_api_access(db, owner, trainer):
    await create_completed_workout(db, owner)
    test_settings = replace(get_settings(), trainer_telegram_id=trainer.telegram_id)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_settings] = lambda: test_settings
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            owner_response = await client.get(
                "/api/v1/dashboard",
                headers={"X-Telegram-Init-Data": signed_init_data(owner.telegram_id)},
            )
            assert owner_response.status_code == 200

            trainer_response = await client.get(
                "/api/v1/trainer/reports/latest",
                headers={"X-Telegram-Init-Data": signed_init_data(trainer.telegram_id)},
            )
            assert trainer_response.status_code == 200

            trainer_ai = await client.post(
                "/api/v1/ai/weekly-analysis",
                json={},
                headers={"X-Telegram-Init-Data": signed_init_data(trainer.telegram_id)},
            )
            assert trainer_ai.status_code == 403

            outsider = await client.get(
                "/api/v1/dashboard",
                headers={"X-Telegram-Init-Data": signed_init_data(999888777)},
            )
            assert outsider.status_code == 403
            assert outsider.json()["detail"] == "⛔ Доступ запрещен"
    finally:
        app.dependency_overrides.clear()


class FakeAiogramBot:
    calls: list[dict] = []

    def __init__(self, _token: str):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    async def send_message(self, chat_id, text, reply_markup=None):
        self.__class__.calls.append(
            {"chat_id": chat_id, "text": text, "reply_markup": reply_markup}
        )
        return SimpleNamespace(message_id=77)


@pytest.mark.asyncio
async def test_trainer_report_contains_only_allowlisted_data(db, owner, trainer, monkeypatch):
    session_id = await create_completed_workout(db, owner)
    now = datetime.now(timezone.utc)
    db.add_all(
        [
            BodyWeight(user_id=owner.id, measured_at=now, weight_kg=Decimal("84.6")),
            NutritionLog(
                user_id=owner.id,
                log_date=now.date(),
                calories=2400,
                protein_g=Decimal("160"),
                fat_g=Decimal("75"),
                carbs_g=Decimal("260"),
                note="не показывать тренеру",
            ),
            ProgressPhoto(user_id=owner.id, storage_path="private/form.jpg"),
        ]
    )
    await db.commit()
    FakeAiogramBot.calls.clear()
    monkeypatch.setattr(services, "Bot", FakeAiogramBot)
    settings = replace(get_settings(), trainer_telegram_id=trainer.telegram_id)

    result = await services.send_trainer_report(db, owner, settings, session_id)
    assert result["sent"] is True
    call = FakeAiogramBot.calls[0]
    assert call["chat_id"] == trainer.telegram_id
    assert "Ноги 1" in call["text"]
    assert "84.6" in call["text"]
    assert "2400" in call["text"]
    assert "RPE" not in call["text"]
    assert "не показывать" not in call["text"]
    assert "form.jpg" not in call["text"]
    buttons = [button.text for row in call["reply_markup"].inline_keyboard for button in row]
    assert buttons == ["👍 Отличная тренировка", "💬 Комментарий"]


@pytest.mark.asyncio
async def test_owner_receives_completed_workout_sets(db, owner, monkeypatch):
    session_id = await create_completed_workout(db, owner)
    FakeAiogramBot.calls.clear()
    monkeypatch.setattr(services, "Bot", FakeAiogramBot)
    settings = replace(get_settings(), trainer_telegram_id=None)

    result = await services.send_owner_workout_report(db, owner, settings, session_id)
    assert result["sent"] is True
    call = FakeAiogramBot.calls[0]
    assert call["chat_id"] == settings.owner_telegram_id
    assert "Тренировка завершена" in call["text"]
    assert "Присед в гакке" in call["text"]
    assert "Подход 1: 65 кг × 12" in call["text"]
    assert call["reply_markup"] is None


class StaticSessionContext:
    def __init__(self, db):
        self.db = db

    async def __aenter__(self):
        return self.db

    async def __aexit__(self, *_args):
        return False


class FakeTelegramBot:
    def __init__(self):
        self.sent: list[tuple[int, str]] = []

    async def send_message(self, chat_id: int, text: str, **_kwargs):
        self.sent.append((chat_id, text))
        return SimpleNamespace(message_id=len(self.sent))


class FakeCallback:
    def __init__(self, trainer_id: int, data: str, bot: FakeTelegramBot):
        self.from_user = SimpleNamespace(id=trainer_id, full_name="Тренер")
        self.data = data
        self.bot = bot
        self.answers: list[tuple[str | None, bool]] = []

    async def answer(self, text: str | None = None, show_alert: bool = False):
        self.answers.append((text, show_alert))


class FakeState:
    def __init__(self):
        self.state = None
        self.data: dict = {}
        self.cleared = False

    async def set_state(self, value):
        self.state = value

    async def update_data(self, **kwargs):
        self.data.update(kwargs)

    async def get_data(self):
        return self.data

    async def clear(self):
        self.cleared = True
        self.data.clear()


class FakeMessage:
    def __init__(self, user_id: int, text: str, bot: FakeTelegramBot):
        self.from_user = SimpleNamespace(id=user_id, full_name="Тренер")
        self.text = text
        self.bot = bot
        self.answers: list[str] = []

    async def answer(self, text: str, **_kwargs):
        self.answers.append(text)


@pytest.mark.asyncio
async def test_trainer_like_notifies_owner(db, owner, trainer, monkeypatch):
    import bot.main as bot_main

    session_id = await create_completed_workout(db, owner)
    bot_main.settings = replace(get_settings(), trainer_telegram_id=trainer.telegram_id)
    monkeypatch.setattr(bot_main, "SessionFactory", lambda: StaticSessionContext(db))

    async def fake_resolve(*_args, **_kwargs):
        return trainer

    monkeypatch.setattr(bot_main, "resolve_user", fake_resolve)
    transport = FakeTelegramBot()
    callback = FakeCallback(trainer.telegram_id, f"trainer:like:{session_id}", transport)
    await bot_main.feedback_like(callback)

    assert transport.sent == [
        (owner.telegram_id, "👍 Тренер оценил тренировку: отличная работа!")
    ]
    feedback = await db.scalar(
        select(TrainerFeedback).where(TrainerFeedback.workout_session_id == session_id)
    )
    assert feedback is not None and feedback.reaction == "thumbs_up"


@pytest.mark.asyncio
async def test_trainer_comment_flow_notifies_owner(db, owner, trainer, monkeypatch):
    import bot.main as bot_main

    session_id = await create_completed_workout(db, owner)
    bot_main.settings = replace(get_settings(), trainer_telegram_id=trainer.telegram_id)
    monkeypatch.setattr(bot_main, "SessionFactory", lambda: StaticSessionContext(db))

    async def fake_resolve(*_args, **_kwargs):
        return trainer

    monkeypatch.setattr(bot_main, "resolve_user", fake_resolve)
    transport = FakeTelegramBot()
    state = FakeState()
    callback = FakeCallback(
        trainer.telegram_id, f"trainer:comment:{session_id}", transport
    )
    await bot_main.request_trainer_comment(callback, state)
    assert state.data["session_id"] == session_id
    assert transport.sent[0][0] == trainer.telegram_id

    message = FakeMessage(trainer.telegram_id, "Отличная техника, продолжай!", transport)
    await bot_main.receive_trainer_comment(message, state)
    assert state.cleared is True
    assert transport.sent[-1] == (
        owner.telegram_id,
        "💬 Комментарий тренера:\nОтличная техника, продолжай!",
    )
    feedback = await db.scalar(
        select(TrainerFeedback).where(TrainerFeedback.workout_session_id == session_id)
    )
    assert feedback is not None and feedback.comment == "Отличная техника, продолжай!"


@pytest.mark.asyncio
async def test_bot_denies_unknown_user(monkeypatch):
    import bot.main as bot_main

    bot_main.settings = replace(get_settings(), trainer_telegram_id=222333444)
    message = FakeMessage(999888777, "/start", FakeTelegramBot())
    actor = await bot_main.actor_from_message(message)
    assert actor is None
    assert message.answers == ["⛔ Доступ запрещен"]


@pytest.mark.asyncio
async def test_event_based_automations_and_weekly_report(db, owner):
    now = datetime(2026, 7, 3, 18, 30, tzinfo=timezone.utc)  # 21:30 Moscow
    owner.created_at = now - timedelta(days=20)
    await db.commit()
    transport = FakeTelegramBot()

    sent = await process_automations(db, transport, now)
    assert set(sent) == {
        "morning_weight",
        "evening_nutrition",
        "workout_rest",
        "progress_photo",
        "weekly_report",
    }
    weekly_messages = [text for _, text in transport.sent if text.startswith("📊")]
    assert len(weekly_messages) == 1
    assert "Тренировки:" in weekly_messages[0]
    assert "Средние калории:" in weekly_messages[0]

    assert await process_automations(db, transport, now + timedelta(minutes=5)) == []


@pytest.mark.asyncio
async def test_weekly_summary_calculates_requested_metrics(db, owner):
    now = datetime.now(timezone.utc)
    session_id = await create_completed_workout(db, owner, now - timedelta(days=1))
    bench = await db.scalar(select(ExerciseTemplate).where(ExerciseTemplate.name == "Жим лежа"))
    assert bench is not None
    db.add_all(
        [
            ExerciseSet(
                workout_session_id=session_id,
                exercise_template_id=bench.id,
                set_number=1,
                weight_kg=Decimal("72.5"),
                reps=7,
            ),
            BodyWeight(user_id=owner.id, measured_at=now - timedelta(days=6), weight_kg=Decimal("85.0")),
            BodyWeight(user_id=owner.id, measured_at=now, weight_kg=Decimal("84.5")),
            PullUpLog(user_id=owner.id, performed_at=now, reps=13),
            NutritionLog(user_id=owner.id, log_date=(now - timedelta(days=1)).date(), calories=2200, protein_g=Decimal("140")),
            NutritionLog(user_id=owner.id, log_date=now.date(), calories=2400, protein_g=Decimal("160")),
        ]
    )
    await db.commit()
    await services.add_cardio(
        db,
        owner,
        CardioInput(
            activity_type="run",
            distance_km=Decimal("5"),
            duration_seconds=1500,
            performed_at=now,
        ),
    )

    summary = await services.weekly_summary(db, owner.id, now + timedelta(seconds=1))
    assert summary["weight_change_kg"] == -0.5
    assert summary["workouts_count"] == 1
    assert summary["best_bench_kg"] == 72.5
    assert summary["max_pull_ups"] == 13
    assert summary["best_cardio"]["distance_km"] == 5
    assert summary["average_calories"] == 2300
    assert summary["average_protein_g"] == 150
