import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.schemas import TrainRequest, ForecastRequest, ClusterRequest, HotspotRequest
from app import ml_service

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="CoworkWise ML Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    ml_service.load_models()


@app.get("/health")
def health():
    return {"status": "ok", "trained": ml_service.is_trained()}


@app.post("/train")
def train(req: TrainRequest):
    zones = [z.model_dump() for z in req.zones]
    totals = [m.model_dump() for m in req.monthly_totals]
    result = ml_service.train(zones, totals)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@app.post("/predict/forecast")
def forecast(req: ForecastRequest):
    totals = [m.model_dump() for m in req.monthly_totals]
    if not totals:
        raise HTTPException(status_code=400, detail="No monthly data provided")
    return ml_service.predict_forecast(totals)


@app.post("/predict/clusters")
def clusters(req: ClusterRequest):
    if not ml_service.is_trained():
        raise HTTPException(status_code=503, detail="Models not trained yet — call POST /train first")
    zones = [z.model_dump() for z in req.zones]
    return {"clusters": ml_service.predict_clusters(zones)}


@app.post("/predict/hotspots")
def hotspots(req: HotspotRequest):
    zones = [z.model_dump() for z in req.zones]
    return {"hotspots": ml_service.predict_hotspots(zones)}