from typing import Optional, List
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class UserLeaderboardEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    rank: int
    user_id: UUID
    username: str
    display_name: str
    avatar_url: Optional[str] = None
    team_id: Optional[UUID] = None
    team_name: Optional[str] = None
    score: int
    solves_count: int
    last_solve_at: Optional[datetime] = None


class UserLeaderboardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    total: int
    page: int
    page_size: int
    entries: List[UserLeaderboardEntry] = []


class TeamLeaderboardEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    rank: int
    team_id: UUID
    team_name: str
    score: int
    solves_count: int
    member_count: int = 0
    last_solve_at: Optional[datetime] = None


class TeamLeaderboardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    total: int
    page: int
    page_size: int
    entries: List[TeamLeaderboardEntry] = []


class TimelinePoint(BaseModel):
    timestamp: datetime
    score: int


class TimelineSeries(BaseModel):
    id: UUID
    name: str
    is_team: bool = True
    points: List[TimelinePoint] = []


class TimelineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    series: List[TimelineSeries] = []
