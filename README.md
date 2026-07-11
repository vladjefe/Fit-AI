# FIT AI

FIT AI — личный фитнес-дневник в формате Telegram Mini App. React-интерфейс отвечает за тренировки и прогресс, FastAPI хранит данные и рассчитывает метрики, а Telegram-бот открывает приложение, присылает напоминания и отчёты тренеру.

## Что уже работает

- цикл тренировок `Ноги 1 → Верх 1 → Ноги 2 → Верх 2` без привязки к дням недели;
- запись подходов с идемпотентным сохранением и автоматической прогрессией;
- вес, питание, кардио, подтягивания, самочувствие и цели;
- AI Coach за последние 7 дней без отправки фото и личных данных;
- один тренер: отчёт, 👍 и текстовый комментарий;
- событийные напоминания и недельный отчёт;
- адаптивный тёмный интерфейс и mock-режим для локального просмотра.
- сохраняемый выбор любой из четырёх тренировок и живой таймер активной сессии;
- автоматический отчёт владельцу в Telegram с весом и повторами каждого подхода;
- приватное сравнение двух последних фото формы без отправки фото в AI или тренеру.

## Требования

- Python 3.11 или новее;
- Node.js 20 LTS или новее;
- pnpm 9+;
- Telegram-бот от BotFather;
- HTTPS-адрес для открытия Mini App внутри Telegram.

### Установка Python

Windows: скачайте Python с [python.org](https://www.python.org/downloads/), включите `Add python.exe to PATH`, затем проверьте:

```powershell
python --version
```

Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip
python3 --version
```

### Установка Node.js и pnpm

Установите LTS-версию с [nodejs.org](https://nodejs.org/), затем:

```bash
node --version
corepack enable
corepack prepare pnpm@latest --activate
pnpm --version
```

Если `corepack` недоступен: `npm install -g pnpm`.

## Telegram-настройки

### BOT_TOKEN

1. Откройте официального бота [@BotFather](https://t.me/BotFather).
2. Отправьте `/newbot`, задайте имя и username.
3. Скопируйте токен в `.env`. Никому его не отправляйте и не коммитьте.

Если токен попал в чат, лог или репозиторий, немедленно выполните `/revoke` в BotFather и создайте новый.

### OWNER_TELEGRAM_ID и TRAINER_TELEGRAM_ID

Без сторонних ботов:

1. Временно запустите созданного бота и отправьте ему любое сообщение.
2. Откройте в браузере `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates`.
3. Возьмите число из `result[].message.from.id`.
4. Повторите со стороны тренера для `TRAINER_TELEGRAM_ID`.

Не публикуйте URL с токеном. После получения ID очистите историю браузера. Пока тренера нет, оставьте `TRAINER_TELEGRAM_ID=` пустым.

## Быстрый локальный запуск

Все команды выполняются из корня проекта.

### 1. Конфигурация

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Linux/macOS:

```bash
cp .env.example .env
```

Заполните `.env`:

```dotenv
BOT_TOKEN=123456:replace_me
OPENAI_API_KEY=
OWNER_TELEGRAM_ID=123456789
TRAINER_TELEGRAM_ID=
DATABASE_URL=sqlite+aiosqlite:///./data/fit_ai.db
MINI_APP_URL=
```

`OPENAI_API_KEY` можно оставить пустым: AI Coach вернёт безопасную локальную заглушку. Для Telegram `MINI_APP_URL` должен быть публичным HTTPS URL. Дополнительные настройки перечислены в `.env.example`.

### 2. Backend

Windows:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
alembic upgrade head
python -m backend.app.seed --demo
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

Linux/macOS:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
alembic upgrade head
python -m backend.app.seed --demo
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

Проверка: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health), OpenAPI: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

Seed без `--demo` создаёт владельца, тренера (если задан), 4 шаблона, 20 упражнений, цели и напоминания. `--demo` дополнительно создаёт несколько тренировок, вес, питание, кардио, подтягивания и самочувствие. Seed идемпотентен.

### 3. Telegram Bot

В отдельном терминале, из корня проекта и с активным virtualenv:

```bash
python -m bot.main
```

Бот работает через long polling. Одновременно должен работать только один экземпляр polling-бота с данным токеном.

### 4. Mini App

В третьем терминале:

```bash
cd frontend
pnpm install
pnpm dev
```

Откройте [http://127.0.0.1:5173](http://127.0.0.1:5173). По умолчанию включены mock-данные — интерфейс можно проверить без Telegram.

Для реального API создайте `frontend/.env.local`:

```dotenv
VITE_USE_MOCKS=false
VITE_API_URL=https://fit.example.com/api/v1
```

Обычный браузер не формирует Telegram `initData`, поэтому защищённый API вернёт 403. Реальный режим проверяйте через кнопку Mini App в Telegram.

### Подключение Mini App к боту

1. Опубликуйте frontend по HTTPS или используйте HTTPS tunnel для разработки.
2. Запишите URL в `MINI_APP_URL` и перезапустите бота.
3. В BotFather используйте `/setmenubutton` или создайте приложение через `/newapp`.
4. Укажите тот же HTTPS URL.

## Тесты и сборка

```bash
pip install -r requirements-dev.txt
pytest -q
cd frontend
pnpm typecheck
pnpm build
```

Проверяются роли, Telegram initData, цикл тренировок, прогрессия, кардио, AI-заглушка и приватность AI-контекста, тренерские отчёты/реакции/комментарии, напоминания и demo-seed.

## Базовый деплой на VPS

Ниже предполагаются Ubuntu 24.04, домен `fit.example.com` и каталог `/opt/fit-ai`.

```bash
sudo apt update
sudo apt install -y python3-venv nginx certbot python3-certbot-nginx
sudo mkdir -p /opt/fit-ai
sudo chown "$USER":"$USER" /opt/fit-ai
# скопируйте проект в /opt/fit-ai
cd /opt/fit-ai
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
# заполните .env
.venv/bin/alembic upgrade head
.venv/bin/python -m backend.app.seed
cd frontend && corepack pnpm install --frozen-lockfile && corepack pnpm build && cd ..
```

Установите подготовленные unit-файлы:

```bash
sudo cp deploy/fit-ai-backend.service /etc/systemd/system/
sudo cp deploy/fit-ai-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now fit-ai-backend fit-ai-bot
sudo systemctl status fit-ai-backend fit-ai-bot
```

Nginx и HTTPS:

```bash
sudo cp deploy/nginx-fit-ai.conf /etc/nginx/sites-available/fit-ai
sudo ln -s /etc/nginx/sites-available/fit-ai /etc/nginx/sites-enabled/fit-ai
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d fit.example.com
```

Замените `fit.example.com` в конфиге и задайте `MINI_APP_URL=https://fit.example.com`, `VITE_API_URL=https://fit.example.com/api/v1`. Файл `/opt/fit-ai/.env` должен принадлежать сервисному пользователю и иметь права `600`.

Логи и обновление:

```bash
journalctl -u fit-ai-backend -f
journalctl -u fit-ai-bot -f
cd /opt/fit-ai
.venv/bin/alembic upgrade head
cd frontend && corepack pnpm build && cd ..
sudo systemctl restart fit-ai-backend fit-ai-bot
```

Перед обновлением сохраните `data/fit_ai.db`. Для SQLite держите backend и bot на одном VPS и не запускайте несколько backend workers.

## Документация

- [ARCHITECTURE.md](ARCHITECTURE.md) — компоненты, границы и потоки;
- [API.md](API.md) — endpoints, авторизация и ошибки;
- [DATABASE.md](DATABASE.md) — таблицы, связи, миграции и backup;
- [USER_FLOW.md](USER_FLOW.md) — сценарии владельца и тренера;
- [SECURITY.md](SECURITY.md) — роли, Telegram initData, AI privacy и hardening;
- [FIT_AI_PRODUCT_SPEC.md](FIT_AI_PRODUCT_SPEC.md) — продуктовая спецификация.

## Диагностика

- `403 ⛔ Доступ запрещен`: ID не совпадает или приложение открыто вне Telegram.
- `409`: активная тренировка уже существует — продолжите её вместо повторного старта.
- Бот молчит: проверьте токен, ID, `journalctl` и отсутствие второго polling-процесса.
- Кнопка Mini App не открывается: нужен HTTPS URL и корректный `MINI_APP_URL`.
- Нет картинок упражнения: добавьте WebP/PNG в `assets/exercises/` с именем `image_key`; UI покажет стилизованный placeholder.
- AI возвращает заглушку: заполните `OPENAI_API_KEY` и перезапустите backend.
