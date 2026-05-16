"""Границы районов (GeoJSON) для карты."""
import asyncio
from fastapi import APIRouter, HTTPException

from app.services import ml_analysis_service

router = APIRouter(prefix="/geo", tags=["Geo"])


@router.get("/districts/{slug}")
async def district_boundary(slug: str):

    loop = asyncio.get_event_loop()
    feat = await loop.run_in_executor(None, lambda: ml_analysis_service.get_district_feature_geojson(slug))
    if not feat:
        raise HTTPException(
            404,
            detail="District not found or data/districts.geojson is missing on the server",
        )
    return feat
