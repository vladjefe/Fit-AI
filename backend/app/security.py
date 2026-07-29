from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import secrets
from urllib.parse import parse_qsl

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.config import Settings, get_settings
from backend.app.db import get_db
from backend.app.models import DeviceToken, PairingCode, Role, User


ACCESS_DENIED = "⛔ Доступ запрещен"
INVALID_CODE = "Код неверный или уже истёк"

# Без похожих друг на друга символов: код диктуется с экрана телефона.
PAIRING_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
PAIRING_CODE_LENGTH = 8
PAIRING_CODE_TTL = timedelta(minutes=10)


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


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _format_pairing_code(code: str) -> str:
    """XXXX-XXXX читается и набирается заметно легче, чем восемь слитных символов."""
    return f"{code[:4]}-{code[4:]}"


def normalize_pairing_code(raw: str) -> str:
    return "".join(character for character in raw.upper() if character in PAIRING_ALPHABET)


async def issue_pairing_code(db: AsyncSession, telegram_id: int) -> tuple[str, datetime]:
    """Создаёт код привязки и гасит все предыдущие коды этого Telegram ID."""
    now = datetime.now(timezone.utc)
    pending = await db.scalars(
        select(PairingCode).where(
            PairingCode.telegram_id == telegram_id, PairingCode.used_at.is_(None)
        )
    )
    for item in pending:
        item.used_at = now

    code = "".join(secrets.choice(PAIRING_ALPHABET) for _ in range(PAIRING_CODE_LENGTH))
    expires_at = now + PAIRING_CODE_TTL
    db.add(
        PairingCode(telegram_id=telegram_id, code_hash=_sha256(code), expires_at=expires_at)
    )
    await db.commit()
    return _format_pairing_code(code), expires_at


async def redeem_pairing_code(
    db: AsyncSession,
    settings: Settings,
    raw_code: str,
    device_name: str | None,
) -> tuple[str, User]:
    """Меняет одноразовый код на постоянный токен устройства."""
    code = normalize_pairing_code(raw_code)
    if len(code) != PAIRING_CODE_LENGTH:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_CODE)

    now = datetime.now(timezone.utc)
    pairing = await db.scalar(select(PairingCode).where(PairingCode.code_hash == _sha256(code)))
    if pairing is None or pairing.used_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_CODE)
    if _as_utc(pairing.expires_at) < now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_CODE)
    if pairing.telegram_id not in settings.allowed_telegram_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCESS_DENIED)

    user = await _upsert_user(db, settings, pairing.telegram_id, None, commit=False)
    token = secrets.token_urlsafe(32)
    pairing.used_at = now
    db.add(
        DeviceToken(
            user_id=user.id,
            token_hash=_sha256(token),
            device_name=(device_name or "Android")[:100],
            last_used_at=now,
        )
    )
    await db.commit()
    return token, user


async def revoke_device_token(db: AsyncSession, raw_token: str) -> bool:
    device = await db.scalar(
        select(DeviceToken).where(DeviceToken.token_hash == _sha256(raw_token))
    )
    if device is None or device.revoked_at is not None:
        return False
    device.revoked_at = datetime.now(timezone.utc)
    await db.commit()
    return True


def _as_utc(value: datetime) -> datetime:
    """SQLite отдаёт naive datetime — приводим к UTC перед сравнением."""
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


async def _upsert_user(
    db: AsyncSession,
    settings: Settings,
    telegram_id: int,
    display_name: str | None,
    commit: bool = True,
) -> User:
    role = Role.OWNER if telegram_id == settings.owner_telegram_id else Role.TRAINER
    user = await db.scalar(select(User).where(User.telegram_id == telegram_id))
    if user is None:
        user = User(telegram_id=telegram_id, role=role, display_name=display_name)
        db.add(user)
        await db.flush()
        if commit:
            await db.commit()
            await db.refresh(user)
        return user
    if user.role != role or (display_name and display_name != user.display_name):
        user.role = role
        if display_name:
            user.display_name = display_name
        if commit:
            await db.commit()
    return user


async def _user_from_device_token(
    db: AsyncSession, settings: Settings, raw_token: str
) -> User:
    device = await db.scalar(
        select(DeviceToken).where(DeviceToken.token_hash == _sha256(raw_token))
    )
    if device is None or device.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCESS_DENIED)
    user = await db.get(User, device.user_id)
    if user is None or user.telegram_id not in settings.allowed_telegram_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCESS_DENIED)
    device.last_used_at = datetime.now(timezone.utc)
    await db.commit()
    return user


async def get_current_user(
    init_data: str | None = Header(default=None, alias="X-Telegram-Init-Data"),
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    if authorization and authorization.lower().startswith("bearer "):
        return await _user_from_device_token(db, settings, authorization[7:].strip())

    if not init_data:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCESS_DENIED)
    telegram_user = validate_telegram_init_data(
        init_data, settings.bot_token, settings.telegram_init_data_ttl_seconds
    )
    telegram_id = int(telegram_user["id"])
    if telegram_id not in settings.allowed_telegram_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCESS_DENIED)

    display_name = " ".join(
        part for part in (telegram_user.get("first_name"), telegram_user.get("last_name")) if part
    ) or telegram_user.get("username")
    return await _upsert_user(db, settings, telegram_id, display_name)


async def require_owner(user: User = Depends(get_current_user)) -> User:
    if user.role != Role.OWNER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCESS_DENIED)
    return user


async def require_trainer(user: User = Depends(get_current_user)) -> User:
    if user.role != Role.TRAINER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCESS_DENIED)
    return user

