# Что нужно для связи фронта и бэка

## Уже подключено
- **Auth**: `POST /auth/register`, `POST /auth/login`, `GET /auth/me` — фронт вызывает, бэк отдаёт.

---

## Где фронт пока на моках — что нужно на бэке и на фронте

### 1. Карта (Map)
**Фронт:** `map-view.tsx` — моки `mockCoworkings`, `mockHeatmapData`.  
**Бэк:** уже есть `GET /telecom/grids`, `GET /telecom/stats?grid_id=...`, `POST /telecom/upload`.  
**Что сделать:** на фронте вызывать `GET /telecom/grids` и при необходимости `GET /telecom/stats` по выбранной ячейке; отображать сетки/тепловую карту из этих данных. Доп. ручки на бэке не обязательны.

---

### 2. Админка → Пользователи (Users)
**Фронт:** `users-management.tsx` — список из `mockUsers`.  
**Бэк:** списка пользователей нет.  
**Что добавить на бэке:**
- `GET /users` (или `GET /admin/users`) — список пользователей (id, email, full_name, is_admin, is_active). Доступ только для `is_admin=True`.

---

### 3. Профиль (Profile)
**Фронт:** кнопки «Save Changes» и «Update Password» пока не шлют запросы.  
**Бэк:** нет обновления профиля и смены пароля.  
**Что добавить на бэке:**
- `PATCH /auth/me` (или `PUT /users/me`) — обновление `full_name` (и при желании email) текущего пользователя. Авторизация по JWT.
- `POST /auth/change-password` — тело `current_password`, `new_password`; проверка текущего пароля, хеш нового, сохранение. Только для текущего пользователя.

После этого на фронте повесить на кнопки вызовы этих ручек.

---

### 4. Аналитика (Analysis: Compare, Recommendations, Forecast)
**Фронт:** все данные захардкожены (compare-view, recommendations-view, forecast-view).  
**Бэк:** отдельной аналитики/рекомендаций/прогноза пока нет — это зона ML.  
**Что сделать:** когда внедришь ML в бэк — добавить ручки, например:
- `GET /analysis/compare` или `POST /analysis/compare` — сравнение районов;
- `GET /analysis/recommendations` — рекомендации локаций;
- `GET /analysis/forecast` — прогноз спроса.

Фронт тогда перевести с моков на вызов этих эндпоинтов.

---

### 5. Админка → Data (загрузка данных)
**Фронт:** «Upload Data» в `data-management.tsx` без вызова API.  
**Бэк:** есть `POST /telecom/upload` (файл + `month_label`).  
**Что сделать:** на фронте вызвать `POST /telecom/upload` (multipart/form-data) при нажатии «Upload Data». Доп. ручки не нужны.

---

### 6. Прочее
- **Profile → Activity / Saved locations** — моки; для реальных данных нужны новые таблицы и ручки (история действий, сохранённые места). Можно отложить.
- **Admin → System Settings** — локальные настройки UI; бэкенд не обязателен, если не делаешь общие настройки системы в БД.

---

## Приоритет внедрения

| Приоритет | Что | Где |
|-----------|-----|-----|
| 1 | Список пользователей для админки | Бэк: `GET /users` (admin only) |
| 2 | Редактирование профиля и смена пароля | Бэк: `PATCH /auth/me`, `POST /auth/change-password`; фронт: привязать кнопки |
| 3 | Карта с реальными данными | Фронт: вызывать `GET /telecom/grids`, `GET /telecom/stats` |
| 4 | Загрузка данных в админке | Фронт: форма → `POST /telecom/upload` |
| 5 | Аналитика (Compare / Recommendations / Forecast) | Бэк: новые ручки после внедрения ML; фронт: перейти с моков на API |
