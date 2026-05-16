import geopandas as gpd
import folium
import json
from branca.colormap import LinearColormap

# ======================================================
# 1️⃣ Пути
# ======================================================
path_districts = "../data/districts.geojson"
path_forecast = "../outputs/forecast.json"
output_path = "../outputs/forecast_map.html"

# ======================================================
# 2️⃣ Загрузка данных
# ======================================================
print("🔹 Загрузка данных...")
gdf_districts = gpd.read_file(path_districts)
with open(path_forecast, "r", encoding="utf-8") as f:
    forecast_data = json.load(f)["forecast"]

# Преобразуем прогноз в DataFrame для объединения
import pandas as pd
df_forecast = pd.DataFrame(forecast_data)
gdf_districts = gdf_districts.merge(df_forecast, left_on="name", right_on="district", how="left")

# ======================================================
# 3️⃣ Цветовая шкала по категориям
# ======================================================
category_colors = {
    "High Growth": "#27AE60",     # зелёный
    "Moderate Growth": "#F2C94C", # жёлтый
    "Low Growth": "#EB5757"       # красный
}

# Дополнительная шкала по значениям
colormap = LinearColormap(
    colors=["#EB5757", "#F2C94C", "#27AE60"],
    vmin=gdf_districts["forecast_score"].min(),
    vmax=gdf_districts["forecast_score"].max(),
    caption="Forecast Score (Growth Potential)"
)

# ======================================================
# 4️⃣ Создание карты
# ======================================================
m = folium.Map(location=[43.2389, 76.8897], zoom_start=11, tiles="cartodb positron")

# ======================================================
# 5️⃣ Рисуем районы
# ======================================================
for _, row in gdf_districts.iterrows():
    color = category_colors.get(row["category"], "#cccccc")
    score = round(row["forecast_score"], 3)
    popup_text = f"""
    <b>District:</b> {row['name']}<br>
    <b>Growth Trend:</b> {row['growth_trend']}<br>
    <b>Infrastructure:</b> {row['infra_strength']}<br>
    <b>Competition:</b> {row['competition']}<br>
    <b>Forecast Score:</b> {score}<br>
    <b>Category:</b> {row['category']}<br>
    <b>Recommendation:</b> {row['recommendation']}
    """

    folium.GeoJson(
        row.geometry,
        style_function=lambda x, col=color: {
            "fillColor": col,
            "color": "black",
            "weight": 2,
            "fillOpacity": 0.45
        },
        tooltip=folium.Tooltip(f"{row['name']} — {row['category']} ({score})"),
        popup=folium.Popup(popup_text, max_width=300)
    ).add_to(m)

colormap.add_to(m)

# ======================================================
# 6️⃣ Легенда
# ======================================================
legend_html = """
<div style="
    position: fixed; bottom: 30px; left: 30px; width: 220px; height: auto;
    background-color: white; border:2px solid gray; z-index:9999;
    font-size:14px; box-shadow: 2px 2px 6px rgba(0,0,0,0.3);
    border-radius: 8px; padding: 10px;">
<b>Forecast Categories:</b><br>
<span style="color:#27AE60;">●</span> High Growth<br>
<span style="color:#F2C94C;">●</span> Moderate Growth<br>
<span style="color:#EB5757;">●</span> Low Growth<br>
</div>
"""
m.get_root().html.add_child(folium.Element(legend_html))

# ======================================================
# 7️⃣ Сохранение
# ======================================================
m.save(output_path)
print(f"✅ Карта прогноза сохранена: {output_path}")
