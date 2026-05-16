import os
import pandas as pd
import geopandas as gpd
import osmnx as ox

# ======================================================
# 1️⃣ Настройки
# ======================================================
city_name = "Almaty, Kazakhstan"
output_path = "infra_points.csv"
os.makedirs("../data", exist_ok=True)

print(f"🔹 Загрузка инфраструктурных объектов для: {city_name}")

# ======================================================
# 2️⃣ Категории для поиска (обновлённые)
# ======================================================
categories = {
    "university": {"amenity": "university"},
    "mall": {"shop": "mall"},
    "office": {"office": True},
    "coworking": {"office": "coworking"},
    "bus_stop": {"highway": "bus_stop"},
    "metro": {"railway": "station"},
    # 🆕 Добавленные категории
    "cafe": {"amenity": "cafe"},
    "restaurant": {"amenity": "restaurant"},
    "gym": {"leisure": "fitness_centre"},
    "sport": {"sport": True},
}

# ======================================================
# 3️⃣ Загрузка данных по каждой категории
# ======================================================
infra_points = []

for name, tags in categories.items():
    print(f"📍 Получаем данные для: {name} ...")
    try:
        gdf = ox.features_from_place(city_name, tags)
        gdf = gdf.to_crs("EPSG:4326")
        gdf["type"] = name
        # Центроид в проекции (3857), затем обратно в WGS84 — без предупреждений и с корректными координатами
        gdf_proj = gdf.to_crs("EPSG:3857")
        centroids = gpd.GeoDataFrame(geometry=gdf_proj.geometry.centroid, crs="EPSG:3857").to_crs("EPSG:4326")
        gdf["lon"] = centroids.geometry.x.values
        gdf["lat"] = centroids.geometry.y.values
        infra_points.append(gdf[["type", "lat", "lon"]])
        print(f"✅ {name}: {len(gdf)} объектов")
    except Exception as e:
        print(f"⚠️ Ошибка при загрузке {name}: {e}")

# ======================================================
# 4️⃣ Объединение и сохранение
# ======================================================
if len(infra_points) > 0:
    df_all = pd.concat(infra_points, ignore_index=True)
    df_all.to_csv(f"../data/{output_path}", index=False, encoding="utf-8-sig")
    print(f"\n📁 Файл сохранён: ../data/{output_path}")
    print(f"Всего объектов: {len(df_all)}")
    print(df_all.head(10))
else:
    print("❌ Не удалось получить данные. Проверь соединение или библиотеку osmnx.")
