from pydantic import BaseModel, Field, ConfigDict
from typing import Optional


class TelecomGridBase(BaseModel):
    zid_number: int
    lat_bot_left: float
    long_bot_left: float
    lat_bot_right: float
    long_bot_right: float
    lat_top_right: float
    long_top_right: float


class TelecomGridCreate(TelecomGridBase):
    pass


class TelecomGridRead(TelecomGridBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class GridWithActivity(TelecomGridRead):
    """Сетка с агрегированной активностью (сумма user_count по статистике)."""
    activity: float = 0.0



class TelecomStatBase(BaseModel):
    grid_id: int
    week_day: int = Field(ge=0, le=6, description="0=Mon ... 6=Sun")
    time_hour: int = Field(ge=0, le=23)
    user_count: int


class TelecomStatCreate(TelecomStatBase):
    pass


class TelecomStatRead(TelecomStatBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
