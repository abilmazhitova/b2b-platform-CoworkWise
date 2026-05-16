from sqlalchemy import JSON, Boolean, Column, Float, ForeignKey, Integer, String, BigInteger
from app.database import Base
from sqlalchemy.orm import relationship


class TelecomGrid(Base):
    __tablename__ = "telecom_grids"

    id = Column(Integer, primary_key=True, index=True)
    zid_number = Column(BigInteger, unique=True, nullable=False)
    lat_bot_left = Column(Float, nullable=False)
    long_bot_left = Column(Float, nullable=False)
    lat_bot_right = Column(Float, nullable=False)
    long_bot_right = Column(Float, nullable=False)
    lat_top_right = Column(Float, nullable=False)
    long_top_right = Column(Float, nullable=False)

    stats = relationship("TelecomStat", back_populates="grid")

class TelecomStat(Base):
    __tablename__ = "telecom_stats"

    id = Column(Integer, primary_key=True, index=True)
    grid_id = Column(Integer, ForeignKey("telecom_grids.id"), nullable=False)
    week_day = Column(Integer, nullable=False)  # 0-6
    time_hour = Column(Integer, nullable=False) # 0-23
    user_count = Column(Integer, nullable=False) # количество пользователей в этот час
    month_label = Column(String, nullable=True)
    grid = relationship("TelecomGrid", back_populates="stats")