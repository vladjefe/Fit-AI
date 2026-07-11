from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import hmac
import json
from urllib.parse import parse_qsl

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.config import Settings, get_settings
from backend.app.db import get_db
from backend.app.models import Role, User


ACCESS_DENIED = "⛔ Доступ запрещен"


def validate_telegram_init_data(
    init_data: str,
    bot_token: str,
    ttl_seconds: int,
) -> dict:
    try:
        values = dict(parse_qsl(init_data, strict_parsing=True))
        received_hash = values.pop("hash")
        auth_date = int(values["auth_date"])
        user = json.loads(values["user"])
    except (KeyError, ValueError, TypeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCESS_DENIED) from exc

    data_check_string = "\n".join(f"{key}={values[key]}" for key in sorted(values))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    calculated_hash = hmac.new(
        secret_key, data_check_string.encode(), hashlib.sha256
    ).hexdigest()
    now = int(datetime.now(timezone.utc).timestamp())

    if not hmac.compare_digest(calculated_hash, received_hash):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCESS_DENIED)
    if auth_date > now + 60 or now - auth_date > ttl_seconds:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCESS_DENIED)
    if not isinstance(user.get("id"), int):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCESS_DENIED)
    return user


async def get_current_user(
    init_data: str | None = Header(default=None, alias="X-Telegram-Init-Data"),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    if not init_data:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCESS_DENIED)
    telegram_user = validate_telegram_init_data(
        init_data, settings.bot_token, settings.telegram_init_data_ttl_seconds
    )
    telegram_id = int(telegram_user["id"])
    if telegram_id not in settings.allowed_telegram_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCESS_DENIED)

    role = Role.OWNER if telegram_id == settings.owner_telegram_id else Role.TRAINER
    user = await db.scalar(select(User).where(User.telegram_id == telegram_id))
    display_name = " ".join(
        part for part in (telegram_user.get("first_name"), telegram_user.get("last_name")) if part
    ) or telegram_user.get("username")
    if user is None:
        user = User(telegram_id=telegram_id, role=role, display_name=display_name)
        db.add(user)
        await db.commit()
        await db.refresh(user)
    elif user.role != role or (display_name and display_name != user.display_name):
        user.role = role
        if display_name:
            user.display_name = display_name
        await db.commit()
    return user


async def require_owner(user: User = Depends(get_current_user)) -> User:
    if user.role != Role.OWNER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCESS_DENIED)
    return user


async def require_trainer(user: User = Depends(get_current_user)) -> User:
    if user.role != Role.TRAINER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCESS_DENIED)
    return user

