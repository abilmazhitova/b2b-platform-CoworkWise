# Backend — CoworkWise

**Технологии:** Python 3.12, FastAPI, SQLAlchemy (async), PostgreSQL 16 + PostGIS, Alembic, httpx, GeoPandas, Docker

Бэкенд — это сервер, который хранит данные и отвечает на запросы фронтенда. Запускается в Docker-контейнере на порту 8000. Для ML-вычислений общается с отдельным ML-микросервисом (порт 8001) по HTTP.

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
- `POST /telecom/upload` — принимает `.xlsx` файл с телеком-данными, сохраняет в PostgreSQL, **запускает в фоне обучение ML-моделей** через `BackgroundTasks`
- `GET /telecom/grids/with_activity` — возвращает все телеком-ячейки с суммарной активностью (тепловая карта). Поддерживает фильтр по `district` через PostGIS (`ST_Within`)

Структура таблиц:
- `TelecomGrid` — координаты ячейки (`ZID_NUMBER`, `lat/lon` по 4 углам, `geom` — PostGIS полигон SRID 4326)
- `TelecomStat` — статистика по ячейке (`week_day`, `time_hour`, `user_count`, `month_label`)

### 4. Аналитика (`app/api/analysis.py`)

| Эндпоинт | Что возвращает |
|---|---|
| `GET /analysis/recommendations` | Топ-15 локаций: ML-кластер (K-Means) + geo-скоринг + преимущества |
| `GET /analysis/compare` | Топ-10 ячеек: ML-кластер + скор для таблицы сравнения |
| `GET /analysis/forecast` | Помесячный тренд + LR-прогноз следующего месяца + рейтинг районов |
| `GET /analysis/describe_point` | Характеристики точки: район, трафик, инфра, конкуренция |
| `GET /analysis/hotspots` | DBSCAN пространственные кластеры высокой активности |
| `POST /analysis/cluster_zones` | K-Means кластеризация произвольного списка зон (используется для сессии карты) |

**Логика K-Means в compare/recommendations:**  
Бэкенд сначала кластеризует **все** ячейки из БД (не только топ), затем делает geo-отбор топ-зон и присваивает им уже рассчитанные кластеры. Это гарантирует, что скоры (80–100, 60–79, …) отражают позицию зоны среди полной выборки.

### 5. Геоданные (`app/api/geo.py`)
- `GET /geo/district/{slug}` — возвращает GeoJSON границ района для отрисовки на карте

### 6. ML-клиент (`app/services/ml_client.py`)
Асинхронный httpx-клиент для вызова ML-микросервиса. Все функции не бросают исключения при недоступности ML-сервиса — возвращают пустой результат.

| Функция | Вызывает |
|---|---|
| `train(zones, monthly_totals)` | `POST /train` |
| `predict_clusters(zones)` | `POST /predict/clusters` |
| `predict_forecast(monthly_totals)` | `POST /predict/forecast` |
| `predict_hotspots(zones)` | `POST /predict/hotspots` |
| `health()` | `GET /health` |

---

## Как данные попадают в БД и запускают обучение

1. Администратор загружает `.xlsx` через Admin → Данные
2. `telecom_service.import_telecom_data()` парсит файл, создаёт записи в `TelecomGrid` и `TelecomStat`
3. При создании `TelecomGrid` автоматически строится PostGIS-геометрия (`geom = WKTElement(POLYGON(...), srid=4326)`)
4. После сохранения `BackgroundTasks` запускает `_trigger_ml_training()` — собирает все зоны и месяцы из БД и вызывает `ml_client.train()`
5. ML-сервис обучает K-Means + LinearRegression и сохраняет модели в `.pkl`

---

## PostGIS

В `telecom_grids` добавлена колонка `geom Geometry(POLYGON, 4326)` с GiST-индексом.

Используется для:
- Фильтрации ячеек по районам через `ST_Within(tg.geom, ST_GeomFromGeoJSON(:geojson))`
- Исключает необходимость загружать все 230+ ячеек в Python для фильтрации

---

## Статичные файлы данных (`data/`)

| Файл | Назначение |
|---|---|
| `districts.geojson` | Полигоны 8 районов Алматы (из OpenStreetMap) |
| `infra_points.csv` | OSM-объекты: кафе, транспорт, коворкинги, университеты |
| `rent_index.json` | Медиана аренды тг/м² по районам (источник: Krisha.kz) |

Эти файлы не меняются при загрузке данных — обновляются вручную.

---

## Структура проекта

```
b2b-backend/
├── app/
│   ├── api/
│   │   ├── auth.py      — регистрация, вход, JWT
│   │   ├── users.py     — управление пользователями
│   │   ├── telecom.py   — загрузка данных, триггер ML-обучения
│   │   ├── analysis.py  — аналитические эндпоинты (ML + geo)
│   │   └── geo.py       — GeoJSON районов
│   ├── models/          — SQLAlchemy модели таблиц
│   ├── schemas/         — Pydantic схемы (валидация запросов/ответов)
│   ├── services/
│   │   ├── telecom_service.py     — запросы к БД, парсинг xlsx
│   │   ├── ml_analysis_service.py — GeoPandas geo-скоринг, PostGIS helper
│   │   └── ml_client.py           — httpx-клиент ML-микросервиса
│   ├── config.py         — настройки (DATABASE_URL, ML_SERVICE_URL, SECRET_KEY)
│   ├── core/security.py  — JWT и хэширование паролей
│   └── main.py           — точка входа FastAPI
├── data/             — статичные файлы (geojson, csv, json)
├── migrations/       — Alembic миграции схемы БД
└── requirements.txt
```
