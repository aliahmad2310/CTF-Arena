from typing import Optional, List
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class TeamCreateRequest(BaseModel):
    name: str = Field(..., min_length=3, max_length=30)


class TeamUpdateRequest(BaseModel):
    name: str = Field(..., min_length=3, max_length=30)


class TeamJoinRequest(BaseModel):
    invite_code: str = Field(..., min_length=6, max_length=32)


class TeamMemberItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    username: str
    display_name: str
    avatar_url: Optional[str] = None
    is_captain: bool = False
    score: int = 0
    solves_count: int = 0
    last_seen_at: datetime


class TeamDetailResponse(BaseModel):
    """
    Detailed team representation returned ONLY to team members and administrators.
    Exposes the secret invite_code for team recruitment.
    """
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    invite_code: str
    captain_id: Optional[UUID] = None
    score: int = 0
    rank: Optional[int] = None
    member_count: int = 0
    max_team_size: int = 4
    created_at: datetime
    members: List[TeamMemberItem] = []


class PublicTeamResponse(BaseModel):
    """
    Public team representation. Strictly omits the secret invite_code.
    """
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    captain_id: Optional[UUID] = None
    score: int = 0
    rank: Optional[int] = None
    member_count: int = 0
    max_team_size: int = 4
    created_at: datetime
    members: List[TeamMemberItem] = []
