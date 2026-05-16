import asyncio
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import async_session_maker
from app.services import ml_analysis_service
from app.schemas.telecom_schema import (
    TelecomGridCreate, TelecomGridRead, GridWithActivity,
    TelecomStatCreate, TelecomStatRead,
)
from app.services.telecom_service import (
    create_grid, get_grids, get_grids_with_activity,
    create_stat, get_stats_by_grid,
)
from fastapi import File, UploadFile
import tempfile
from app.services.telecom_service import import_telecom_data

router = APIRouter(prefix="/telecom", tags=["Telecom"])


# ---------- GRIDS ----------
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
    """Сетки с агрегированной активностью (сумма user_count). Опционально день/час и район (GeoJSON)."""
    async with async_session_maker() as session:
        rows = await get_grids_with_activity(session, week_day=week_day, time_hour_from=time_hour_from, time_hour_to=time_hour_to)
        if district and district.lower() not in ("all", ""):
            loop = asyncio.get_event_loop()
            rows = await loop.run_in_executor(
                None, lambda: ml_analysis_service.filter_grids_by_district(rows, district)
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


# ---------- STATS ----------
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



@router.post("/upload")
async def upload_telecom_file(
    file: UploadFile = File(...),
    month_label: str = Query(..., description="например '03.2023'")
):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    async with async_session_maker() as session:
        result = await import_telecom_data(session, tmp_path, month_label)
        return result