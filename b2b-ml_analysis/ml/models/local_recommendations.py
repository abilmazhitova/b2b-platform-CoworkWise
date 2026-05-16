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
path_recs = "../outputs/recommendations.json"
path_rent = "../data/rent_index.json"
output_path = "../outputs/local_recommendations.json"

print("🔹 Загрузка данных...")
df_feat = pd.read_csv(path_features)
df_infra = pd.read_csv(path_infra)
gdf_districts = gpd.read_file(path_districts)
with open(path_recs, "r", encoding="utf-8") as f:
    recs = json.load(f)["recommendations"]

with open(path_rent, encoding="utf-8") as f:
    _rent_raw = json.load(f)
RENT_INDEX: dict[str, float] = {
    k: v["median_rent_m2"]
    for k, v in _rent_raw.items()
    if not k.startswith("_")
}
_global_avg_rent = sum(RENT_INDEX.values()) / len(RENT_INDEX)

top_districts = [r["district"] for r in recs]
print(f"✅ Топ-районы: {top_districts}")

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
# 3️⃣ Присвоение районов
# ======================================================
print("🧭 Пространственное объединение с районами...")
gdf_join = gpd.sjoin(gdf_feat, gdf_districts, how="left", predicate="within")

# ======================================================
# 4️⃣ Расчёт параметров
# ======================================================
print("⚙️ Расчёт инфраструктурных параметров...")
infra_types = ["university", "mall", "office", "cafe", "restaurant", "gym", "sport"]
radius = 400  # м для локальных зон

infra_score, access_score, competition = [], [], []

for idx, row in gdf_join.iterrows():
    pt = row.geometry
    nearby = gdf_infra[gdf_infra.distance(pt) <= radius]
    infra_score.append(len(nearby[nearby["type"].isin(infra_types)]))
    access_score.append(len(nearby[nearby["type"].isin(["bus_stop", "metro"])]))
    competition.append(len(nearby[nearby["type"] == "coworking"]))

gdf_join["infra_score"] = infra_score
gdf_join["accessibility"] = access_score
gdf_join["competition"] = competition

# ======================================================
# 5️⃣ Локальные рекомендации
# ======================================================
print("🏙️ Поиск лучших точек внутри каждого района...")
local_recs = {}

for district in top_districts:
    subset = gdf_join[gdf_join["name"] == district]
    if subset.empty:
        continue

    # Арендная ставка для этого района (одинакова для всех точек внутри)
    district_rent = RENT_INDEX.get(district, _global_avg_rent)
    subset = subset.copy()
    subset["rent_m2"] = district_rent

    scaler = MinMaxScaler()
    for col in ["avg_density", "infra_score", "accessibility", "competition"]:
        subset[col + "_scaled"] = scaler.fit_transform(subset[[col]])

    # rent нормализуем по глобальному диапазону (все районы), иначе внутри одного района нет дисперсии
    rent_min = min(RENT_INDEX.values())
    rent_max = max(RENT_INDEX.values())
    rent_scaled = (district_rent - rent_min) / (rent_max - rent_min) if rent_max != rent_min else 0.5
    subset["rent_scaled"] = rent_scaled

    subset["local_potential"] = (
        0.35 * subset["avg_density_scaled"] +
        0.22 * subset["infra_score_scaled"] +
        0.18 * subset["accessibility_scaled"] -
        0.13 * subset["competition_scaled"] -
        0.12 * subset["rent_scaled"]
    )

    top_points = subset.sort_values("local_potential", ascending=False).head(3)

    local_recs[district] = []
    for _, row in top_points.iterrows():
        lat, lon = row.geometry.y, row.geometry.x
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
            adv.append("Moderate transport")

        if row["competition_scaled"] < 0.3:
            adv.append("Low competition")
        elif row["competition_scaled"] < 0.6:
            adv.append("Moderate competition")
        else:
            adv.append("High competition area")

        if rent_scaled < 0.3:
            adv.append("Affordable rent")
        elif rent_scaled > 0.7:
            adv.append("High rent — factor into ROI")

        local_recs[district].append({
            "coords": [round(lon, 6), round(lat, 6)],
            "radius_m": radius,
            "score": round(float(row["local_potential"]), 3),
            "rent_m2_tg": district_rent,
            "advantages": adv
        })

# ======================================================
# 6️⃣ Сохранение результатов
# ======================================================
os.makedirs("../outputs", exist_ok=True)
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(local_recs, f, indent=2, ensure_ascii=False)

print(f"\n📁 Локальные рекомендации сохранены как: {output_path}")
print(json.dumps(local_recs, indent=2, ensure_ascii=False))
print("\n✅ Готово! Файл можно подключать к API /api/local_recommendations")
