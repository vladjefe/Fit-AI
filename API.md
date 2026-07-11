# FIT AI API

Базовый путь: `/api/v1`. Интерактивная схема доступна на `/docs`, healthcheck — `GET /health`.

## Авторизация

Все приватные запросы Mini App передают:

```http
X-Telegram-Init-Data: query_id=...&user=...&auth_date=...&hash=...
Content-Type: application/json
```

Значение — исходная строка `Telegram.WebApp.initData`, без разбора и повторного кодирования на frontend. Backend проверяет подпись токеном бота, TTL и ID из `.env`.

## Endpoints владельца

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/dashboard` | главный экран, следующая тренировка, дневные показатели |
| GET | `/workouts/next` | следующий шаблон цикла |
| GET | `/workouts/templates` | все доступные тренировки |
| POST | `/workouts/select` | сохранить выбранную тренировку для главного экрана |
| POST | `/workouts/start` | создать/вернуть активную session |
| PUT | `/workouts/{id}/sets` | upsert подхода |
| POST | `/workouts/{id}/complete` | завершить session, рассчитать прогрессию, поставить trainer report |
| GET | `/progress?weeks=8` | история и агрегаты за 1–52 недели |
| POST | `/body-weight` | добавить вес |
| POST | `/nutrition` | создать или обновить запись дня |
| POST | `/cardio` | добавить кардио и вычислить темп/скорость/PR |
| POST | `/pull-ups` | добавить результат подтягиваний |
| POST | `/wellbeing` | записать самочувствие |
| GET | `/goals` | получить цели |
| GET | `/progress-photos` | приватная история фото формы |
| GET | `/progress-photos/{id}/file` | приватно получить файл фото для сравнения |
| POST | `/progress-photos` | загрузить приватное фото формы |
| POST | `/ai/weekly-analysis` | приватный AI-анализ rolling 7 days |
| POST | `/trainer/report` | вручную повторить отчёт тренеру |

## Endpoints тренера

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/trainer/reports/latest` | последний разрешённый отчёт |
| PUT | `/trainer/reports/{session_id}/feedback` | 👍 или комментарий |

Тренеру недоступны dashboard, goals, AI и photos.

## Примеры

Начать тренировку:

```http
POST /api/v1/workouts/start
```

```json
{"session_id": 42, "status": "in_progress"}
```

Сохранить подход:

```json
{
  "exercise_template_id": 1,
  "set_number": 1,
  "weight_kg": 65,
  "reps": 12,
  "is_completed": true
}
```

`PUT` выбран намеренно: повтор с тем же exercise и set number обновляет строку, а не создаёт дубль.

Добавить питание:

```json
{"log_date":"2026-07-03","calories":2300,"protein_g":160,"fat_g":75,"carbs_g":250}
```

Добавить кардио:

```json
{"activity_type":"run","distance_km":5,"duration_seconds":1780}
```

Ответ содержит `pace_seconds_per_km`, `average_speed_kmh` и `is_personal_best`.

AI:

```json
{"as_of": null}
```

```json
{"analysis":"1) Что хорошо: ...\n2) Что улучшить: ...\n3) Что делать на следующей неделе: ..."}
```

Feedback тренера:

```json
{"reaction":"thumbs_up","comment":null}
```

или:

```json
{"reaction":null,"comment":"Хорошая техника, сохрани вес."}
```

## Ошибки

| Код | Смысл |
|---|---|
| 403 | нет/просрочен/невалиден initData, ID или роль не разрешены |
| 404 | session/template не существует или принадлежит другому пользователю |
| 409 | конфликт состояния, например некорректное действие с session |
| 422 | Pydantic validation: диапазон, обязательное поле, тип |
| 500 | внутренняя ошибка; детали не следует показывать пользователю |

Frontend должен блокировать кнопку на время запроса и показывать безопасное сообщение с возможностью повторить действие.
