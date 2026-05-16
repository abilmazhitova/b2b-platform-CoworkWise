import pandas as pd
import geopandas as gpd
from shapely.geometry import Point
from sklearn.preprocessing import MinMaxScaler
import json
import os

# ======================================================
# 1️⃣ Пути к данным
# ======================================================
path_features = "../data/telecom_features.csv"
path_infra = "../data/infra_points.csv"
path_districts = "../data/districts.geojson"
path_rent = "../data/rent_index.json"
output_path = "../outputs/recommendations.json"

print("🔹 Загрузка данных...")
df_feat = pd.read_csv(path_features)
df_infra = pd.read_csv(path_infra)
gdf_districts = gpd.read_file(path_districts)

with open(path_rent, encoding="utf-8") as f:
    _rent_raw = json.load(f)
# district name (GeoJSON) -> median rent tg/m²
RENT_INDEX: dict[str, float] = {
    k: v["median_rent_m2"]
    for k, v in _rent_raw.items()
    if not k.startswith("_")
}

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
# 3️⃣ Расчёт инфраструктуры и конкуренции
# ======================================================
print("⚙️ Расчёт инфраструктурных показателей...")
infra_types = ["university", "mall", "office", "cafe", "restaurant", "gym", "sport"]
radius = 700  # м

infra_score, access_score, competition = [], [], []

for idx, row in gdf_feat.iterrows():
    pt = row.geometry
    nearby = gdf_infra[gdf_infra.distance(pt) <= radius]
    infra_score.append(len(nearby[nearby["type"].isin(infra_types)]))
    access_score.append(len(nearby[nearby["type"].isin(["bus_stop", "metro"])]))
    competition.append(len(nearby[nearby["type"] == "coworking"]))

gdf_feat["infra_score"] = infra_score
gdf_feat["accessibility"] = access_score
gdf_feat["competition"] = competition

# ======================================================
# 4️⃣ Пространственное объединение с районами
# ======================================================
print("🧭 Пространственное объединение с районами...")
gdf_join = gpd.sjoin(gdf_feat, gdf_districts, how="left", predicate="within")

# ======================================================
# 5️⃣ Агрегация по районам
# ======================================================
print("📊 Агрегирование по районам...")
agg = gdf_join.groupby("name").agg({
    "avg_density": "mean",
    "infra_score": "mean",
    "accessibility": "mean",
    "competition": "mean"
}).reset_index()

# Добавляем арендную стоимость (медиана по данным Krisha.kz)
global_avg_rent = sum(RENT_INDEX.values()) / len(RENT_INDEX)
agg["rent_m2"] = agg["name"].map(RENT_INDEX).fillna(global_avg_rent)

# ======================================================
# 6️⃣ Нормализация показателей и итоговый балл
# ======================================================
scaler = MinMaxScaler()
for col in ["avg_density", "infra_score", "accessibility", "competition", "rent_m2"]:
    agg[col + "_scaled"] = scaler.fit_transform(agg[[col]])

# Аренда вычитается: дорогой район штрафуется
agg["potential_score"] = (
    0.30 * agg["avg_density_scaled"] +
    0.23 * agg["infra_score_scaled"] +
    0.17 * agg["accessibility_scaled"] -
    0.15 * agg["competition_scaled"] -
    0.15 * agg["rent_m2_scaled"]
)

agg = agg.sort_values("potential_score", ascending=False).reset_index(drop=True)

# ======================================================
# 7️⃣ Реалистичное описание преимуществ
# ======================================================
def describe_advantages(row):
    adv = []

    if row["avg_density_scaled"] > 0.6:
        adv.append("High people density")
    elif row["avg_density_scaled"] > 0.3:
        adv.append("Moderate people density")

    if row["infra_score_scaled"] > 0.6:
        adv.append("Strong infrastructure")
    elif row["infra_score_scaled"] > 0.3:
        adv.append("Moderate infrastructure")

    if row["accessibility_scaled"] > 0.6:
        adv.append("Good transport accessibility")
    elif row["accessibility_scaled"] > 0.3:
        adv.append("Moderate transport accessibility")

    if row["competition_scaled"] < 0.3:
        adv.append("Low competition")
    elif row["competition_scaled"] < 0.6:
        adv.append("Moderate competition")
    else:
        adv.append("High competition area")

    if row["rent_m2_scaled"] < 0.3:
        adv.append("Affordable rent")
    elif row["rent_m2_scaled"] > 0.7:
        adv.append("High rent — factor into ROI")

    return adv

# ======================================================
# 8️⃣ Формирование рекомендаций
# ======================================================
recs = []
for i, row in agg.head(3).iterrows():
    recs.append({
        "rank": i + 1,
        "district": row["name"],
        "score": round(float(row["potential_score"]), 3),
        "advantages": describe_advantages(row)
    })

# ======================================================
# 9️⃣ Сохранение в JSON
# ======================================================
os.makedirs("../outputs", exist_ok=True)
with open(output_path, "w", encoding="utf-8") as f:
    json.dump({"recommendations": recs}, f, indent=2, ensure_ascii=False)

print(f"\n📁 Рекомендации сохранены как: {output_path}")
print(json.dumps({"recommendations": recs}, indent=2, ensure_ascii=False))
print("\n✅ Готово! Файл можно подключать к API /api/recommendations")
