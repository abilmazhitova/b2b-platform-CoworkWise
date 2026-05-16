import pandas as pd
import geopandas as gpd
from sklearn.preprocessing import MinMaxScaler
import numpy as np
import json
import os

# ======================================================
# 1️⃣ Пути к данным
# ======================================================
path_features = "../data/telecom_features.csv"
path_infra = "../data/infra_points.csv"
path_districts = "../data/districts.geojson"
output_path = "../outputs/forecast.json"

print("🔹 Загрузка данных...")
df_feat = pd.read_csv(path_features)
df_infra = pd.read_csv(path_infra)
gdf_districts = gpd.read_file(path_districts)

# ======================================================
# 2️⃣ Подготовка геоданных
# ======================================================
print("📍 Подготовка геоданных...")
gdf_feat = gpd.GeoDataFrame(
    df_feat,
    geometry=gpd.points_from_xy(df_feat["LONG_BOT_LEFT"], df_feat["LAT_BOT_LEFT"]),
    crs="EPSG:4326"
).to_crs(3857)

gdf_infra = gpd.GeoDataFrame(
    df_infra,
    geometry=gpd.points_from_xy(df_infra["lon"], df_infra["lat"]),
    crs="EPSG:4326"
).to_crs(3857)

gdf_districts = gdf_districts.to_crs(3857)

# ======================================================
# 3️⃣ Пространственное объединение
# ======================================================
print("🧭 Пространственное объединение с районами...")
gdf_join = gpd.sjoin(gdf_feat, gdf_districts, how="left", predicate="within")

# ======================================================
# 4️⃣ Расчёт инфраструктуры и конкуренции
# ======================================================
print("⚙️ Расчёт инфраструктуры и конкуренции...")
infra_types = ["university", "mall", "office", "cafe", "restaurant", "gym", "sport"]
radius = 700  # м

infra_score, competition = [], []
for idx, row in gdf_join.iterrows():
    pt = row.geometry
    nearby = gdf_infra[gdf_infra.distance(pt) <= radius]
    infra_score.append(len(nearby[nearby["type"].isin(infra_types)]))
    competition.append(len(nearby[nearby["type"] == "coworking"]))

gdf_join["infra_score"] = infra_score
gdf_join["competition"] = competition

# ======================================================
# 5️⃣ Моделируем "рост" активности (тренд)
# ======================================================
print("📈 Моделирование роста активности...")
# Если нет реальных временных данных, сымитируем тенденции
np.random.seed(42)
gdf_join["growth_trend"] = (
    gdf_join["avg_density"].rank(pct=True)
    + np.random.uniform(-0.15, 0.15, len(gdf_join))
).clip(0, 1)

# ======================================================
# 6️⃣ Агрегация по районам
# ======================================================
print("📊 Агрегирование по районам...")
agg = gdf_join.groupby("name").agg({
    "growth_trend": "mean",
    "infra_score": "mean",
    "competition": "mean"
}).reset_index()

# ======================================================
# 7️⃣ Нормализация и итоговый балл прогноза
# ======================================================
scaler = MinMaxScaler()
for col in ["growth_trend", "infra_score", "competition"]:
    agg[col + "_scaled"] = scaler.fit_transform(agg[[col]])

agg["forecast_score"] = (
    0.5 * agg["growth_trend_scaled"]
    + 0.3 * agg["infra_score_scaled"]
    - 0.2 * agg["competition_scaled"]
)

# ======================================================
# 8️⃣ Классификация категорий прогноза
# ======================================================
def classify_forecast(score):
    if score > 0.7:
        return "High Growth"
    elif score > 0.4:
        return "Moderate Growth"
    else:
        return "Low Growth"

agg["category"] = agg["forecast_score"].apply(classify_forecast)

# ======================================================
# 9️⃣ Текстовые рекомендации
# ======================================================
def make_recommendation(row):
    if row["category"] == "High Growth":
        return "High potential — strong infrastructure and rising demand"
    elif row["category"] == "Moderate Growth":
        return "Moderate potential — consider key transport areas"
    else:
        return "Low potential — low growth or high competition"

agg["recommendation"] = agg.apply(make_recommendation, axis=1)

# ======================================================
# 🔟 Сохранение результатов
# ======================================================
forecast_data = []
for _, row in agg.iterrows():
    forecast_data.append({
        "district": row["name"],
        "growth_trend": round(float(row["growth_trend_scaled"]), 3),
        "infra_strength": round(float(row["infra_score_scaled"]), 3),
        "competition": round(float(row["competition_scaled"]), 3),
        "forecast_score": round(float(row["forecast_score"]), 3),
        "category": row["category"],
        "recommendation": row["recommendation"]
    })

os.makedirs("../outputs", exist_ok=True)
with open(output_path, "w", encoding="utf-8") as f:
    json.dump({"forecast": forecast_data}, f, indent=2, ensure_ascii=False)

print(f"\n📁 Прогноз сохранён как: {output_path}")
print(json.dumps({"forecast": forecast_data}, indent=2, ensure_ascii=False))
print("\n✅ Готово! Файл можно подключать к API /api/forecast")
