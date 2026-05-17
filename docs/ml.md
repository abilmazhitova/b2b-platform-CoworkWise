# ML-сервис — CoworkWise

Платформа включает **отдельный ML-микросервис** (`b2b-ml`) с тремя обученными sklearn-моделями. Сервис запускается в отдельном Docker-контейнере на порту 8001 и взаимодействует с бэкендом через HTTP.

---

## Архитектура ML-слоя

```
b2b-backend (порт 8000)
    │  httpx async HTTP
    ▼
b2b-ml (порт 8001)  ←→  /app/models_store/ (pkl-файлы)
```

Бэкенд не выполняет ML-вычисления напрямую. Он вызывает ML-сервис через `app/services/ml_client.py` — асинхронный httpx-клиент.

---

## Модели

### K-Means (кластеризация зон)

**Алгоритм:** `sklearn.cluster.KMeans(n_clusters=4, random_state=42)`

**Признаки:** `density`, `infra_score`, `competition`, `rent_m2`

**Обучение:** на всех телеком-ячейках из БД. Кластеры упорядочиваются по убыванию плотности центроида → кластер с наибольшей активностью получает ранг 0.

**Выход на каждую зону:**

| Ранг | Метка | Диапазон скоров |
|------|-------|-----------------|
| 0 | High Potential | 80–100 |
| 1 | Good Potential | 60–79 |
| 2 | Moderate Potential | 40–59 |
| 3 | Low Potential | 20–39 |

Скор внутри кластера дифференцируется по плотности: самая активная зона в кластере получает максимум диапазона, наименее активная — минимум.

### Linear Regression (прогноз трафика)

**Алгоритм:** `sklearn.linear_model.LinearRegression`

**Признаки:** порядковый номер месяца (1, 2, 3, …) → нормализация через `StandardScaler`

**Цель:** суммарный трафик по всем ячейкам в месяц

**Выход:** предсказанный объём следующего месяца + доверительный интервал 95% (±1.96σ) + процент роста относительно последнего известного месяца.

### DBSCAN (пространственные хотспоты)

**Алгоритм:** `sklearn.cluster.DBSCAN(eps=0.3, min_samples=3)`

**Признаки:** нормализованные координаты (lat, lon) через `StandardScaler`

**Выход:** список географических кластеров (хотспотов) высокой активности с центром и списком зон. Зоны-шум (label=-1) игнорируются.

---

## Жизненный цикл моделей

### Обучение

Запускается автоматически в фоне после каждой загрузки `.xlsx` через `POST /telecom/upload`. Бэкенд собирает данные из БД и вызывает `POST /ml/train`:

```
Загрузка .xlsx → import_telecom_data() → BackgroundTask → ml_client.train(zones, monthly_totals)
                                                                    ↓
                                                     ML сервис обучает K-Means + LR
                                                     сохраняет .pkl в /app/models_store/
```

Сохраняемые файлы:
- `kmeans.pkl` — обученная K-Means модель
- `scaler_kmeans.pkl` — StandardScaler для K-Means
- `cluster_order.pkl` — порядок кластеров по убыванию плотности
- `linear_regression.pkl` — обученная LR модель
- `scaler_lr.pkl` — StandardScaler для LR

### Загрузка при старте

При запуске контейнера (`startup` event) ML-сервис пытается загрузить модели из `/app/models_store/`. Если файлы есть — готов сразу. Если нет — ждёт первого `/train`.

### Предсказание без обученной модели

Если модели ещё не обучены:
- `predict_clusters` возвращает `[]` → бэкенд использует fallback (geo-скоринг)
- `predict_forecast` обучает LR «на лету» на переданных данных → всегда возвращает результат

---

## HTTP API ML-сервиса

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/health` | Статус сервиса и флаг `trained` |
| POST | `/train` | Обучить модели на переданных зонах и месяцах |
| POST | `/predict/clusters` | K-Means кластеризация списка зон |
| POST | `/predict/forecast` | LR-прогноз следующего месяца |
| POST | `/predict/hotspots` | DBSCAN пространственные кластеры |

---

## Гео-аналитика в бэкенде (ml_analysis_service.py)

Помимо ML-моделей, бэкенд выполняет геопространственный анализ через **GeoPandas + Shapely**:

- **Привязка к районам** — `sjoin` с полигонами `districts.geojson` (EPSG:3857)
- **Инфраструктурные признаки** — подсчёт объектов из `infra_points.csv` в радиусе 700 м (`infra_score`, `accessibility`, `competition`)
- **Взвешенный geo-скоринг** — резервный балл без ML:
  ```
  potential_score = 0.30×трафик + 0.23×инфра + 0.17×транспорт − 0.15×конкуренция − 0.15×аренда
  ```
- **Прогноз по районам** — агрегация тренда, инфраструктуры и конкуренции по районам

Geo-скоринг используется как fallback и для формирования текстовых преимуществ ("High people density", "Affordable rent" и т.д.).

---

## Пространственные запросы через PostGIS

Для фильтрации ячеек по районам используется PostGIS в PostgreSQL:

- Каждая ячейка хранит поле `geom` типа `Geometry(POLYGON, SRID=4326)`
- `GET /telecom/grids/with_activity?district=medeu` выполняет `ST_Within(tg.geom, ST_GeomFromGeoJSON(:geojson))` — без загрузки всех данных в Python

---

## Данные которые используются

| Источник | Что даёт | Как обновлять |
|---|---|---|
| Телеком-оператор (.xlsx) | Уникальные пользователи по ячейкам, час, день, месяц | Загрузка через Admin → Данные |
| OpenStreetMap (Overpass API) | Инфраструктура: кафе, транспорт, коворкинги | Скрипт `extract_osm_infra.py` |
| Krisha.kz (парсинг) | Медиана аренды коммерческой недвижимости по районам | Скрипт `scraper/krisha_scraper.py` |
| districts.geojson | Границы 8 районов Алматы | Статично |

---

## Структура проекта

```
b2b-ml/
├── app/
│   ├── main.py         — FastAPI: /health, /train, /predict/*
│   ├── ml_service.py   — KMeans, LinearRegression, DBSCAN + load/train/predict
│   └── schemas.py      — Pydantic: TrainRequest, ClusterRequest, ForecastRequest, HotspotRequest
├── Dockerfile
└── requirements.txt

b2b-backend/app/services/
├── ml_client.py         — httpx-клиент для вызова b2b-ml
└── ml_analysis_service.py — GeoPandas geo-скоринг + PostGIS helper

b2b-backend/data/
├── districts.geojson    — границы 8 районов Алматы
├── infra_points.csv     — OSM-инфраструктура (~6 000 объектов)
└── rent_index.json      — медиана аренды по районам (Krisha.kz)
```
