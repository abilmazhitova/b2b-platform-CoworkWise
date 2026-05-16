# Данные для ML-аналитики

Положи сюда файлы (скопируй из `b2b-ml_analysis` или сгенерируй):

- **districts.geojson** — полигоны районов Алматы  
  → из `b2b-ml_analysis/ml/data/districts.geojson`

- **infra_points.csv** — точки инфраструктуры (type, lat, lon). Опционально.  
  → сгенерировать: в `b2b-ml_analysis/ml/data` запусти `python extract_osm_infra.py`,  
  затем скопируй `infra_points.csv` в эту папку.

Без этих файлов рекомендации работают по активности из БД (без районов и инфры).
