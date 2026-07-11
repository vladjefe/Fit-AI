# FIT AI Telegram Mini App

React + TypeScript + Vite + Tailwind CSS + Recharts + Framer Motion.

## Запуск

```powershell
cd frontend
pnpm install
pnpm run dev
```

Приложение откроется на `http://127.0.0.1:5173`.

## Режимы данных

По умолчанию включены моковые данные:

```dotenv
VITE_USE_MOCKS=true
VITE_API_URL=http://127.0.0.1:8000/api/v1
```

Для подключения FastAPI создайте `frontend/.env`, установите `VITE_USE_MOCKS=false` и запускайте Mini App внутри Telegram. API-клиент автоматически передает `Telegram.WebApp.initData` в заголовке `X-Telegram-Init-Data`.

## Изображения

Компонент ищет изображения по адресу `/assets/exercises/{imageKey}.webp`. В production этот путь обслуживает созданный FastAPI backend. Если файл отсутствует, интерфейс показывает единый темный placeholder.

## Сборка

```powershell
pnpm run typecheck
pnpm run build
```

Готовые файлы появятся в `frontend/dist/`.
