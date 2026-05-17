import logging
import os
import numpy as np
import joblib
from pathlib import Path
from sklearn.linear_model import LinearRegression
from sklearn.cluster import KMeans, DBSCAN
from sklearn.preprocessing import StandardScaler

logger = logging.getLogger(__name__)

MODELS_DIR = Path(os.getenv("MODELS_DIR", "/app/models_store"))
MODELS_DIR.mkdir(parents=True, exist_ok=True)

_PATHS = {
    "kmeans":        MODELS_DIR / "kmeans.pkl",
    "lr":            MODELS_DIR / "linear_regression.pkl",
    "scaler_kmeans": MODELS_DIR / "scaler_kmeans.pkl",
    "scaler_lr":     MODELS_DIR / "scaler_lr.pkl",
    "cluster_order": MODELS_DIR / "cluster_order.pkl",
}

_state: dict = {k: None for k in _PATHS}
_state["trained"] = False

_CLUSTER_LABELS = ["High Potential", "Good Potential", "Moderate Potential", "Low Potential"]
_CLUSTER_SCORE_RANGES = [(80, 100), (60, 79), (40, 59), (20, 39)]

KMEANS_FEATURES = ["density", "infra_score", "competition", "rent_m2"]


def load_models() -> bool:
    if all(p.exists() for p in _PATHS.values()):
        for key, path in _PATHS.items():
            _state[key] = joblib.load(path)
        _state["trained"] = True
        logger.info("All models loaded from disk")
        return True
    logger.info("Pre-trained models not found — waiting for /train call")
    return False


def train(zones: list[dict], monthly_totals: list[dict]) -> dict:
    if not zones:
        return {"status": "error", "message": "No zone data provided"}

    import pandas as pd
    df = pd.DataFrame(zones)

    for col in KMEANS_FEATURES:
        if col not in df.columns:
            df[col] = 0.0

    X_km = df[KMEANS_FEATURES].fillna(0).values.astype(float)
    scaler_km = StandardScaler()
    X_km_s = scaler_km.fit_transform(X_km)

    n_clusters = min(4, len(df))
    km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    km.fit(X_km_s)

    centers_density = km.cluster_centers_[:, 0]
    cluster_order = np.argsort(-centers_density).tolist()

    joblib.dump(km, _PATHS["kmeans"])
    joblib.dump(scaler_km, _PATHS["scaler_kmeans"])
    joblib.dump(cluster_order, _PATHS["cluster_order"])
    _state["kmeans"] = km
    _state["scaler_kmeans"] = scaler_km
    _state["cluster_order"] = cluster_order

    lr_result = {"samples": 0}
    if len(monthly_totals) >= 2:
        sorted_months = sorted(monthly_totals, key=lambda m: m["month"])
        X_lr = np.array([[i + 1] for i in range(len(sorted_months))], dtype=float)
        y_lr = np.array([m["total"] for m in sorted_months], dtype=float)

        scaler_lr = StandardScaler()
        X_lr_s = scaler_lr.fit_transform(X_lr)

        lr = LinearRegression()
        lr.fit(X_lr_s, y_lr)

        joblib.dump(lr, _PATHS["lr"])
        joblib.dump(scaler_lr, _PATHS["scaler_lr"])
        _state["lr"] = lr
        _state["scaler_lr"] = scaler_lr
        lr_result = {"samples": len(sorted_months), "coef": float(lr.coef_[0]), "intercept": float(lr.intercept_)}

    _state["trained"] = True
    logger.info("Training complete: KMeans(k=%d), LinearRegression", n_clusters)
    return {
        "status": "ok",
        "kmeans": {"n_clusters": n_clusters},
        "linear_regression": lr_result,
        "zones_used": len(df),
    }


def predict_clusters(zones: list[dict]) -> list[dict]:
    if not _state["trained"] or _state["kmeans"] is None:
        return []

    import pandas as pd
    df = pd.DataFrame(zones)
    for col in KMEANS_FEATURES:
        if col not in df.columns:
            df[col] = 0.0

    X = df[KMEANS_FEATURES].fillna(0).values.astype(float)
    X_s = _state["scaler_kmeans"].transform(X)
    raw_labels = _state["kmeans"].predict(X_s)

    order = _state["cluster_order"]
    raw_to_rank = {raw: rank for rank, raw in enumerate(order)}
    densities = df["density"].fillna(0).values.astype(float)

    raw_results = []
    for i, (zone, raw_label) in enumerate(zip(zones, raw_labels)):
        rank = raw_to_rank.get(int(raw_label), int(raw_label))
        rank = min(rank, len(_CLUSTER_LABELS) - 1)
        raw_results.append({"id": zone["id"], "cluster": rank, "density": densities[i]})

    for rank_idx in range(len(_CLUSTER_LABELS)):
        group = [r for r in raw_results if r["cluster"] == rank_idx]
        if not group:
            continue
        lo, hi = _CLUSTER_SCORE_RANGES[rank_idx]
        d_vals = [r["density"] for r in group]
        d_min, d_max = min(d_vals), max(d_vals)
        d_range = d_max - d_min
        for r in raw_results:
            if r["cluster"] != rank_idx:
                continue
            pct = (r["density"] - d_min) / d_range if d_range > 0 else 1.0
            r["score"] = int(lo + pct * (hi - lo))

    return [
        {
            "id": r["id"],
            "cluster": r["cluster"],
            "cluster_label": _CLUSTER_LABELS[r["cluster"]],
            "score": r["score"],
        }
        for r in raw_results
    ]


def predict_forecast(monthly_totals: list[dict]) -> dict:
    sorted_months = sorted(monthly_totals, key=lambda m: m["month"])
    totals = [m["total"] for m in sorted_months]
    n = len(totals)

    X = np.array([[i + 1] for i in range(n)], dtype=float)
    y = np.array(totals, dtype=float)

    if _state["trained"] and _state["lr"] is not None and _state["scaler_lr"] is not None:
        X_s = _state["scaler_lr"].transform(X)
        lr = _state["lr"]
    else:
        scaler = StandardScaler()
        X_s = scaler.fit_transform(X)
        lr = LinearRegression()
        lr.fit(X_s, y)

    next_X = (
        _state["scaler_lr"].transform([[n + 1]])
        if (_state["lr"] is not None and _state["scaler_lr"] is not None)
        else StandardScaler().fit(X).transform([[n + 1]])
    )
    predicted = max(0.0, float(lr.predict(next_X)[0]))

    residuals = y - lr.predict(X_s)
    std = float(np.std(residuals)) if n > 1 else predicted * 0.05

    try:
        last = sorted_months[-1]["month"]
        mm, yyyy = last.split(".")
        nm = int(mm) + 1
        ny = int(yyyy)
        if nm > 12:
            nm, ny = 1, ny + 1
        next_month = f"{nm:02d}.{ny}"
    except Exception:
        next_month = "next"

    growth = (predicted - totals[-1]) / totals[-1] * 100 if totals[-1] > 0 else 0.0
    return {
        "predicted_month": next_month,
        "predicted_total": int(predicted),
        "lower": int(max(0, predicted - 1.96 * std)),
        "upper": int(predicted + 1.96 * std),
        "growth_pct": round(growth, 1),
        "model": "LinearRegression",
    }


def predict_hotspots(zones: list[dict]) -> list[dict]:
    if not zones:
        return []

    coords = np.array([[z["lat"], z["lon"]] for z in zones], dtype=float)
    scaler = StandardScaler()
    coords_s = scaler.fit_transform(coords)

    labels = DBSCAN(eps=0.3, min_samples=3).fit_predict(coords_s)

    clusters: dict[int, dict] = {}
    for zone, label in zip(zones, labels):
        if label == -1:
            continue
        if label not in clusters:
            clusters[label] = {"zone_ids": [], "lats": [], "lons": []}
        clusters[label]["zone_ids"].append(zone["id"])
        clusters[label]["lats"].append(zone["lat"])
        clusters[label]["lons"].append(zone["lon"])

    return [
        {
            "cluster_id": int(cid),
            "zone_ids": data["zone_ids"],
            "center_lat": float(np.mean(data["lats"])),
            "center_lon": float(np.mean(data["lons"])),
            "size": len(data["zone_ids"]),
        }
        for cid, data in sorted(clusters.items(), key=lambda x: -len(x[1]["zone_ids"]))
    ]


def is_trained() -> bool:
    return bool(_state["trained"])
