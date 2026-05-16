import pandas as pd
from sklearn.preprocessing import MinMaxScaler

# ==============================================
# 1️⃣ Пути к файлам
# ==============================================
path_input = "../data/telecom_cleaned.csv"
path_output = "../data/telecom_features.csv"

print("🔹 Загрузка очищенных данных...")
df = pd.read_csv(path_input)
print(f"✅ Загружено строк: {df.shape[0]}, столбцов: {df.shape[1]}")

# ==============================================
# 2️⃣ Агрегация данных по зонам и времени
# ==============================================
print("\n📊 Агрегирование по зонам и времени...")

# Группируем по локации (ZID_NUMBER), дню недели и часу
agg_df = (
    df.groupby(["ZID_NUMBER", "WEEK_DAY_IND", "TIME_HOUR"])
      .agg({
          "LAT_BOT_LEFT": "first",
          "LONG_BOT_LEFT": "first",
          "NUM_OF_UNIQ_USERS": "mean",
          "NUM_OF_UNIQ_HOME_USERS": "mean",
          "NUM_OF_UNIQ_WORK_USERS": "mean"
      })
      .reset_index()
)

print(f"✅ После агрегации: {agg_df.shape[0]} строк")

# ==============================================
# 3️⃣ Добавляем среднюю плотность по зоне
# ==============================================
agg_df["total_users"] = (
    agg_df["NUM_OF_UNIQ_USERS"] +
    agg_df["NUM_OF_UNIQ_HOME_USERS"] +
    agg_df["NUM_OF_UNIQ_WORK_USERS"]
)

# Средняя плотность по зоне
zone_density = agg_df.groupby("ZID_NUMBER")["total_users"].mean().reset_index()
zone_density.rename(columns={"total_users": "avg_density"}, inplace=True)

agg_df = agg_df.merge(zone_density, on="ZID_NUMBER", how="left")

# ==============================================
# 4️⃣ Нормализация плотности (0–1)
# ==============================================
scaler = MinMaxScaler()
agg_df["density_score"] = scaler.fit_transform(agg_df[["avg_density"]])

# ==============================================
# 5️⃣ Сводная таблица по зонам (итоговая)
# ==============================================
zone_summary = (
    agg_df.groupby("ZID_NUMBER")
    .agg({
        "LAT_BOT_LEFT": "first",
        "LONG_BOT_LEFT": "first",
        "avg_density": "mean",
        "density_score": "mean"
    })
    .reset_index()
)

print(f"✅ Итоговая таблица по зонам: {zone_summary.shape[0]} строк")

# ==============================================
# 6️⃣ Сохранение результата
# ==============================================
zone_summary.to_csv(path_output, index=False, encoding="utf-8-sig")
print(f"\n📁 Итоговый файл сохранён как: {path_output}")

# ==============================================
# 7️⃣ Проверка результата
# ==============================================
print("\n🔍 Пример первых 5 строк:")
print(zone_summary.head())

print(f"\n✅ Готово! Данные подготовлены для модели плотности (Heatmap).")
