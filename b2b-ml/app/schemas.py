from pydantic import BaseModel


class ZoneFeatures(BaseModel):
    id: int
    lat: float
    lon: float
    density: float
    infra_score: float = 0.0
    competition: float = 0.0
    rent_m2: float = 9000.0


class MonthlyTotal(BaseModel):
    month: str
    total: float


class TrainRequest(BaseModel):
    zones: list[ZoneFeatures]
    monthly_totals: list[MonthlyTotal]


class ForecastRequest(BaseModel):
    monthly_totals: list[MonthlyTotal]


class ClusterRequest(BaseModel):
    zones: list[ZoneFeatures]


class HotspotRequest(BaseModel):
    zones: list[ZoneFeatures]


class ClusterResult(BaseModel):
    id: int
    cluster: int
    cluster_label: str
    score: int


class HotspotCluster(BaseModel):
    cluster_id: int
    zone_ids: list[int]
    center_lat: float
    center_lon: float
    size: int


class ForecastResult(BaseModel):
    predicted_month: str
    predicted_total: int
    lower: int
    upper: int
    growth_pct: float
    model: str = "LinearRegression"