from typing import Optional, List
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class ChallengeSummaryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    category: str
    points: int
    difficulty: str
    display_order: int
    is_solved_by_user: bool = False
    is_solved_by_team: bool = False
    solves_count: int = 0


class RoomListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    slug: str
    description: str
    difficulty: str
    tags: List[str] = []
    cover_image_url: Optional[str] = None
    display_order: int = 0
    challenge_count: int = 0
    total_points: int = 0
    user_status: str = "not_started"
    user_solved_count: int = 0
    user_points_earned: int = 0


class RoomDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    slug: str
    description: str
    difficulty: str
    tags: List[str] = []
    cover_image_url: Optional[str] = None
    display_order: int = 0
    challenge_count: int = 0
    total_points: int = 0
    user_status: str = "not_started"
    user_solved_count: int = 0
    user_points_earned: int = 0
    challenges: List[ChallengeSummaryItem] = []
