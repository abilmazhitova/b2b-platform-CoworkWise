# Что готово, что работает и что мы делали

## Что уже сделано и должно работать

### Бэкенд (b2b-backend)
- **Настройка:** созданы `.env` и `.env.example` (БД, JWT), `requirements.txt`, виртуальное окружение `.venv`, в `.gitignore` добавлены `.env` и `.venv`.
- **Зависимости:** добавлены `email-validator`, `psycopg2-binary`; Pydantic-схемы переведены на `from_attributes` (убраны предупреждения про `orm_mode`).
- **CORS:** разрешены запросы с `http://localhost:3000` и `http://127.0.0.1:3000`.
- **Auth API:** регистрация (`POST /auth/register`), логин (`POST /auth/login`) с возвратом токена и данных пользователя (`LoginResponse`).
- **Telecom API:** создание/список сеток, добавление/получение статистики, загрузка xlsx (`/telecom/grids`, `/telecom/stats`, `/telecom/upload`).
- **БД:** имя базы — `coworkwise_db`; в `.env` хост `127.0.0.1` (стабильнее с Docker на Windows).
- **Миграции:** Alembic переведён на синхронный драйвер `psycopg2` (миграции запускаются без ошибок async).
- **Docker:** в корне бэкенда есть `docker-compose.yml` — поднимает PostgreSQL 16 с базой `coworkwise_db` (порт 5432).
- **Скрипты:** `scripts/check_db.py` — проверка подключения к БД (с повторами и выводом ошибки); `scripts/reset_db_and_migrate.md` — как сбросить БД и прогнать миграции.
- **Документация:** `docs/BACKEND_PLAN_AND_DOC.md` — описание бэкенда и план развития (архитектура, API, этапы дополнения, интеграция с ML).

### Фронтенд (b2b-frontend)
- **Настройка:** `.env.local` с `NEXT_PUBLIC_API_URL=http://localhost:8000`, `.env.example` для других разработчиков.
- **API-клиент:** `src/lib/api.ts` — axios с `baseURL` из env и подстановкой токена из `localStorage` в заголовок `Authorization`.
- **Авторизация:** мок заменён на реальные вызовы: логин — `POST /auth/login`, регистрация — `POST /auth/register` + затем логин; ошибки с бэка показываются на формах.
- **Регистрация:** добавлено поле «Full name», вызов `register(email, password, fullName)` из store.

### Связка фронт ↔ бэк
- Фронт ходит на бэк по `NEXT_PUBLIC_API_URL`, бэк отдаёт CORS для фронта; после логина токен сохраняется и подставляется в последующие запросы.

---

## Что ты запускала и с чем были сложности

| Действие | Что было | Как решили |
|----------|----------|------------|
| Запуск бэка | `uvicorn app.main::app` (два двоеточия) | Нужно одно: `uvicorn app.main:app` |
| Запуск бэка | `ModuleNotFoundError: email_validator` | Добавили `email-validator` в requirements и установили |
| Запуск бэка | Предупреждения `orm_mode` → `from_attributes` | Обновили схемы в `telecom_schema.py` |
| Запуск фронта | `"next" не является командой` | Сначала нужно было выполнить `npm install` в b2b-frontend |
| Установка зависимостей бэка | `pip install requirements.txt` | Нужно с флагом: `pip install -r requirements.txt` |
| Подключение к БД | `check_db.py` — OperationalError, пустой текст | Добавили повторы, вывод `__cause__`, сменили хост на `127.0.0.1` в `.env` |
| Миграции | `alembic upgrade head` — ошибка async/connection | Перевели миграции на синхронный URL (`psycopg2`) в `migrations/env.py` |
| Docker | `docker compose up` — no configuration file | Создали `docker-compose.yml` в b2b-backend |
| Удаление БД в DBeaver | «База занята другими пользователями» | Это как раз подтвердило, что к БД есть подключение; для полного сброса — `docker compose down -v` и снова `up -d` |
| Имя БД | Захотели другую базу | Переименовали в `coworkwise_db` в `.env` и docker-compose |

---

## Что нужно сделать, чтобы всё точно работало

1. **PostgreSQL:**  
   `docker compose up -d` (из папки b2b-backend). Подождать несколько секунд.

2. **Проверка БД:**  
   `python scripts/check_db.py` — должно быть «OK: подключение к БД успешно».

3. **Миграции:**  
   `alembic upgrade head` — создадутся таблицы в `coworkwise_db`.

4. **Бэкенд:**  
   Активировать `.venv`, затем:  
   `uvicorn app.main:app --reload`  
   Должен быть доступен http://localhost:8000 и http://localhost:8000/docs.

5. **Фронтенд:**  
   В b2b-frontend: `npm install` (если ещё не делали), затем `npm run dev`.  
   Открыть http://localhost:3000 — регистрация и логин должны ходить на бэк.

---

## Что пока не делали (по плану дальше)

- Защита роутов по JWT (кроме auth).
- Эндпоинт `GET /auth/me`.
- Модуль анализа и рекомендаций (`/analysis/recommendations`).
- Интеграция с ML-сервисом (отдельный сервис, вызов с бэка).
- Полный деплой всего в Docker (бэк + фронт + БД + ML).

Файл можно дополнять по мере появления новых фич и шагов.
