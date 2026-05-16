# Backend — CoworkWise

**Технологии:** Python 3.12, FastAPI, SQLAlchemy (async), PostgreSQL, Alembic, Docker

Бэкенд — это сервер, который хранит данные и отвечает на запросы фронтенда. Запускается в Docker-контейнере на порту 8000.

---

## Что делает бэкенд

### 1. Аутентификация (`app/api/auth.py`)
- `POST /auth/register` — регистрация нового пользователя (email + пароль, хэшируется через bcrypt)
- `POST /auth/login` — вход, возвращает JWT-токен
- `GET /auth/me` — возвращает данные текущего пользователя по токену

### 2. Управление пользователями (`app/api/users.py`)
- `GET /users` — список всех пользователей (только для администратора)
- `PATCH /users/{id}/role` — назначить или снять роль администратора
- `DELETE /users/{id}` — удалить пользователя
- `PATCH /users/me` — обновить своё имя и email
- `PATCH /users/me/password` — сменить пароль

### 3. Загрузка и хранение телеком-данных (`app/api/telecom.py`)
- `POST /telecom/upload` — принимает `.xlsx` файл с телеком-данными, сохраняет в PostgreSQL
- `GET /telecom/grids/with_activity` — возвращает все телеком-ячейки с суммарной активностью (используется для тепловой карты)

Структура таблиц:
- `TelecomGrid` — координаты ячейки (`ZID_NUMBER`, `lat`, `lon` по 4 углам)
- `TelecomStat` — статистика по ячейке (`week_day`, `time_hour`, `user_count`, `month_label`)

### 4. Аналитика (`app/api/analysis.py`)
Все эндпоинты вызывают ML-сервис (`ml_analysis_service.py`) и возвращают результат:

| Эндпоинт | Что возвращает |
|---|---|
| `GET /analysis/recommendations` | Топ-15 локаций с оценкой, преимуществами и метриками |
| `GET /analysis/compare` | Топ-10 ячеек для таблицы сравнения |
| `GET /analysis/forecast` | Помесячный тренд + прогноз по районам |
| `GET /analysis/describe_point` | Характеристики конкретной точки на карте (район, трафик, инфра, конкуренция) |

### 5. Геоданные (`app/api/geo.py`)
- `GET /geo/district/{slug}` — возвращает GeoJSON границ района для отрисовки на карте

---

## Как данные попадают в БД

1. Администратор загружает `.xlsx` через панель Admin → Данные
2. Бэкенд читает файл, разбирает строки
3. Для каждой уникальной ячейки (`ZID_NUMBER`) создаётся запись в `TelecomGrid`
4. Для каждой строки создаётся запись в `TelecomStat` с привязкой к ячейке и меткой месяца

---

## Статичные файлы данных (`data/`)

| Файл | Назначение |
|---|---|
| `districts.geojson` | Полигоны 8 районов Алматы (из OpenStreetMap) |
| `infra_points.csv` | OSM-объекты: кафе, транспорт, коворкинги, университеты |
| `rent_index.json` | Медиана аренды тг/м² по районам (источник: Krisha.kz) |

Эти файлы не меняются при загрузке данных — они обновляются вручную.

---

## Структура проекта

```
b2b-backend/
├── app/
│   ├── api/          — FastAPI роуты (auth, users, telecom, analysis, geo)
│   ├── models/       — SQLAlchemy модели таблиц
│   ├── schemas/      — Pydantic схемы (валидация запросов/ответов)
│   ├── services/
│   │   ├── telecom_service.py     — запросы к БД
│   │   └── ml_analysis_service.py — scoring-логика (см. docs/ml.md)
│   ├── core/security.py  — JWT и хэширование паролей
│   └── main.py           — точка входа FastAPI
├── data/             — статичные файлы (geojson, csv, json)
├── migrations/       — Alembic миграции схемы БД
└── requirements.txt
```