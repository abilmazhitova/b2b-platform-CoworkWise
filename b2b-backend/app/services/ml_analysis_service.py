
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


try:
    import numpy as np
    import pandas as pd
    import geopandas as gpd
    from shapely.geometry import Point
    from sklearn.preprocessing import MinMaxScaler
    _GEO_AVAILABLE = True
except ImportError:
    np = None 
    _GEO_AVAILABLE = False

_base = Path(__file__).resolve().parent.parent
_DATA_DIR = _base / "data"
if not (_DATA_DIR / "districts.geojson").exists() and not (_DATA_DIR / "infra_points.csv").exists():
    _alt = _base.parent / "data"
    if (_alt / "districts.geojson").exists() or (_alt / "infra_points.csv").exists():
        _DATA_DIR = _alt
_CACHE = {"districts": None, "infra": None, "_loaded": False}


_RENT_INDEX: dict[str, float] = {
    "Almaly":    9000,
    "Auezov":    7500,
    "Bostandyq": 12100,
    "Medeu":     12000,
    "Turksib":   5000,
    "Zhetysu":   6667,
    "Alatau":    6000,
    "Nauryzbay": 4615,
}
_RENT_MIN = min(_RENT_INDEX.values())
_RENT_MAX = max(_RENT_INDEX.values())
_RENT_AVG = sum(_RENT_INDEX.values()) / len(_RENT_INDEX)


DISTRICT_SLUG_TO_GEOJSON_NAME = {
    "almaly": "Almaly",
    "auezov": "Auezov",
    "bostandyk": "Bostandyq",
    "medeu": "Medeu",
    "turksib": "Turksib",
    "zhetysu": "Zhetysu",
    "alatau": "Alatau",
    "nauryzbay": "Nauryzbay",
}


def _growth_from_score(score: int) -> str:

    n = max(0, min(30, int(round((score - 45) * 0.6))))
    return f"+{n}%" if n else "+0%"


def filter_grids_by_district(rows, district_slug: str | None):

    if not rows or not district_slug or str(district_slug).lower() in ("all", ""):
        return rows
    target = DISTRICT_SLUG_TO_GEOJSON_NAME.get(str(district_slug).lower().strip())
    if not target:
        logger.warning("Unknown district slug: %s", district_slug)
        return []
    if not _GEO_AVAILABLE:
        logger.warning("District filter skipped: geopandas/shapely not available")
        return []
    gdf_d, _ = _load_geo()
    if gdf_d is None or gdf_d.empty:
        logger.warning("District filter skipped: districts.geojson missing or empty")
        return []
    name_col = "name" if "name" in gdf_d.columns else None
    if not name_col:
        return rows
    sub = gdf_d[gdf_d[name_col] == target]
    if sub.empty:
        logger.warning("District polygon not found for slug=%s name=%s", district_slug, target)
        return []
    records = []
    for g, _ in rows:
        lat = (g.lat_bot_left + g.lat_top_right) / 2
        lon = (g.long_bot_left + g.long_top_right) / 2
        records.append({"lat": lat, "lon": lon})
    df = pd.DataFrame(records)
    gdf_pts = gpd.GeoDataFrame(
        df,
        geometry=gpd.points_from_xy(df["lon"], df["lat"]),
        crs="EPSG:4326",
    ).to_crs(3857)
    joined = gpd.sjoin(gdf_pts, sub, how="inner", predicate="within")
    if joined.empty:
        return []
    keep = sorted(set(joined.index.astype(int).tolist()))
    return [rows[i] for i in keep]


def get_district_feature_geojson(slug: str):

    if not slug or not _GEO_AVAILABLE:
        return None
    target = DISTRICT_SLUG_TO_GEOJSON_NAME.get(str(slug).lower().strip())
    if not target:
        return None
    gdf_d, _ = _load_geo()
    if gdf_d is None or gdf_d.empty:
        return None
    name_col = "name" if "name" in gdf_d.columns else None
    if not name_col:
        return None
    sub = gdf_d[gdf_d[name_col] == target]
    if sub.empty:
        return None
    try:
        from shapely.geometry import mapping
        g4326 = sub.to_crs(4326)
        geom = g4326.geometry.unary_union
        return {
            "type": "Feature",
            "properties": {"name": target, "slug": str(slug).lower().strip()},
            "geometry": mapping(geom),
        }
    except Exception as e:
        logger.exception("get_district_feature_geojson: %s", e)
        return None


def get_district_geometry_geojson_str(slug: str) -> str | None:
    """Return district geometry as GeoJSON string for use in PostGIS ST_GeomFromGeoJSON."""
    feature = get_district_feature_geojson(slug)
    if feature is None:
        return None
    import json
    return json.dumps(feature["geometry"])


def _load_geo():

    if not _GEO_AVAILABLE:
        return None, None
    if _CACHE["_loaded"]:
        return _CACHE["districts"], _CACHE["infra"]
    gdf_districts = None
    gdf_infra = None
    path_districts = _DATA_DIR / "districts.geojson"
    path_infra = _DATA_DIR / "infra_points.csv"
    try:
        if path_districts.exists():
            gdf_districts = gpd.read_file(path_districts).to_crs(3857)
            logger.info("Loaded districts from %s (%s features)", path_districts, len(gdf_districts))
        else:
            logger.warning("districts.geojson not found at %s", path_districts)
        if path_infra.exists():
            df = pd.read_csv(path_infra)
            if not df.empty and "lat" in df.columns and "lon" in df.columns:
                gdf_infra = gpd.GeoDataFrame(
                    df,
                    geometry=gpd.points_from_xy(df["lon"], df["lat"]),
                    crs="EPSG:4326",
                ).to_crs(3857)
                logger.info("Loaded infra from %s (%s points)", path_infra, len(gdf_infra))
            else:
                logger.warning("infra_points.csv empty or missing lat/lon columns")
        else:
            logger.warning("infra_points.csv not found at %s", path_infra)
    except Exception as e:
        logger.exception("Failed to load geo data: %s", e)
    _CACHE["districts"] = gdf_districts
    _CACHE["infra"] = gdf_infra
    _CACHE["_loaded"] = True
    return gdf_districts, gdf_infra


def _describe_advantages(density_scaled, infra_scaled, access_scaled, competition_scaled, rent_scaled=None):

    reasons = []
    if density_scaled > 0.6:
        reasons.append("High people density")
    elif density_scaled > 0.3:
        reasons.append("Moderate people density")
    if infra_scaled > 0.6:
        reasons.append("Strong infrastructure")
    elif infra_scaled > 0.3:
        reasons.append("Moderate infrastructure")
    if access_scaled > 0.6:
        reasons.append("Good transport accessibility")
    elif access_scaled > 0.3:
        reasons.append("Moderate transport accessibility")
    if competition_scaled < 0.3:
        reasons.append("Low competition")
    elif competition_scaled < 0.6:
        reasons.append("Moderate competition")
    else:
        reasons.append("High competition area")
    if rent_scaled is not None:
        if rent_scaled < 0.3:
            reasons.append("Affordable rent")
        elif rent_scaled > 0.7:
            reasons.append("High rent — factor into ROI")
    return reasons if reasons else ["Based on activity and location"]


def get_recommendations_ml(rows, limit=10):

    if not rows:
        return []
    gdf_districts, gdf_infra = _load_geo()


    records = []
    for g, activity in rows:
        lat = (g.lat_bot_left + g.lat_top_right) / 2
        lon = (g.long_bot_left + g.long_top_right) / 2
        records.append({
            "id": g.id,
            "zid_number": g.zid_number,
            "lat": lat,
            "lon": lon,
            "avg_density": float(activity),
            "geometry": None,
        })
    df = pd.DataFrame(records)
    if not _GEO_AVAILABLE or df.empty:
        return _fallback_recommendations(rows, limit)

    gdf_feat = gpd.GeoDataFrame(
        df,
        geometry=gpd.points_from_xy(df["lon"], df["lat"]),
        crs="EPSG:4326",
    ).to_crs(3857)

    infra_types = ["university", "mall", "office", "cafe", "restaurant", "gym", "sport"]
    radius = 700

    if gdf_infra is not None and not gdf_infra.empty:
        infra_score, access_score, competition = [], [], []
        for _, row in gdf_feat.iterrows():
            pt = row.geometry
            nearby = gdf_infra[gdf_infra.distance(pt) <= radius]
            infra_score.append(len(nearby[nearby["type"].isin(infra_types)]))
            access_score.append(len(nearby[nearby["type"].isin(["bus_stop", "metro"])]))
            competition.append(len(nearby[nearby["type"] == "coworking"]))
        gdf_feat["infra_score"] = infra_score
        gdf_feat["accessibility"] = access_score
        gdf_feat["competition"] = competition
    else:
        gdf_feat["infra_score"] = 0
        gdf_feat["accessibility"] = 0
        gdf_feat["competition"] = 0

    if gdf_districts is not None and not gdf_districts.empty:
        gdf_join = gpd.sjoin(gdf_feat, gdf_districts, how="left", predicate="within")
        if "name_left" in gdf_join.columns and "name_right" in gdf_join.columns:
            gdf_join["district"] = gdf_join["name_right"]
        elif "name" in gdf_join.columns:
            gdf_join["district"] = gdf_join["name"]
        else:
            gdf_join["district"] = "—"
    else:
        gdf_join = gdf_feat.copy()
        gdf_join["district"] = "—"

   
    gdf_join["rent_m2"] = gdf_join["district"].map(_RENT_INDEX).fillna(_RENT_AVG)

    gdf_join["rent_m2_scaled"] = (gdf_join["rent_m2"] - _RENT_MIN) / (_RENT_MAX - _RENT_MIN + 1e-9)

    scaler = MinMaxScaler()
    for col in ["avg_density", "infra_score", "accessibility", "competition"]:
        vals = gdf_join[[col]].values.astype(float)
        gdf_join[col + "_scaled"] = scaler.fit_transform(vals)

    gdf_join["potential_score"] = (
        0.30 * gdf_join["avg_density_scaled"]
        + 0.23 * gdf_join["infra_score_scaled"]
        + 0.17 * gdf_join["accessibility_scaled"]
        - 0.15 * gdf_join["competition_scaled"]
        - 0.15 * gdf_join["rent_m2_scaled"]
    )
    gdf_join = gdf_join.sort_values("potential_score", ascending=False).reset_index(drop=True)

    out = []
    for i, (_, row) in enumerate(gdf_join.head(limit).iterrows()):
        if i >= limit:
            break
        ps = float(row["potential_score"])
        score = min(100, max(0, int(round(ps * 100))))
        if score >= 80:
            rating = "Excellent"
        elif score >= 60:
            rating = "Very Good"
        else:
            rating = "Good"
        reasons = _describe_advantages(
            float(row["avg_density_scaled"]),
            float(row["infra_score_scaled"]),
            float(row["accessibility_scaled"]),
            float(row["competition_scaled"]),
            float(row["rent_m2_scaled"]),
        )
        lat = float(row["lat"])
        lon = float(row["lon"])
        district = str(row["district"]) if pd.notna(row["district"]) else "—"
        out.append({
            "id": str(int(row["id"])),
            "location": f"ZID {int(row['zid_number'])}",
            "district": district,
            "score": score,
            "rating": rating,
            "reasons": reasons,
            "metrics": {
                "footfall": int(row["avg_density"]),
                "competition": int(row["competition"]),
                "rent": int(row["rent_m2"]),
                "growth": _growth_from_score(score),
            },
            "lat": lat,
            "lng": lon,
        })
    return out


def _classify_forecast(score: float) -> str:
    if score > 0.7:
        return "High Growth"
    if score > 0.4:
        return "Moderate Growth"
    return "Low Growth"


def _forecast_recommendation_text(category: str) -> str:
    if category == "High Growth":
        return "High potential - strong infrastructure and rising demand"
    if category == "Moderate Growth":
        return "Moderate potential - consider key transport areas"
    return "Low potential - low growth or high competition"


def get_forecast_districts_ml(rows):

    if not rows or not _GEO_AVAILABLE:
        return []
    gdf_districts, gdf_infra = _load_geo()
    if gdf_districts is None or gdf_districts.empty:
        return []

    records = []
    for g, activity in rows:
        lat = (g.lat_bot_left + g.lat_top_right) / 2
        lon = (g.long_bot_left + g.long_top_right) / 2
        records.append({
            "lat": lat,
            "lon": lon,
            "avg_density": float(activity),
        })
    df = pd.DataFrame(records)
    if df.empty:
        return []

    gdf_feat = gpd.GeoDataFrame(
        df,
        geometry=gpd.points_from_xy(df["lon"], df["lat"]),
        crs="EPSG:4326",
    ).to_crs(3857)

    infra_types = ["university", "mall", "office", "cafe", "restaurant", "gym", "sport"]
    radius = 700

    if gdf_infra is not None and not gdf_infra.empty:
        infra_score, competition = [], []
        for _, row in gdf_feat.iterrows():
            pt = row.geometry
            nearby = gdf_infra[gdf_infra.distance(pt) <= radius]
            infra_score.append(len(nearby[nearby["type"].isin(infra_types)]))
            competition.append(len(nearby[nearby["type"] == "coworking"]))
        gdf_feat["infra_score"] = infra_score
        gdf_feat["competition"] = competition
    else:
        gdf_feat["infra_score"] = 0
        gdf_feat["competition"] = 0

    gdf_join = gpd.sjoin(gdf_feat, gdf_districts, how="left", predicate="within")
    if "name_left" in gdf_join.columns and "name_right" in gdf_join.columns:
        gdf_join["district"] = gdf_join["name_right"]
    elif "name" in gdf_join.columns:
        gdf_join["district"] = gdf_join["name"]
    else:
        gdf_join["district"] = None

    gdf_join = gdf_join[gdf_join["district"].notna()]
    gdf_join = gdf_join[gdf_join["district"].astype(str).str.strip() != ""]
    if gdf_join.empty:
        return []

    np.random.seed(42)
    gdf_join["growth_trend"] = (
        gdf_join["avg_density"].rank(pct=True)
        + np.random.uniform(-0.15, 0.15, len(gdf_join))
    ).clip(0, 1)

    agg = gdf_join.groupby("district", as_index=False).agg({
        "growth_trend": "mean",
        "infra_score": "mean",
        "competition": "mean",
    })

    scaler = MinMaxScaler()
    for col in ["growth_trend", "infra_score", "competition"]:
        agg[col + "_scaled"] = scaler.fit_transform(agg[[col]]).ravel()

    agg["forecast_score"] = (
        0.5 * agg["growth_trend_scaled"]
        + 0.3 * agg["infra_score_scaled"]
        - 0.2 * agg["competition_scaled"]
    )
    agg["category"] = agg["forecast_score"].apply(_classify_forecast)
    agg["recommendation"] = agg["category"].apply(_forecast_recommendation_text)

    agg = agg.sort_values("forecast_score", ascending=False)
    out = []
    for _, row in agg.iterrows():
        out.append({
            "district": str(row["district"]),
            "growth_trend": round(float(row["growth_trend_scaled"]), 3),
            "infra_strength": round(float(row["infra_score_scaled"]), 3),
            "competition": round(float(row["competition_scaled"]), 3),
            "forecast_score": round(float(row["forecast_score"]), 3),
            "category": row["category"],
            "recommendation": row["recommendation"],
        })
    return out


def _fallback_recommendations(rows, limit):

    sorted_rows = sorted(rows, key=lambda x: float(x[1]), reverse=True)[:limit]
    if not sorted_rows:
        return []
    max_act = max(float(r[1]) for r in sorted_rows) or 1
    out = []
    for g, activity in sorted_rows:
        act = int(activity)
        score = min(100, int(round(100 * act / max_act)))
        if score >= 80:
            rating = "Excellent"
        elif score >= 60:
            rating = "Very Good"
        else:
            rating = "Good"
        lat = (g.lat_bot_left + g.lat_top_right) / 2
        lng = (g.long_bot_left + g.long_top_right) / 2
        out.append({
            "id": str(g.id),
            "location": f"ZID {g.zid_number}",
            "district": "—",
            "score": score,
            "rating": rating,
            "reasons": ["High activity in this cell", "Top zone by user count"],
            "metrics": {
                "footfall": act,
                "competition": 0,
                "rent": 0,
                "growth": _growth_from_score(score),
            },
            "lat": lat,
            "lng": lng,
        })
    return out


def describe_point_ml(lat: float, lon: float, radius_m: int, rows):

    gdf_districts, gdf_infra = _load_geo()
    result = {
        "location": {"lat": lat, "lon": lon},
        "district": "Outside city",
        "radius_m": radius_m,
        "density": 0,
        "competition": 0,
        "infra_summary": {},
        "infra_examples": {},
        "status": "ok",
    }
    if not _GEO_AVAILABLE:
        return result

    pt_4326 = Point(lon, lat)
    pt = gpd.GeoSeries([pt_4326], crs="EPSG:4326").to_crs(3857).iloc[0]

    if gdf_districts is not None and not gdf_districts.empty:
        gdf_pt = gpd.GeoDataFrame(geometry=[pt], crs=3857)
        district_join = gpd.sjoin(gdf_pt, gdf_districts, how="left", predicate="within")
        if not district_join.empty:
            for name_col in ("name", "name_right", "NAME", "district"):
                if name_col in district_join.columns and pd.notna(district_join.iloc[0].get(name_col)):
                    result["district"] = str(district_join.iloc[0][name_col])
                    break

    if rows:
        records = []
        for g, activity in rows:
            lat_c = (g.lat_bot_left + g.lat_top_right) / 2
            lon_c = (g.long_bot_left + g.long_top_right) / 2
            records.append({"id": g.id, "lat": lat_c, "lon": lon_c, "avg_density": float(activity)})
        df = pd.DataFrame(records)
        gdf_feat = gpd.GeoDataFrame(
            df,
            geometry=gpd.points_from_xy(df["lon"], df["lat"]),
            crs="EPSG:4326",
        ).to_crs(3857)
        gdf_feat["distance"] = gdf_feat.geometry.distance(pt)
        min_dist = gdf_feat["distance"].min()
        if min_dist <= 2000:
            nearest = gdf_feat.loc[gdf_feat["distance"].idxmin()]
            result["density"] = round(float(nearest["avg_density"]), 2)

    if gdf_infra is not None and not gdf_infra.empty:
        nearby = gdf_infra[gdf_infra.geometry.distance(pt) <= radius_m]
        result["infra_summary"] = nearby["type"].value_counts().astype(int).to_dict()
        result["competition"] = int(nearby[nearby["type"] == "coworking"].shape[0])
        examples = {}
        for t in ["university", "mall", "cafe", "restaurant", "gym", "metro", "bus_stop"]:
            objs = nearby[nearby["type"] == t]
            if not objs.empty:
                geoms = objs.geometry.to_crs(4326)
                examples[t] = [
                    {"lat": round(geom.y, 6), "lon": round(geom.x, 6)}
                    for geom in geoms.head(3)
                ]
        result["infra_examples"] = examples

    if result["district"] == "Outside city":
        result["status"] = "out_of_city"
    return result
