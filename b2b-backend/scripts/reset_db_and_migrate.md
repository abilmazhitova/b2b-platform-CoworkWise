# Сброс БД и миграции

```bash
docker compose down -v
docker compose up -d
```
Подождать 10–15 сек, затем:

```bash
python scripts/check_db.py
alembic upgrade head
```
