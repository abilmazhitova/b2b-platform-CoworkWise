from pydantic import BaseModel

# Compare view: locations with metrics
class CompareItem(BaseModel):
    location: str
    footfall: int
    coworkings: int = 0
    avgRent: int = 0
    competition: int = 0
    district: str = ""
    zone_id: str = ""

# Recommendations
class RecommendationItem(BaseModel):
    id: str
    location: str
    district: str
    score: int
    rating: str
    reasons: list[str]
    metrics: dict  # footfall, competition, etc.
    lat: float
    lng: float

# Forecast: time series
class ForecastPoint(BaseModel):
    month: str
    actual: int | None
    predicted: int
    lower: int | None = None
    upper: int | None = None


class ForecastDistrictItem(BaseModel):
    """Прогноз по району (логика forecast_model + данные из БД)."""
    district: str
    growth_trend: float
    infra_strength: float
    competition: float
    forecast_score: float
    category: str
    recommendation: str


class ForecastResponse(BaseModel):
    """Месячный ряд из БД + ML по районам."""
    series: list[ForecastPoint]
    districts: list[ForecastDistrictItem] = []


# Describe point: аналитика по выбранной точке на карте
class DescribePointResponse(BaseModel):
    location: dict  # {"lat": float, "lon": float}
    district: str
    radius_m: int
    density: float
    competition: int
    infra_summary: dict  # type -> count
    infra_examples: dict  # type -> list of {lat, lon}
    status: str  # "ok" | "out_of_city"
