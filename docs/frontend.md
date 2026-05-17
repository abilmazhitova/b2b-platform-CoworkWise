# Frontend — CoworkWise

**Технологии:** Next.js 15 (App Router), TypeScript, Tailwind CSS v4, Recharts, Leaflet, Zustand, shadcn/ui, Docker

Фронтенд — это визуальная часть платформы. Запускается в Docker-контейнере на порту 3000, общается с бэкендом через REST API (axios).

---

## Страницы и что они делают

### `/login` и `/register`
Вход и регистрация. Отправляют запросы на `POST /auth/login` и `POST /auth/register`.
После входа JWT-токен сохраняется в localStorage и передаётся в заголовке `Authorization: Bearer <token>`.

### `/map` — Карта (главная рабочая страница)
- Тепловая карта пешеходного трафика (Leaflet + данные из `/telecom/grids/with_activity`)
- Слои: коворкинги, транспорт, деловые районы, PostGIS-фильтр по районам
- Два режима: **Explore** (клик → аналитика точки через `/analysis/describe_point`) и **Compare** (выбор 2–8 точек для сравнения)
- Панель фильтров: район, радиус поиска, время суток

Компоненты: `map-view.tsx`, `map-filters.tsx`

### `/analysis` — Анализ (4 вкладки)

**Сравнение (`compare-view.tsx`)**

Три источника данных:
- **Map session** — временные точки из текущего визита на карту. При переключении на эту вкладку фронтенд вызывает `POST /analysis/cluster_zones` с координатами и плотностью точек → получает ML-кластер для каждой. Показывает badge "High Potential" / "Good Potential" и т.д.
- **My selected points** — сохранённые точки из localStorage
- **Model candidates** — топ-10 зон от `GET /analysis/compare` (K-Means кластеризация всей базы + geo-скоринг)

Таблица: трафик, коворкинги, конкуренция, аренда тг/м², **ML Cluster** (badge), итоговый рейтинг

Формула Decision score (клиентская, для ориентира):
```
трафик − конкуренция × 3500 − трафик × 0.25 × (аренда − min) / (max − min)
```

Три сводные карточки: лучший сейчас / лучший баланс / высокий риск. Гистограмма трафика (Recharts).

**Рекомендации (`recommendations-view.tsx`)**
- Список до 15 локаций от `GET /analysis/recommendations`
- Каждая карточка: ML-скор (0–100), ML-метка кластера (вместо geo-рейтинга), текстовые преимущества, трафик, аренда
- Действия: смотреть на карте / сохранить / скопировать резюме

**Сохранённые (`saved-places-view.tsx`)**
- Хранятся в localStorage (не в БД)
- Фильтрация: все / из рекомендаций / с карты
- Переход к полному сравнению

**Прогноз (`forecast-view.tsx`)**
- Линейный график трафика по месяцам: реальные данные + LR-прогноз следующего месяца с доверительным интервалом
- Таблица по районам: тренд роста, инфраструктура, конкуренция, итоговая оценка, категория (High/Moderate/Low Growth)

### `/admin` — Панель администратора
Доступна только пользователям с ролью `admin`.

- **Пользователи** — список, добавление, назначение/снятие роли, удаление
- **Данные** — загрузка `.xlsx` телеком-файла (`POST /telecom/upload`), автоматически запускает ML-обучение
- **Настройки** — параметры системы

### `/profile` — Профиль
Изменение имени, email и пароля.

---

## Глобальное состояние (Zustand stores)

| Store | Что хранит |
|---|---|
| `useMapStore` | Район, радиус, время суток, режим карты, точки сессии сравнения (`sessionComparePoints`) |
| `useSavedPlacesStore` | Сохранённые точки (persist в localStorage) |
| `useLangStore` | Выбранный язык (persist в localStorage) |

`SessionComparePoint` содержит: `id`, `lat`, `lng`, `district?`, `density?`, `competition?`

---

## Интернационализация (i18n)

Три языка: **English / Русский / Қазақша**

Словари в `src/lib/translations/` (en.ts, ru.ts, kk.ts). Тип `Translations` выводится из английского файла — TypeScript ошибается при отсутствии ключа в ru/kk. Хук `useT()` возвращает нужный словарь.

---

## axios-клиент (`lib/api.ts`)

- Базовый URL: `http://localhost:8000`
- Автоматически добавляет `Authorization: Bearer <token>` из localStorage
- `Content-Type: application/json` устанавливается только для не-FormData запросов (иначе браузер сам ставит `multipart/form-data` с boundary для загрузки файлов)

---

## Структура проекта

```
b2b-frontend/
├── src/
│   ├── app/                  — страницы (Next.js App Router)
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   ├── map/page.tsx
│   │   ├── analysis/page.tsx
│   │   ├── admin/page.tsx
│   │   └── profile/page.tsx
│   ├── components/
│   │   ├── analysis/
│   │   │   ├── compare-view.tsx       — сравнение (сессия/сохранённые/кандидаты)
│   │   │   ├── recommendations-view.tsx
│   │   │   ├── saved-places-view.tsx
│   │   │   └── forecast-view.tsx
│   │   ├── admin/            — users, data-management, system-settings
│   │   ├── map-view.tsx
│   │   ├── map-filters.tsx
│   │   └── navbar.tsx
│   └── lib/
│       ├── api.ts                 — axios-клиент с JWT + Content-Type логикой
│       ├── store.ts               — Zustand: карта, фильтры, sessionComparePoints
│       ├── saved-places-store.ts  — сохранённые точки (localStorage)
│       ├── lang-store.ts          — язык + useT()
│       ├── translations/          — en.ts, ru.ts, kk.ts
│       └── districts.ts           — маппинг slug ↔ название района
└── public/
```
