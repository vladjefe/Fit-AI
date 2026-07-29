from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import os
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BASE_DIR / ".env")


def _required_int(name: str) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        raise RuntimeError(f"{name} is required")
    try:
        return int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer") from exc


def _optional_int(name: str) -> int | None:
    raw = os.getenv(name, "").strip()
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer or empty") from exc


@dataclass(frozen=True, slots=True)
class Settings:
    bot_token: str
    openai_api_key: str
    owner_telegram_id: int
    trainer_telegram_id: int | None
    database_url: str
    openai_model: str
    mini_app_url: str
    api_host: str
    api_port: int
    telegram_init_data_ttl_seconds: int
    cors_allow_origins: tuple[str, ...]

    @property
    def allowed_telegram_ids(self) -> frozenset[int]:
        ids = {self.owner_telegram_id}
        if self.trainer_telegram_id is not None:
            ids.add(self.trainer_telegram_id)
        return frozenset(ids)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    bot_token = os.getenv("BOT_TOKEN", "").strip()
    if not bot_token:
        raise RuntimeError("BOT_TOKEN is required")
    return Settings(
        bot_token=bot_token,
        openai_api_key=os.getenv("OPENAI_API_KEY", "").strip(),
        owner_telegram_id=_required_int("OWNER_TELEGRAM_ID"),
        trainer_telegram_id=_optional_int("TRAINER_TELEGRAM_ID"),
        database_url=os.getenv(
            "DATABASE_URL", "sqlite+aiosqlite:///./data/fit_ai.db"
        ).strip(),
        openai_model=os.getenv("OPENAI_MODEL", "gpt-5.4-mini").strip(),
        mini_app_url=os.getenv("MINI_APP_URL", "").strip(),
        api_host=os.getenv("API_HOST", "127.0.0.1").strip(),
        api_port=int(os.getenv("API_PORT", "8000")),
        telegram_init_data_ttl_seconds=int(
            os.getenv("TELEGRAM_INIT_DATA_TTL_SECONDS", "86400")
        ),
        cors_allow_origins=_origins(),
    )


def _origins() -> tuple[str, ...]:
    """Android WebView в Capacitor ходит с origin https://localhost, а не с домена API."""
    defaults = (
        "https://localhost",
        "http://localhost",
        "capacitor://localhost",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    )
    extra = tuple(
        origin.strip()
        for origin in os.getenv("CORS_ALLOW_ORIGINS", "").split(",")
        if origin.strip()
    )
    return defaults + extra
