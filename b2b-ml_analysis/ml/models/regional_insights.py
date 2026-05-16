import geopandas as gpd
import pandas as pd
from shapely.geometry import Point
import json
import os

# ======================================================
# 1️⃣ Пути к данным
# ======================================================
path_points = "../data/telecom_features.csv"
path_districts = "../data/districts.geojson"
path_output = "../outputs/district_stats.json"

os.makedirs("../outputs", exist_ok=True)

print("🔹 Загрузка данных...")
df_points = pd.read_csv(path_points)
gdf_districts = gpd.read_file(path_districts)

print(f"✅ Точек: {df_points.shape[0]}, Районов: {gdf_districts.shape[0]}")

# ======================================================
# 2️⃣ Преобразуем точки в геообъекты
# ======================================================
gdf_points = gpd.GeoDataFrame(
    df_points,
    geometry=[Point(xy) for xy in zip(df_points["LONG_BOT_LEFT"], df_points["LAT_BOT_LEFT"])],
    crs="EPSG:4326"
)

# ======================================================
# 3️⃣ Пространственное соединение (join)
# ======================================================
print("\n🧭 Пространственное соединение точек с районами...")
gdf_joined = gpd.sjoin(gdf_points, gdf_districts, how="inner", predicate="within")

print(f"✅ Совпадений найдено: {gdf_joined.shape[0]}")

# ======================================================
# 4️⃣ Перевод названий районов в английский формат
# ======================================================
district_name_map = {
    "Алатауский": "Alatau",
    "Алмалинский": "Almaly",
    "Ауэзовский": "Auezov",
    "Бостандыкский": "Bostandyk",
    "Жетысуский": "Zhetysu",
    "Наурызбайский": "Nauryzbay",
    "Медеуский": "Medeu",
    "Турксибский": "Turksib",
    "Alatau District": "Alatau",
    "Almaly District": "Almaly",
    "Auezov District": "Auezov",
    "Bostandyk District": "Bostandyk",
    "Zhetysu District": "Zhetysu",
    "Nauryzbay District": "Nauryzbay",
    "Medeu District": "Medeu",
    "Turksib District": "Turksib"
}

# Определяем имя колонки с районом (иногда в geojson "name", иногда "district")
name_col = "name" if "name" in gdf_joined.columns else "district"

# Применяем перевод
gdf_joined[name_col] = gdf_joined[name_col].map(lambda x: district_name_map.get(x, x))

# ======================================================
# 5️⃣ Агрегирование по районам
# ======================================================
print("\n📊 Агрегирование по районам...")
district_stats = (
    gdf_joined.groupby(name_col)
    .agg(
        avg_density=("avg_density", "mean"),
        hot_zones=("density_score", lambda x: (x > x.mean()).sum()),
        cells=("ZID_NUMBER", "count")
    )
    .reset_index()
)

# ======================================================
# 6️⃣ Добавляем центроиды районов
# ======================================================
centroids = gdf_districts.set_index("name").geometry.centroid
district_stats["centroid"] = district_stats[name_col].apply(
    lambda n: list(centroids.get(n, None).coords[0]) if n in centroids else [None, None]
)

# ======================================================
# 7️⃣ Преобразуем в словарь и сохраняем JSON
# ======================================================
stats_dict = district_stats.set_index(name_col).T.to_dict()
with open(path_output, "w", encoding="utf-8") as f:
    json.dump(stats_dict, f, ensure_ascii=False, indent=2)

print(f"\n📁 Файл успешно сохранён: {path_output}")

# ======================================================
# 8️⃣ Пример результата
# ======================================================
print("\n🔍 Пример:")
print(json.dumps({k: stats_dict[k] for k in list(stats_dict.keys())[:3]}, indent=2, ensure_ascii=False))

print("\n✅ Готово! Районная аналитика сформирована (английские названия).")
