"""Async HTTP client for the ML service."""
import logging
import httpx
from app.config import settings

logger = logging.getLogger(__name__)
_TIMEOUT = 30.0


def _base() -> str:
    return settings.ML_SERVICE_URL.rstrip("/")


async def train(zones: list[dict], monthly_totals: list[dict]) -> dict:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{_base()}/train",
                json={"zones": zones, "monthly_totals": monthly_totals},
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.warning("ML /train failed: %s", exc)
        return {"status": "error", "message": str(exc)}


async def predict_forecast(monthly_totals: list[dict]) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{_base()}/predict/forecast",
                json={"monthly_totals": monthly_totals},
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.warning("ML /predict/forecast failed: %s", exc)
        return None


async def predict_clusters(zones: list[dict]) -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{_base()}/predict/clusters",
                json={"zones": zones},
            )
            resp.raise_for_status()
            return resp.json().get("clusters", [])
    except Exception as exc:
        logger.warning("ML /predict/clusters failed: %s", exc)
        return []


async def predict_hotspots(zones: list[dict]) -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{_base()}/predict/hotspots",
                json={"zones": zones},
            )
            resp.raise_for_status()
            return resp.json().get("hotspots", [])
    except Exception as exc:
        logger.warning("ML /predict/hotspots failed: %s", exc)
        return []


async def health() -> bool:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{_base()}/health")
            return resp.status_code == 200
    except Exception:
        return False