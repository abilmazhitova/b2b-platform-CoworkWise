import geopandas as gpd
import folium
import json
import pyproj
from shapely.geometry import Point
import pandas as pd

# ======================================================
# 🗺 Пути
# ======================================================
path_districts = "../data/districts.geojson"
path_infra = "../data/infra_points.csv"
path_point = "../outputs/describe_point.json"

# ======================================================
# 🔹 Загрузка данных
# ======================================================
print("📂 Загрузка данных...")
gdf_districts = gpd.read_file(path_districts)

# ✅ Правильная загрузка инфраструктуры
df_infra = pd.read_csv(path_infra)
gdf_infra = gpd.GeoDataFrame(
    df_infra,
    geometry=gpd.points_from_xy(df_infra["lon"], df_infra["lat"]),
    crs="EPSG:4326"
)

# ✅ Загрузка результатов анализа точки
with open(path_point, "r", encoding="utf-8") as f:
    point_data = json.load(f)

# ======================================================
# 🔍 Проверка данных
# ======================================================
if not point_data or "location" not in point_data:
    raise ValueError("❌ Нет данных describe_point.json! Сначала запусти describe_point.py")

lat, lon = point_data["location"]["lat"], point_data["location"]["lon"]
radius = point_data["radius_m"]
district = point_data["district"]
infra_summary = point_data.get("infra_summary", {})
competition = point_data.get("competition", 0)
density = point_data.get("density", 0)

print(f"📍 Точка анализа: {lat}, {lon} — район {district}")

# ======================================================
# 🌍 Преобразование геоданных
# ======================================================
gdf_districts = gdf_districts.to_crs(4326)
pt = Point(lon, lat)

# ======================================================
# 🗺 Создание карты
# ======================================================
m = folium.Map(location=[lat, lon], zoom_start=14, tiles="cartodb positron")

# --- 1️⃣ Границы районов ---
folium.GeoJson(
    gdf_districts,
    name="Districts",
    style_function=lambda x: {
        "fillColor": "transparent",
        "color": "#222222",
        "weight": 2.2,
        "dashArray": "4, 4"
    },
    tooltip=folium.GeoJsonTooltip(fields=["name"], aliases=["District"])
).add_to(m)

# --- 2️⃣ Радиусная зона выбранной точки ---
folium.Circle(
    location=[lat, lon],
    radius=radius,
    color="blue",
    fill=True,
    fill_opacity=0.15,
    tooltip=f"📍 Анализ радиусом {radius} м"
).add_to(m)

# --- 3️⃣ Маркер самой точки ---
folium.Marker(
    location=[lat, lon],
    popup=folium.Popup(
        f"<b>Selected Location</b><br>"
        f"<b>District:</b> {district}<br>"
        f"<b>Density:</b> {density}<br>"
        f"<b>Competition:</b> {competition}<br>"
        f"<b>Infrastructure:</b> {', '.join(infra_summary.keys()) if infra_summary else 'None'}",
        max_width=350
    ),
    tooltip="📍 Выбранная точка",
    icon=folium.Icon(color="blue", icon="map-marker", prefix="fa")
).add_to(m)

# --- 4️⃣ Ближайшие инфраструктурные объекты ---
infra_colors = {
    "university": "purple",
    "mall": "darkgreen",
    "office": "cadetblue",
    "cafe": "orange",
    "restaurant": "red",
    "gym": "lightred",
    "bus_stop": "gray",
    "metro": "darkblue",
    "coworking": "black"
}

for _, row in gdf_infra.iterrows():
    dist = Point(row.geometry.x, row.geometry.y).distance(pt)
    if dist * 111000 <= radius:  # ~111 км = 1° (прибл. перевод градусов в метры)
        color = infra_colors.get(row["type"], "lightgray")
        folium.CircleMarker(
            location=[row.geometry.y, row.geometry.x],
            radius=4,
            color=color,
            fill=True,
            fill_color=color,
            fill_opacity=0.8,
            tooltip=row["type"].capitalize()
        ).add_to(m)

# --- 5️⃣ Легенда ---
legend_html = """
<div style="
    position: fixed; bottom: 40px; left: 40px; width: 260px; height: auto;
    background-color: white; border:2px solid gray; z-index:9999; font-size:14px;
    box-shadow: 2px 2px 4px rgba(0,0,0,0.3); border-radius: 8px; padding: 10px;">
<b>Legend:</b><br>
<span style="color:blue;">●</span> Selected Point<br>
<span style="color:gray;">⬤</span> Bus Stops<br>
<span style="color:darkblue;">⬤</span> Metro<br>
<span style="color:red;">⬤</span> Restaurants<br>
<span style="color:orange;">⬤</span> Cafes<br>
<span style="color:cadetblue;">⬤</span> Offices<br>
<span style="color:darkgreen;">⬤</span> Malls<br>
<span style="color:purple;">⬤</span> Universities<br>
<span style="color:black;">⬤</span> Coworkings<br>
</div>
"""
m.get_root().html.add_child(folium.Element(legend_html))

# --- 6️⃣ Сохранение ---
m.save("../outputs/describe_point_map.html")
print("✅ Карта анализа точки сохранена: outputs/describe_point_map.html")
