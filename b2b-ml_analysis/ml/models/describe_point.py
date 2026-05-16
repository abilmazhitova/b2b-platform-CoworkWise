import pandas as pd
import geopandas as gpd
from shapely.geometry import Point
import os
import json

# ======================================================
# 1️⃣ Пути к данным
# ======================================================
path_features = "../data/telecom_features.csv"
path_infra = "../data/infra_points.csv"
path_districts = "../data/districts.geojson"
output_dir = "../outputs"

# ======================================================
# 2️⃣ Загрузка данных
# ======================================================
df_feat = pd.read_csv(path_features)
df_infra = pd.read_csv(path_infra)
gdf_districts = gpd.read_file(path_districts)

# Преобразуем в геообъекты
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
# 3️⃣ Основная функция describe_point
# ======================================================
def describe_point(lat: float, lon: float, radius_m=500):
    """
    Возвращает подробную информацию о выбранной пользователем точке.
    Работает для любой точки — в городе или за его пределами.
    """

    pt = gpd.GeoSeries([Point(lon, lat)], crs="EPSG:4326").to_crs(3857).iloc[0]

    # ---- 1. Определяем район ----
    gdf_pt = gpd.GeoDataFrame(geometry=[pt], crs=3857)
    district_join = gpd.sjoin(gdf_pt, gdf_districts, how="left", predicate="within")

    if not district_join.empty and pd.notna(district_join.iloc[0].get("name", None)):
        district_name = district_join.iloc[0]["name"]
    else:
        district_name = "Outside city"

    # ---- 2. Ближайшая ячейка телеком-данных ----
    gdf_feat["distance"] = gdf_feat.geometry.distance(pt)
    if gdf_feat["distance"].min() > 2000:
        # Если ближайшая ячейка дальше 2 км → считаем, что данных нет
        density = 0
    else:
        nearest = gdf_feat.sort_values("distance").iloc[0]
        density = round(float(nearest["avg_density"]), 2)

    # ---- 3. Инфраструктура поблизости ----
    nearby = gdf_infra[gdf_infra.geometry.distance(pt) <= radius_m]
    nearby_types = nearby["type"].value_counts().to_dict()

    # ---- 4. Конкуренция ----
    competition = int(nearby[nearby["type"] == "coworking"].shape[0])

    # ---- 5. Список ближайших объектов (для отображения на карте) ----
    examples = {}
    for t in ["university", "mall", "cafe", "restaurant", "gym", "metro", "bus_stop"]:
        objs = nearby[nearby["type"] == t]
        if not objs.empty:
            examples[t] = [
                {
                    "lat": round(float(row.geometry.y), 6),
                    "lon": round(float(row.geometry.x), 6)
                }
                for _, row in objs.head(3).iterrows()
            ]

    # ---- 6. Формируем итог ----
    result = {
        "location": {"lat": lat, "lon": lon},
        "district": district_name,
        "radius_m": radius_m,
        "density": density,
        "competition": competition,
        "infra_summary": nearby_types if not nearby.empty else {},
        "infra_examples": examples if examples else {},
        "status": "ok" if district_name != "Outside city" else "out_of_city"
    }

    # ---- 7. Сохраняем результат ----
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "describe_point.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"\n✅ Подробная аналитика сохранена: {output_path}")
    return result


# ======================================================
# 4️⃣ Тест (пример для центра Алматы)
# ======================================================
if __name__ == "__main__":
    describe_point(lat=43.238949, lon=76.889709)
