from typing import Optional, List
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator


class AdminRoomCreateRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=100)
    slug: str = Field(..., pattern=r"^[a-z0-9-]+$")
    description: str = ""
    difficulty: str = Field(..., pattern=r"^(Easy|Medium|Hard|Insane)$")
    tags: List[str] = []
    cover_image_url: Optional[str] = None
    is_published: bool = False
    display_order: int = 0


class AdminRoomUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=100)
    slug: Optional[str] = Field(None, pattern=r"^[a-z0-9-]+$")
    description: Optional[str] = None
    difficulty: Optional[str] = Field(None, pattern=r"^(Easy|Medium|Hard|Insane)$")
    tags: Optional[List[str]] = None
    cover_image_url: Optional[str] = None
    is_published: Optional[bool] = None
    display_order: Optional[int] = None


class AdminChallengeCreateRequest(BaseModel):
    room_id: UUID
    title: str = Field(..., min_length=3, max_length=120)
    description: str = ""
    category: str = Field(..., pattern=r"^(Web|Crypto|Forensics|Pwn|Reverse|OSINT|Stego|Misc)$")
    points: int = Field(100, ge=0)
    difficulty: str = Field("Medium", pattern=r"^(Easy|Medium|Hard|Insane)$")
    external_link: Optional[str] = None
    is_published: bool = False
    display_order: int = 0
    flag: str = Field(..., min_length=1)  # Plaintext flag will be hashed and never stored directly
    is_case_sensitive: bool = True


class AdminChallengeCreatedResponse(BaseModel):
    message: str
    challenge_id: UUID


class AdminChallengeFileItem(BaseModel):
    id: UUID
    file_name: str
    file_size: int = Field(..., ge=0)


class AdminChallengeUpdateRequest(BaseModel):
    room_id: Optional[UUID] = None
    title: Optional[str] = Field(None, min_length=3, max_length=120)
    description: Optional[str] = None
    category: Optional[str] = Field(None, pattern=r"^(Web|Crypto|Forensics|Pwn|Reverse|OSINT|Stego|Misc)$")
    points: Optional[int] = Field(None, ge=0)
    difficulty: Optional[str] = Field(None, pattern=r"^(Easy|Medium|Hard|Insane)$")
    external_link: Optional[str] = None
    is_published: Optional[bool] = None
    display_order: Optional[int] = None
    flag: Optional[str] = None  # If provided, rotates the flag hash
    is_case_sensitive: Optional[bool] = None


class AdminHintCreateRequest(BaseModel):
    challenge_id: UUID
    content: str
    cost: int = Field(0, ge=0)
    display_order: int = 0


class AdminHintUpdateRequest(BaseModel):
    content: Optional[str] = None
    cost: Optional[int] = Field(None, ge=0)
    display_order: Optional[int] = None


class AdminCtfSettingsUpdateRequest(BaseModel):
    title: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    is_active: Optional[bool] = None
    freeze_leaderboard: Optional[bool] = None
    dynamic_scoring: Optional[bool] = None
    max_team_size: Optional[int] = Field(None, ge=1)
    leaderboard_refresh_seconds: Optional[int] = Field(None, ge=0, le=3600)

    @model_validator(mode="after")
    def validate_time_order(self):
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValueError("Competition end time must be after its start time")
        return self


class AdminUserBanRequest(BaseModel):
    is_banned: bool


class AdminUserCreateRequest(BaseModel):
    password: str = Field(..., min_length=6, max_length=128)
    username: str = Field(..., min_length=3, max_length=20, pattern=r"^[a-zA-Z0-9_-]+$")
    email: str = Field(..., min_length=5, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    display_name: Optional[str] = Field(None, max_length=50)
    role: str = Field("user", pattern=r"^(user|admin)$")
    team_id: Optional[UUID] = None


class AdminUserListItem(BaseModel):
    id: UUID
    username: str
    display_name: str
    role: str
    is_banned: bool
    team_id: Optional[UUID] = None
    last_seen_at: datetime
    created_at: datetime
    teams: Optional[dict] = None


class AdminUserListResponse(BaseModel):
    items: List[AdminUserListItem]
    total: int
    page: int
    page_size: int


class AdminTeamListItem(BaseModel):
    id: UUID
    name: str
    captain_id: Optional[UUID] = None
    max_members: int
    created_at: datetime
    profiles: Optional[dict] = None
    members: List[dict] = []


class AdminTeamListResponse(BaseModel):
    items: List[AdminTeamListItem]
    total: int
    page: int
    page_size: int


class AdminUserResetPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=6, max_length=128)


class AdminTeamCreateRequest(BaseModel):
    name: str = Field(..., min_length=3, max_length=30)
    captain_username: Optional[str] = None
    max_members: int = Field(4, ge=1, le=100)


class AdminTeamCapacityRequest(BaseModel):
    max_members: int = Field(..., ge=1, le=100)


class AdminTeamMemberRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=30, pattern=r"^[a-zA-Z0-9_-]+$")
