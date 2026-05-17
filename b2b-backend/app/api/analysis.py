import asyncio
from fastapi import APIRouter, Query
from app.database import async_session_maker
from app.schemas.analysis_schema import (
    CompareItem,
    RecommendationItem,
    ForecastPoint,
    ForecastResponse,
    ForecastDistrictItem,
    DescribePointResponse,
    ClusterZonesRequest,
)
from app.services.telecom_service import get_grids_with_activity, get_activity_by_month
from app.services import ml_analysis_service
from app.services import ml_client

router = APIRouter(prefix="/analysis", tags=["Analysis"])

_RENT_INDEX: dict[str, float] = {
    "Almaly": 9000, "Auezov": 7500, "Bostandyq": 12100, "Medeu": 12000,
    "Turksib": 5000, "Zhetysu": 6667, "Alatau": 6000, "Nauryzbay": 4615,
}
_RENT_AVG = sum(_RENT_INDEX.values()) / len(_RENT_INDEX)


@router.get("/compare", response_model=list[CompareItem])
async def get_compare(
    week_day: int | None = Query(None, ge=0, le=6),
    time_hour_from: int | None = Query(None, ge=0, le=23),
    time_hour_to: int | None = Query(None, ge=0, le=23),
    limit: int = Query(10, ge=1, le=50),
):
    async with async_session_maker() as session:
        rows = await get_grids_with_activity(
            session, week_day=week_day, time_hour_from=time_hour_from, time_hour_to=time_hour_to
        )
        if not rows:
            return []

        all_zone_features = [
            {
                "id": g.id,
                "lat": (g.lat_bot_left + g.lat_top_right) / 2,
                "lon": (g.long_bot_left + g.long_top_right) / 2,
                "density": float(activity),
                "infra_score": 0.0,
                "competition": 0.0,
                "rent_m2": _RENT_AVG,
            }
            for g, activity in rows
        ]
        cluster_results = await ml_client.predict_clusters(all_zone_features)
        cluster_map: dict[int, dict] = {c["id"]: c for c in cluster_results}

        loop = asyncio.get_event_loop()
        recs = await loop.run_in_executor(
            None, lambda: ml_analysis_service.get_recommendations_ml(rows, limit * 2)
        )
        if not recs:
            return []

        items = []
        for r in recs:
            zone_id = int(r["id"])
            dist = str(r.get("district") or "").strip()
            zid = str(r.get("location", "")).replace("ZID", "").strip()
            cw = int(r["metrics"].get("competition") or 0)
            rent = int(r["metrics"].get("rent") or 0)
            cluster_info = cluster_map.get(zone_id, {})
            items.append(CompareItem(
                location=f"{dist} · cell {zid}" if dist and dist != "—" else f"Cell {zid}",
                district=dist if dist != "—" else "",
                zone_id=zid,
                footfall=int(r["metrics"].get("footfall") or 0),
                coworkings=cw,
                avgRent=rent,
                competition=min(10, cw),
                cluster_label=cluster_info.get("cluster_label", ""),
                ml_score=cluster_info.get("score", 0),
            ))

        items.sort(key=lambda x: (x.ml_score, x.footfall), reverse=True)
        return items[:limit]


@router.get("/recommendations", response_model=list[RecommendationItem])
async def get_recommendations(
    week_day: int | None = Query(None, ge=0, le=6),
    time_hour_from: int | None = Query(None, ge=0, le=23),
    time_hour_to: int | None = Query(None, ge=0, le=23),
    limit: int = Query(10, ge=1, le=50),
):
    async with async_session_maker() as session:
        rows = await get_grids_with_activity(
            session, week_day=week_day, time_hour_from=time_hour_from, time_hour_to=time_hour_to
        )
        if not rows:
            return []

        all_zone_features = [
            {
                "id": g.id,
                "lat": (g.lat_bot_left + g.lat_top_right) / 2,
                "lon": (g.long_bot_left + g.long_top_right) / 2,
                "density": float(activity),
                "infra_score": 0.0,
                "competition": 0.0,
                "rent_m2": _RENT_AVG,
            }
            for g, activity in rows
        ]
        cluster_results = await ml_client.predict_clusters(all_zone_features)
        cluster_map: dict[int, dict] = {c["id"]: c for c in cluster_results}

        loop = asyncio.get_event_loop()
        geo_recs = await loop.run_in_executor(
            None, lambda: ml_analysis_service.get_recommendations_ml(rows, limit * 2)
        )
        if not geo_recs:
            return []

        out = []
        for r in geo_recs:
            zone_id = int(r["id"])
            cluster_info = cluster_map.get(zone_id)
            if cluster_info:
                score = cluster_info["score"]
                rating = cluster_info["cluster_label"]
            else:
                score = int(r["score"])
                rating = str(r["rating"])

            out.append(RecommendationItem(
                id=r["id"],
                location=r["location"],
                district=r["district"],
                score=score,
                rating=rating,
                reasons=r["reasons"],
                metrics=r["metrics"],
                lat=r["lat"],
                lng=r["lng"],
            ))

        out.sort(key=lambda x: x.score, reverse=True)
        return out[:limit]


@router.get("/forecast", response_model=ForecastResponse)
async def get_forecast():
    async with async_session_maker() as session:
        by_month = await get_activity_by_month(session)
        rows = await get_grids_with_activity(session)

    monthly_totals = [
        {"month": m or "", "total": float(t)}
        for m, t in by_month
        if m
    ]

    series: list[ForecastPoint] = []
    if monthly_totals:
        for item in monthly_totals:
            a = int(item["total"])
            series.append(ForecastPoint(
                month=item["month"], actual=a, predicted=a,
                lower=int(a * 0.95), upper=int(a * 1.05),
            ))

        ml_result = await ml_client.predict_forecast(monthly_totals)
        if ml_result:
            series.append(ForecastPoint(
                month=ml_result["predicted_month"],
                actual=None,
                predicted=ml_result["predicted_total"],
                lower=ml_result["lower"],
                upper=ml_result["upper"],
            ))
        else:
            last = int(monthly_totals[-1]["total"])
            series.append(ForecastPoint(
                month="next", actual=None,
                predicted=int(last * 1.05),
                lower=int(last * 0.95), upper=int(last * 1.1),
            ))

    districts: list[ForecastDistrictItem] = []
    if rows:
        loop = asyncio.get_event_loop()
        raw = await loop.run_in_executor(
            None, lambda: ml_analysis_service.get_forecast_districts_ml(rows)
        )
        districts = [ForecastDistrictItem(**d) for d in raw]

    return ForecastResponse(series=series, districts=districts)


@router.get("/describe_point", response_model=DescribePointResponse)
async def get_describe_point(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_m: int = Query(500, ge=25, le=2000),
):
    async with async_session_maker() as session:
        rows = await get_grids_with_activity(session)
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, lambda: ml_analysis_service.describe_point_ml(lat, lon, radius_m, rows)
        )
        return DescribePointResponse(**result)


@router.post("/cluster_zones")
async def cluster_zones_endpoint(req: ClusterZonesRequest):
    zone_features = [
        {
            "id": z.id,
            "lat": z.lat,
            "lon": z.lon,
            "density": z.density,
            "infra_score": 0.0,
            "competition": z.competition,
            "rent_m2": float(_RENT_INDEX.get(z.district, _RENT_AVG)),
        }
        for z in req.zones
    ]
    return await ml_client.predict_clusters(zone_features)


@router.get("/hotspots")
async def get_hotspots():
    async with async_session_maker() as session:
        rows = await get_grids_with_activity(session)

    if not rows:
        return {"hotspots": []}

    zones = [
        {
            "id": g.id,
            "lat": (g.lat_bot_left + g.lat_top_right) / 2,
            "lon": (g.long_bot_left + g.long_top_right) / 2,
            "density": float(activity),
            "infra_score": 0.0,
            "competition": 0.0,
            "rent_m2": 9000.0,
        }
        for g, activity in rows
        if activity > 0
    ]

    hotspots = await ml_client.predict_hotspots(zones)
    return {"hotspots": hotspots}