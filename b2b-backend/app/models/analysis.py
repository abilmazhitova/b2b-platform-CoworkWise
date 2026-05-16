from sqlalchemy import JSON, Boolean, Column, Float, ForeignKey, Integer, String
from app.database import Base
from sqlalchemy.orm import relationship

class AnalysisResult(Base):
    __tablename__ = "analysis_results"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    grid_id = Column(Integer, ForeignKey("telecom_grids.id"))
    recommendations = Column(JSON)  # список рекомендаций или прогноз
    user = relationship("User", back_populates="analysis_results")
    grid = relationship("TelecomGrid")