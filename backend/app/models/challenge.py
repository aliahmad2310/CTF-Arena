from typing import Optional, List
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class HintSummaryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    cost: int
    display_order: int
    is_unlocked: bool = False
    content: Optional[str] = None  # None unless unlocked or admin


class ChallengeFileItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    file_name: str
    file_size: int
    download_url: str


class ChallengeDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    room_id: UUID
    room_slug: str
    room_title: str
    title: str
    description: str  # Markdown text
    category: str
    points: int
    difficulty: str
    external_link: Optional[str] = None
    is_solved_by_user: bool = False
    is_solved_by_team: bool = False
    solves_count: int = 0
    hints: List[HintSummaryItem] = []
    files: List[ChallengeFileItem] = []


class FlagSubmitRequest(BaseModel):
    flag: str = Field(..., min_length=1, max_length=255)


class FlagSubmitResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    is_correct: bool
    message: str
    points_awarded: int = 0
    is_first_blood: bool = False
    lab_completed: bool = False


class HintUnlockResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    hint_id: UUID
    content: str
    cost_deducted: int
    message: str
