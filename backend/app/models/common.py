from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class HealthResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    status: str
    service: str
    environment: str
    timestamp: datetime


class CtfStatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    is_active: bool
    freeze_leaderboard: bool
    dynamic_scoring: bool
    max_team_size: int
    leaderboard_refresh_seconds: int = 15
    server_time: datetime


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    message: str
