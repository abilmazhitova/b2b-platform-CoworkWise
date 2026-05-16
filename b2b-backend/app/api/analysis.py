
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
)
from app.services.telecom_service import get_grids_with_activity, get_activity_by_month
from app.services import ml_analysis_service

router = APIRouter(prefix="/analysis", tags=["Analysis"])


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
        loop = asyncio.get_event_loop()
        recs = await loop.run_in_executor(
            None, lambda: ml_analysis_service.get_recommendations_ml(rows, limit)
        )
        items = []
        for r in recs:
            dist = str(r.get("district") or "").strip()
            zid = str(r.get("location", "")).replace("ZID", "").strip()
            cw = int(r["metrics"].get("competition") or 0)
            rent = int(r["metrics"].get("rent") or 0)
            items.append(
                CompareItem(
                    location=f"{dist} · cell {zid}" if dist and dist != "—" else f"Cell {zid}",
                    district=dist if dist != "—" else "",
                    zone_id=zid,
                    footfall=int(r["metrics"].get("footfall") or 0),
                    coworkings=cw,
                    avgRent=rent,
                    competition=min(10, cw),
                )
            )
        return items


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
        loop = asyncio.get_event_loop()
        out = await loop.run_in_executor(
            None, lambda: ml_analysis_service.get_recommendations_ml(rows, limit)
        )
        return [RecommendationItem(**item) for item in out]


@router.get("/forecast", response_model=ForecastResponse)
async def get_forecast():
   
    async with async_session_maker() as session:
        by_month = await get_activity_by_month(session)
        rows = await get_grids_with_activity(session)
    series: list[ForecastPoint] = []
    if by_month:
        months = [m for m, _ in by_month]
        actuals = [int(t) for _, t in by_month]
        n = len(actuals)
        last = actuals[-1] if actuals else 0
        pred_next = int(last * 1.05) if n else 0
        for m, a in zip(months, actuals):
            series.append(
                ForecastPoint(month=m or "", actual=a, predicted=a, lower=int(a * 0.95), upper=int(a * 1.05))
            )
        series.append(
            ForecastPoint(
                month="next",
                actual=None,
                predicted=pred_next,
                lower=int(pred_next * 0.9),
                upper=int(pred_next * 1.1),
            )
        )
    districts: list[ForecastDistrictItem] = []
    if rows:
        loop = asyncio.get_event_loop()
        raw = await loop.run_in_executor(None, lambda: ml_analysis_service.get_forecast_districts_ml(rows))
        districts = [ForecastDistrictItem(**d) for d in raw]
    return ForecastResponse(series=series, districts=districts)


@router.get("/describe_point", response_model=DescribePointResponse)
async def get_describe_point(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_m: int = Query(500, ge=25, le=2000),
):
    """Аналитика по точке: район, плотность по ближайшей сетке, инфра и конкуренция в радиусе."""
    async with async_session_maker() as session:
        rows = await get_grids_with_activity(session)
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, lambda: ml_analysis_service.describe_point_ml(lat, lon, radius_m, rows)
        )
        return DescribePointResponse(**result)
