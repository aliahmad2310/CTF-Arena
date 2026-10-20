from typing import Optional, List
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class UserProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    username: str
    display_name: str
    email: Optional[str] = None
    avatar_url: Optional[str] = None
    role: str
    team_id: Optional[UUID] = None
    team_name: Optional[str] = None
    is_banned: bool = False
    last_seen_at: datetime
    total_score: int = 0
    rank: Optional[int] = None
    created_at: datetime


class UserUpdateRequest(BaseModel):
    display_name: Optional[str] = Field(None, min_length=2, max_length=50)
    avatar_url: Optional[str] = Field(None, max_length=255)


class HeartbeatRequest(BaseModel):
    current_room_id: Optional[UUID] = None
    current_challenge_id: Optional[UUID] = None


class UserSolveItem(BaseModel):
    challenge_id: UUID
    challenge_title: str
    challenge_category: str
    room_id: UUID
    room_title: str
    points_awarded: int
    is_first_blood: bool
    solved_at: datetime


class PublicUserProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    username: str
    display_name: str
    avatar_url: Optional[str] = None
    role: str
    team_id: Optional[UUID] = None
    team_name: Optional[str] = None
    total_score: int = 0
    rank: Optional[int] = None
    solves_count: int = 0
    created_at: datetime
    solves: List[UserSolveItem] = []
