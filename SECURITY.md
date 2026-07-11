# Безопасность FIT AI

## Модель доступа

| Возможность | Владелец | Тренер | Другой ID |
|---|---:|---:|---:|
| Mini App dashboard/workouts/tracking | да | нет | нет |
| Goals и AI Coach | да | нет | нет |
| Progress photos | только владелец | нет | нет |
| Trainer report | отправляет/получает feedback | читает allowlist | нет |
| 👍 и комментарий | получает | создаёт | нет |

Роль не принимается от клиента. Она определяется только сравнением подписанного Telegram ID с `OWNER_TELEGRAM_ID` и `TRAINER_TELEGRAM_ID`.

## Telegram initData

Backend:

1. извлекает исходный заголовок `X-Telegram-Init-Data`;
2. отделяет `hash`;
3. строит data-check-string по правилам Telegram;
4. проверяет HMAC через `BOT_TOKEN` с constant-time compare;
5. проверяет `auth_date` по TTL;
6. читает user ID только после успешной подписи.

Нельзя использовать `initDataUnsafe` для авторизации. API без заголовка закрыт.

## Data minimization

AI allowlist: период, вес, calories/macros, session/exercise/set metrics, cardio, pull-ups, wellbeing. Исключены Telegram ID, имя, arbitrary notes, paths и фото.

Trainer report allowlist: название/дата тренировки, упражнения, веса, повторы, вес пользователя за день, питание за день. Исключены AI, цели, фото, wellbeing и личные заметки.

## Секреты

- `.env`, `data/` и `*.db` игнорируются Git.
- Production `.env`: owner service account, mode `600`.
- Не вставляйте токены в issue, чат, скриншоты, shell history или frontend variables.
- `BOT_TOKEN` и `OPENAI_API_KEY` существуют только на backend/VPS.
- Любой опубликованный Telegram токен нужно немедленно отозвать через BotFather `/revoke`.

## Network и VPS hardening

- Uvicorn слушает только `127.0.0.1:8000`; наружу открыт nginx 80/443.
- HTTP перенаправляется на HTTPS; сертификат обновляет Certbot.
- Разрешите firewall только SSH, HTTP и HTTPS.
- Запускайте systemd services от непривилегированного пользователя, с `NoNewPrivileges` и `ProtectSystem`.
- Регулярно обновляйте OS и зависимости; проверяйте `pip-audit`/`pnpm audit` перед релизом.
- SQLite backup храните шифрованно и отдельно от VPS.

## Логи

Не логируйте:

- `X-Telegram-Init-Data` целиком;
- bot/OpenAI tokens;
- AI prompt с пользовательскими данными;
- nutrition notes и photo paths.

Допустимы request ID, endpoint, status, duration, внутренний numeric user ID и session ID. Пользовательские ошибки не должны включать stack trace.

## Остаточные риски

- Background task trainer report не является durable queue: сбой процесса после commit может потерять уведомление. Ручной `/trainer/report` позволяет повторить отправку.
- SQLite — один host/worker. Несколько writers увеличивают lock contention.
- XSS в frontend теоретически может прочитать initData; поэтому не подключайте непроверенные scripts и сохраняйте строгий CSP в nginx.
- Progress photo storage требует отдельного threat model до реализации upload endpoint.

## Release checklist

- новый случайный BOT_TOKEN, корректные два ID;
- `.env` отсутствует в `git status`;
- `pytest -q` и `pnpm build` зелёные;
- `alembic upgrade head` выполнен после backup;
- nginx `-t`, HTTPS и `/health` проверены;
- outsider, trainer и owner access tests проходят;
- trainer не видит AI/photos/goals;
- journal logs не содержат секретов.
