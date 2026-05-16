# Чистый старт

1. **.env** — скопировать из `.env.example`, значения как там (coworkwise_db, postgres/postgres).
2. **БД:** `docker compose down -v` → `docker compose up -d` → подождать 10–15 сек.
3. **Проверка:** `python scripts/check_db.py` → должно быть OK.
4. **Миграции:** `alembic upgrade head`.
5. **Запуск:** `uvicorn app.main:app --reload`.
