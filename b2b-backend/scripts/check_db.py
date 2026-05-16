"""
Проверка подключения к PostgreSQL.
Запуск из папки b2b-backend с активированным venv:
  python scripts/check_db.py
"""
import sys
sys.path.insert(0, ".")

def check():
    try:
        from app.config import settings
        import psycopg2
    except ImportError as e:
        print("Ошибка:", e)
        print("Установите: pip install psycopg2-binary")
        return False

    # На Windows + Docker иногда без sslmode=disable соединение обрывается без текста ошибки
    dsn = f"host={settings.DB_HOST} port={settings.DB_PORT} dbname={settings.DB_NAME} user={settings.DB_USER} password={settings.DB_PASS} sslmode=disable"
    print(f"Подключение к {settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME} ...")
    try:
        conn = psycopg2.connect(dsn, connect_timeout=10)
        conn.cursor().execute("SELECT 1")
        conn.close()
        print("OK: подключение к БД успешно.")
        return True
    except Exception as e:
        import traceback
        msg = getattr(e, "pgerror", None) or (e.args[0] if e.args else "") or str(e)
        print("Ошибка подключения:", msg or "(пусто — смотри вывод ниже)")
        print("Тип:", type(e).__name__, "| repr:", repr(e))
        traceback.print_exc()
        if msg and ("password" in str(msg).lower() or "authentication" in str(msg).lower()):
            print("→ Проверь DB_PASS в .env: должен совпадать с паролем в DBeaver.")
        return False

if __name__ == "__main__":
    sys.exit(0 if check() else 1)
