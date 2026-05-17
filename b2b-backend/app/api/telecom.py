import asyncio
import logging
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import async_session_maker
from app.services import ml_analysis_service
from app.services import ml_client

logger = logging.getLogger(__name__)
from app.schemas.telecom_schema import (
    TelecomGridCreate, TelecomGridRead, GridWithActivity,
    TelecomStatCreate, TelecomStatRead,
)
from app.services.telecom_service import (
    create_grid, get_grids, get_grids_with_activity, get_grids_with_activity_in_district,
    create_stat, get_stats_by_grid,
)
from fastapi import File, UploadFile
import tempfile
from app.services.telecom_service import import_telecom_data

router = APIRouter(prefix="/telecom", tags=["Telecom"])



@router.post("/grids", response_model=TelecomGridRead)
async def add_grid(data: TelecomGridCreate):
    async with async_session_maker() as session:
        grid = await create_grid(session, data)
        return grid


@router.get("/grids", response_model=list[TelecomGridRead])
async def list_grids():
    async with async_session_maker() as session:
        grids = await get_grids(session)
        return grids


@router.get("/grids/with_activity", response_model=list[GridWithActivity])
async def list_grids_with_activity(
    week_day: int | None = Query(None, ge=0, le=6, description="0=Mon ... 6=Sun"),
    time_hour_from: int | None = Query(None, ge=0, le=23),
    time_hour_to: int | None = Query(None, ge=0, le=23),
    district: str | None = Query(
        None,
        description="Фильтр по району: almaly, bostandyk, medeu, … или all",
    ),
):
    use_district = district and district.lower() not in ("all", "")

    async with async_session_maker() as session:
        if use_district:
            geojson = ml_analysis_service.get_district_geometry_geojson_str(district)
            if not geojson:
                return []
            rows = await get_grids_with_activity_in_district(
                session, geojson,
                week_day=week_day, time_hour_from=time_hour_from, time_hour_to=time_hour_to,
            )
            return [
                GridWithActivity(
                    id=r["id"],
                    zid_number=r["zid_number"],
                    lat_bot_left=r["lat_bot_left"],
                    long_bot_left=r["long_bot_left"],
                    lat_bot_right=r["lat_bot_right"],
                    long_bot_right=r["long_bot_right"],
                    lat_top_right=r["lat_top_right"],
                    long_top_right=r["long_top_right"],
                    activity=float(r["activity"]),
                )
                for r in rows
            ]

        rows = await get_grids_with_activity(
            session, week_day=week_day, time_hour_from=time_hour_from, time_hour_to=time_hour_to,
        )
        return [
            GridWithActivity(
                id=g.id,
                zid_number=g.zid_number,
                lat_bot_left=g.lat_bot_left,
                long_bot_left=g.long_bot_left,
                lat_bot_right=g.lat_bot_right,
                long_bot_right=g.long_bot_right,
                lat_top_right=g.lat_top_right,
                long_top_right=g.long_top_right,
                activity=float(activity),
            )
            for g, activity in rows
        ]


@router.post("/stats", response_model=TelecomStatRead)
async def add_stat(data: TelecomStatCreate):
    async with async_session_maker() as session:
        stat = await create_stat(session, data)
        return stat


@router.get("/stats", response_model=list[TelecomStatRead])
async def list_stats(grid_id: int):
    """Получить все статистики по конкретной ячейке (grid_id)."""
    async with async_session_maker() as session:
        stats = await get_stats_by_grid(session, grid_id)
        return stats



async def _trigger_ml_training() -> None:
    """Background task: collect zone + monthly data from DB, send to ML service for training."""
    try:
        from app.services.telecom_service import get_grids_with_activity, get_activity_by_month
        async with async_session_maker() as session:
            rows = await get_grids_with_activity(session)
            by_month = await get_activity_by_month(session)

        if not rows:
            logger.warning("ML training skipped: no zone data in DB")
            return

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
        ]
        monthly_totals = [
            {"month": m, "total": float(t)}
            for m, t in by_month
            if m
        ]

        result = await ml_client.train(zones, monthly_totals)
        logger.info("ML training result: %s", result)
    except Exception as exc:
        logger.exception("ML training background task failed: %s", exc)


@router.post("/upload")
async def upload_telecom_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    month_label: str = Query(..., description="например '03.2023'"),
):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    async with async_session_maker() as session:
        result = await import_telecom_data(session, tmp_path, month_label)

    background_tasks.add_task(_trigger_ml_training)
    return result