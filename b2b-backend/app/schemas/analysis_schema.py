from pydantic import BaseModel


class CompareItem(BaseModel):
    location: str
    footfall: int
    coworkings: int = 0
    avgRent: int = 0
    competition: int = 0
    district: str = ""
    zone_id: str = ""


class RecommendationItem(BaseModel):
    id: str
    location: str
    district: str
    score: int
    rating: str
    reasons: list[str]
    metrics: dict 
    lat: float
    lng: float


class ForecastPoint(BaseModel):
    month: str
    actual: int | None
    predicted: int
    lower: int | None = None
    upper: int | None = None


class ForecastDistrictItem(BaseModel):
    district: str
    growth_trend: float
    infra_strength: float
    competition: float
    forecast_score: float
    category: str
    recommendation: str


class ForecastResponse(BaseModel):
    series: list[ForecastPoint]
    districts: list[ForecastDistrictItem] = []



class DescribePointResponse(BaseModel):
    location: dict  
    district: str
    radius_m: int
    density: float
    competition: int
    infra_summary: dict 
    infra_examples: dict
    status: str  
