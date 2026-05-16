# Аудит ML-части и план внедрения в бэкенд

## 1. Что реализовано в b2b-ml_analysis

### 1.1 Источники данных (все — локальные файлы)

| Файл | Назначение |
|------|------------|
| `data/telecom_03_04_2023.csv` | Сырые телеком-данные (объединение xlsx из `main.py`) |
| `data/telecom_cleaned.csv` | После clean_data: фильтр Алматы, TIME_HOUR→int, без дубликатов/NaN |
| `data/telecom_features.csv` | После feature_engineering: агрегат по ZID_NUMBER, avg_density, density_score, LAT/LONG_BOT_LEFT |
| `data/infra_points.csv` | Точки инфраструктуры (OSM): type, lat, lon — university, mall, cafe, coworking, bus_stop, metro и др. |
| `data/districts.geojson` | Полигоны районов Алматы (name и др.) |
| `outputs/*.json`, `outputs/*.geojson` | Результаты скриптов |

### 1.2 Preprocessing

- **clean_data.py** — очистка сырых телеком-данных: дубликаты, координаты Алматы (43–44.5°, 76–78°), TIME_HOUR из строки в int, удаление NaN.
- **feature_engineering.py** — группировка по ZID_NUMBER + WEEK_DAY_IND + TIME_HOUR, расчёт total_users и avg_density по зоне, MinMaxScaler → density_score. Итог: одна строка на зону (LAT_BOT_LEFT, LONG_BOT_LEFT, avg_density, density_score).

### 1.3 Модели / скрипты (все работают с CSV/GeoJSON)

| Скрипт | Входы | Выход | Логика |
|--------|-------|--------|--------|
| **recommendation_model.py** | telecom_features, infra_points, districts | recommendations.json | Гео: точки сеток + инфра в радиусе 700 м (infra_score, accessibility, competition). sjoin с районами. Агрегат по району. potential_score = 0.35·density + 0.25·infra + 0.2·access − 0.2·competition. Топ-3 района + describe_advantages(). |
| **forecast_model.py** | telecom_features, infra_points, districts | forecast.json | Тот же гео + инфра/конкуренция. growth_trend — рандом от rank(density). Агрегат по районам. forecast_score, category (High/Moderate/Low Growth), текстовые рекомендации. |
| **regional_insights.py** | telecom_features, districts | district_stats.json | sjoin точек с районами → по району: avg_density, hot_zones (cells с density > mean), cells, centroid. |
| **local_recommendations.py** | telecom_features, infra_points, districts, recommendations.json | local_recommendations.json | Для каждого топ-района из recommendations — лучшие точки внутри (радиус 400 м), local_potential, advantages. |
| **describe_point.py** | telecom_features, infra_points, districts | describe_point.json | Функция describe_point(lat, lon, radius_m): район (sjoin), ближайшая ячейка (density), инфра и конкуренция в радиусе, infra_examples по типам. |
| **density_model.py** | telecom_features | density_map.geojson | Точки сеток → GeoJSON с ZID_NUMBER, avg_density, density_score (для тепловой карты). |

### 1.4 Вспомогательное

- **extract_osm_infra.py** — выгрузка инфраструктуры Алматы из OSM (osmnx) в infra_points.csv (нужен osmnx в requirements).
- **main.py** — только объединение двух xlsx в один CSV (не часть пайплайна фич/моделей).
- Визуализации: map_visualization, visualize_forecast, visualize_point_analysis — для отчётов, не обязательны для API.

### 1.5 Зависимости (requirements.txt)

pandas, geopandas, numpy, folium, shapely, branca, scikit-learn, pyproj. Для OSM — отдельно osmnx.

---

## 2. Что есть в бэкенде (b2b-backend)

- **TelecomGrid**: zid_number, lat_bot_left, long_bot_left, углы ячейки (lat/long_*).
- **TelecomStat**: grid_id, week_day, time_hour, user_count, month_label.
- Загрузка данных: POST /telecom/upload (xlsx + month_label) → парсинг и запись в grids + stats.
- Аналитика (текущая): сравнение сеток по активности, рекомендации как топ по activity, прогноз по месяцам (факт + простой +5% на следующий месяц). **Без** инфраструктуры, районов и весов ML.

В БД **нет**: полигонов районов, точек инфраструктуры (coworking, cafe, metro и т.д.).

---

## 3. Разрыв между ML и бэкендом

| Аспект | ML (файлы) | Бэкенд (БД) |
|--------|------------|-------------|
| Телеком-сетки / активность | telecom_features (ZID, lat, long, avg_density) | TelecomGrid + TelecomStat (те же по смыслу данные после загрузки xlsx) |
| Время | Агрегат по зоне/день/час | week_day, time_hour, month_label — есть |
| Районы | districts.geojson | Нет |
| Инфраструктура | infra_points.csv (OSM) | Нет |

Чтобы в бэке считать так же, как в ML (recommendations с инфрой и районами, forecast по районам, describe_point), нужно либо хранить районы и инфру в БД, либо подгружать их при расчёте (например, один раз при деплое или по крону читать GeoJSON/CSV).

---

## 4. План внедрения ML в бэкенд (по шагам)

### Вариант A: Минимум — данные ML не храним, логику переносим

1. **Районы и инфра — статические файлы рядом с бэком**  
   - Положить в бэкенд (или в общее хранилище) `districts.geojson` и `infra_points.csv`.  
   - При старте приложения или по требованию загружать их в память (geopandas/pandas) и использовать в расчётах.

2. **Сервис анализа на Python (в b2b-backend)**  
   - Добавить в backend зависимости: geopandas, shapely, scikit-learn (и при необходимости pyproj).  
   - Реализовать сервис (например `app/services/ml_analysis_service.py`), который:  
     - получает из БД список сеток с координатами и активностью (уже есть get_grids_with_activity / аналог для «по зоне» с avg_density);  
     - подгружает districts.geojson и infra_points.csv;  
     - повторяет логику recommendation_model (радиус 700 м, infra_score, accessibility, competition, sjoin с районами, potential_score, топ-N);  
     - для forecast — логику forecast_model по районам (или гибрид: тренд по месяцам из БД + рост по районам из инфры);  
     - для describe_point(lat, lon) — логику describe_point.py (район, ближайшая ячейка, инфра в радиусе).  

3. **Эндпоинты**  
   - Оставить текущие `/analysis/compare`, `/analysis/recommendations`, `/analysis/forecast` или переименовать.  
   - Внутри вызывать новый ml_analysis_service вместо простой агрегации по активности.  
   - Добавить `GET /analysis/describe_point?lat=...&lon=...` → ответ как в describe_point (район, density, competition, infra_summary, infra_examples).  

4. **Фронт**  
   - Уже ходит на /analysis/*; после смены логики на ML формат ответов можно слегка расширить (например, district, reasons), не ломая текущий контракт.

### Вариант B: Районы и инфра в БД

1. **Модели**  
   - District (id, name, geometry WKT или PostGIS geometry).  
   - InfraPoint (type, lat, lon или geometry).  

2. **Загрузка**  
   - Скрипт/админка: загрузка districts.geojson → District; загрузка infra_points.csv или вызов OSM → InfraPoint.  

3. **Сервис ML**  
   - Читает сетки из БД, районы и инфру из БД (при необходимости экспорт в geopandas для sjoin/distance).  
   - Дальше та же логика, что в варианте A.

Плюс: единый источник правды, проще обновлять инфру. Минус: больше работ по миграциям и загрузке.

### Вариант C: Вынести ML в отдельный воркер

- b2b-ml_analysis как отдельный сервис: по расписанию или по запросу читает из БД (или из экспорта БД в CSV), запускает пайплайн, пишет результаты в БД (таблица analysis_recommendations, analysis_forecast и т.д.).  
- Бэкенд только отдаёт уже посчитанные результаты из БД.  
Подходит, если пайплайн тяжёлый и не хочется нагружать API-сервер.

---

## 5. Рекомендация

- **Сначала вариант A**: статические файлы districts + infra, один сервис в бэкенде, повторяющий логику recommendation_model, forecast_model и describe_point. Так мы проверяем полный цикл «БД → ML-логика → API → фронт» без миграций и админки для геоданных.  
- После этого при необходимости перенос районов/инфры в БД (вариант B) или вынос тяжёлых расчётов в воркер (вариант C).

---

## 6. Соответствие «ML — бэкенд — фронт»

| Функция ML | Текущий бэкенд | После внедрения (A) |
|------------|----------------|---------------------|
| recommendation_model | Топ сеток по activity, без районов/инфры | Топ по potential_score с районами, infra, competition, reasons |
| forecast_model | Тренд по month_label + простой +5% | Можно: тренд по месяцам из БД + категории по районам (High/Moderate/Low Growth) |
| describe_point | Нет | GET /analysis/describe_point?lat=&lon= |
| regional_insights | Нет | Опционально: GET /analysis/districts — статистика по районам |
| local_recommendations | Нет | Опционально: уточнение топ-точек внутри выбранного района |
| density_model | Карта уже по /telecom/grids/with_activity | При желании можно заменить на GeoJSON из ML (density_score) |

Итог: сначала проверяем, что реализовано в ML (этот документ), затем внедряем в бэк — начиная с варианта A и одного-двух эндпоинтов (например recommendations + describe_point), потом подключаем фронт.
