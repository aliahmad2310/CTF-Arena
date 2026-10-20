from typing import Optional, List
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class DashboardStats(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    rank: Optional[int] = None
    total_score: int = 0
    solves_count: int = 0
    labs_completed: int = 0
    labs_in_progress: int = 0
    total_labs: int = 0
    team_name: Optional[str] = None
    team_score: Optional[int] = None
    team_rank: Optional[int] = None


class ActiveLabResumeItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    room_id: UUID
    slug: str
    title: str
    difficulty: str
    solved_count: int
    total_count: int
    percent: int
    points_earned: int
    last_activity_at: Optional[datetime] = None


class RecentActivityFeedItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    event_type: str
    created_at: datetime
    room_title: Optional[str] = None
    challenge_title: Optional[str] = None
    points: Optional[int] = None


class DashboardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    stats: DashboardStats
    active_labs: List[ActiveLabResumeItem] = []
    recent_activity: List[RecentActivityFeedItem] = []
