import geopandas as gpd
import folium
import json
import pyproj
import branca.colormap as cm

# Пути
path_districts = "../data/districts.geojson"
path_density = "../outputs/density_map.geojson"
path_local = "../outputs/local_recommendations.json"

# Загрузка
gdf_districts = gpd.read_file(path_districts)
gdf_density = gpd.read_file(path_density)
with open(path_local, "r", encoding="utf-8") as f:
    local_recs = json.load(f)

# Проекция из EPSG:3857 → EPSG:4326
projector = pyproj.Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)

# Карта
m = folium.Map(location=[43.2389, 76.8897], zoom_start=11, tiles="cartodb positron")

# --- Границы районов ---
folium.GeoJson(
    gdf_districts,
    name="Districts",
    style_function=lambda x: {
        "fillColor": "transparent",
        "color": "black",
        "weight": 2.5,
        "dashArray": "3, 3"
    },
    tooltip=folium.GeoJsonTooltip(fields=["name"], aliases=["District"])
).add_to(m)

# --- Цветовая шкала плотности ---
vmin, vmax = gdf_density["avg_density"].min(), gdf_density["avg_density"].max()
colormap = cm.LinearColormap(
    colors=["#56CCF2", "#6FCF97", "#F2C94C", "#F2994A", "#EB5757"],
    vmin=vmin, vmax=vmax,
    caption="Density (people per area)"
)
colormap.add_to(m)

# --- Точки плотности ---
for _, row in gdf_density.iterrows():
    color = colormap(row["avg_density"])
    folium.CircleMarker(
        location=[row.geometry.y, row.geometry.x],
        radius=4,
        color=color,
        fill=True,
        fill_color=color,
        fill_opacity=0.8,
        tooltip=f"Density: {round(row['avg_density'], 1)}"
    ).add_to(m)

# --- Локальные рекомендации (флажки и круги) ---
colors = {"Almaly": "red", "Auezov": "orange", "Zhetysu": "green"}

for district, points in local_recs.items():
    for i, p in enumerate(points, 1):
        lon, lat = projector.transform(p["coords"][0], p["coords"][1])
        district_color = colors.get(district, "purple")

        # Радиусная зона
        folium.Circle(
            location=[lat, lon],
            radius=p["radius_m"],
            color=district_color,
            fill=True,
            fill_opacity=0.25,
        ).add_to(m)

        # Флажок
        folium.Marker(
            location=[lat, lon],
            popup=folium.Popup(
                f"<b>{district} District</b><br>"
                f"<b>Top #{i}</b><br>"
                f"<b>Score:</b> {p['score']}<br>"
                f"<b>Advantages:</b> {', '.join([a for a in p['advantages'] if a])}",
                max_width=300
            ),
            tooltip=f"🏁 {district} — Location #{i}",
            icon=folium.Icon(color=district_color, icon="flag", prefix="fa")
        ).add_to(m)

# --- Завершение ---
folium.LayerControl().add_to(m)
m.save("../outputs/final_map_flags_fixed.html")

print("✅ Карта с флажками сохранена как: outputs/final_map_flags_fixed.html")
