import pandas as pd
import os

# ==============================
# 📂 1. Пути к исходным данным
# ==============================
path_march = "data/bdp-1247-03_2023.xlsx"
path_april = "data/bdp-1247-04_2023.xlsx"
output_path = "data/telecom_03_04_2023.csv"

# ==============================
# 📊 2. Проверяем наличие файлов
# ==============================
for path in [path_march, path_april]:
    if not os.path.exists(path):
        raise FileNotFoundError(f"⚠️ Файл не найден: {path}")

# ==============================
# 🚀 3. Загрузка данных
# ==============================
print("Загрузка данных...")
df_march = pd.read_excel(path_march)
df_april = pd.read_excel(path_april)

print(f"✅ Март: {df_march.shape}")
print(f"✅ Апрель: {df_april.shape}")

# ==============================
# 🔗 4. Объединение двух таблиц
# ==============================
df = pd.concat([df_march, df_april], ignore_index=True)
print(f"\n✅ Данные успешно объединены! Итоговый размер: {df.shape}")

# ==============================
# 🧹 5. Базовая проверка данных
# ==============================
print("\n📋 Колонки набора данных:")
print(list(df.columns))

print("\n🔎 Проверка пропущенных значений (топ-10):")
print(df.isnull().sum().sort_values(ascending=False).head(10))

# ==============================
# 💾 6. Сохраняем объединённый CSV
# ==============================
df.to_csv(output_path, index=False, encoding="utf-8-sig")
print(f"\n📂 Объединённый CSV-файл сохранён как: {output_path}")

# ==============================
# 👀 7. Просмотр первых строк
# ==============================
print("\nПервые 5 строк данных:")
print(df.head())
