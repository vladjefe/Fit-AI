from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.app.api import router
from backend.app.config import BASE_DIR, get_settings
from backend.app.schemas import HealthResponse


@asynccontextmanager
async def lifespan(_app: FastAPI):
    (BASE_DIR / "data").mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(
    title="FIT AI API",
    version="1.0.0",
    description=(
        "Backend Telegram Mini App. Все приватные endpoints требуют валидный "
        "Telegram Mini App initData в заголовке X-Telegram-Init-Data."
    ),
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(get_settings().cors_allow_origins),
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Telegram-Init-Data"],
)
app.include_router(router)
app.mount(
    "/assets/exercises",
    StaticFiles(directory=BASE_DIR / "assets" / "exercises"),
    name="exercise-assets",
)


@app.get("/health", response_model=HealthResponse, tags=["system"])
async def health() -> HealthResponse:
    return HealthResponse(status="ok")

