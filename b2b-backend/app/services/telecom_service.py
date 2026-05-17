from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, text
from app.models.telecom import TelecomGrid, TelecomStat
from app.schemas.telecom_schema import TelecomGridCreate, TelecomStatCreate
from geoalchemy2 import WKTElement
import pandas as pd


async def create_grid(session: AsyncSession, data: TelecomGridCreate) -> TelecomGrid:
    grid = TelecomGrid(**data.dict())
    session.add(grid)
    await session.commit()
    await session.refresh(grid)
    return grid


async def get_grids(session: AsyncSession):
    result = await session.execute(select(TelecomGrid))
    return result.scalars().all()


async def get_grids_with_activity(
    session: AsyncSession,
    week_day: int | None = None,
    time_hour_from: int | None = None,
    time_hour_to: int | None = None,
):
  
    join_conds = [TelecomGrid.id == TelecomStat.grid_id]
    if week_day is not None:
        join_conds.append(TelecomStat.week_day == week_day)
    if time_hour_from is not None:
        join_conds.append(TelecomStat.time_hour >= time_hour_from)
    if time_hour_to is not None:
        join_conds.append(TelecomStat.time_hour <= time_hour_to)

    q = (
        select(
            TelecomGrid,
            func.coalesce(func.sum(TelecomStat.user_count), 0).label("activity"),
        )
        .outerjoin(TelecomStat, and_(*join_conds))
        .group_by(TelecomGrid.id)
    )
    result = await session.execute(q)
    return result.all()



async def create_stat(session: AsyncSession, data: TelecomStatCreate) -> TelecomStat:
    stat = TelecomStat(**data.dict())
    session.add(stat)
    await session.commit()
    await session.refresh(stat)
    return stat


async def get_stats_by_grid(session: AsyncSession, grid_id: int):
    result = await session.execute(
        select(TelecomStat).where(TelecomStat.grid_id == grid_id)
    )
    return result.scalars().all()


async def get_grids_with_activity_in_district(
    session: AsyncSession,
    district_geojson: str,
    week_day: int | None = None,
    time_hour_from: int | None = None,
    time_hour_to: int | None = None,
):
    """Spatial filter via PostGIS ST_Within — returns only grids inside the district polygon."""
    filters = ""
    params: dict = {"geojson": district_geojson}
    if week_day is not None:
        filters += " AND ts.week_day = :week_day"
        params["week_day"] = week_day
    if time_hour_from is not None:
        filters += " AND ts.time_hour >= :time_hour_from"
        params["time_hour_from"] = time_hour_from
    if time_hour_to is not None:
        filters += " AND ts.time_hour <= :time_hour_to"
        params["time_hour_to"] = time_hour_to

    q = text(f"""
        SELECT tg.id, tg.zid_number,
               tg.lat_bot_left, tg.long_bot_left,
               tg.lat_bot_right, tg.long_bot_right,
               tg.lat_top_right, tg.long_top_right,
               COALESCE(SUM(ts.user_count), 0) AS activity
        FROM telecom_grids tg
        LEFT JOIN telecom_stats ts ON ts.grid_id = tg.id {filters}
        WHERE tg.geom IS NOT NULL
          AND ST_Within(tg.geom, ST_GeomFromGeoJSON(:geojson))
        GROUP BY tg.id
        ORDER BY activity DESC
    """)
    result = await session.execute(q, params)
    return result.mappings().all()


async def get_activity_by_month(session: AsyncSession):
    q = (
        select(TelecomStat.month_label, func.sum(TelecomStat.user_count).label("total"))
        .where(TelecomStat.month_label.isnot(None))
        .group_by(TelecomStat.month_label)
        .order_by(TelecomStat.month_label)
    )
    result = await session.execute(q)
    return result.all()





async def import_telecom_data(session: AsyncSession, file_path: str, month_label: str):
    import pandas as pd
    from sqlalchemy import select
    from app.models.telecom import TelecomGrid, TelecomStat

    df = pd.read_excel(file_path)
    df = df.replace(",", ".", regex=True)

    for _, row in df.iterrows():
        zid = int(row["ZID_NUMBER"])
        result = await session.execute(select(TelecomGrid).where(TelecomGrid.zid_number == zid))
        grid = result.scalar_one_or_none()

        if not grid:
            lat_bl = float(row["LAT_BOT_LEFT"])
            long_bl = float(row["LONG_BOT_LEFT"])
            lat_tr = float(row["LAT_TOP_RIGHT"])
            long_tr = float(row["LONG_TOP_RIGHT"])
            wkt = (
                f"POLYGON(({long_bl} {lat_bl}, {long_tr} {lat_bl}, "
                f"{long_tr} {lat_tr}, {long_bl} {lat_tr}, {long_bl} {lat_bl}))"
            )
            grid = TelecomGrid(
                zid_number=zid,
                lat_bot_left=lat_bl,
                long_bot_left=long_bl,
                lat_bot_right=float(row["LAT_BOT_RIGHT"]),
                long_bot_right=float(row["LONG_BOT_RIGHT"]),
                lat_top_right=lat_tr,
                long_top_right=long_tr,
                geom=WKTElement(wkt, srid=4326),
            )
            session.add(grid)
            await session.flush()

        time_str = str(row["TIME_HOUR"]).split(":")[0]
        time_hour = int(time_str)

        stat = TelecomStat(
            grid_id=grid.id,
            week_day=int(row["WEEK_DAY_IND"]),
            time_hour=time_hour,
            user_count=float(row["NUM_OF_UNIQ_USERS"]),
            month_label=month_label,   # <— вот здесь сохраняем месяц
        )
        session.add(stat)

    await session.commit()
    return {"message": f"Импорт завершён: {len(df)} записей", "month": month_label}
