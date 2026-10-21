from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class MonitorOverviewStats(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    total_users: int = 0
    active_now: int = 0
    users_in_lab: int = 0
    labs_completed_today: int = 0
    average_completion_percent: float = 0.0
    total_submissions: int = 0
    wrong_attempt_rate_percent: float = 0.0
    status_distribution: Dict[str, int] = {}
    completions_per_day: List[Dict[str, Any]] = []
    completion_rate_per_lab: List[Dict[str, Any]] = []


class LiveActiveUserItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: UUID
    username: str
    display_name: str
    team_name: Optional[str] = None
    current_room_id: Optional[UUID] = None
    current_room_title: Optional[str] = None
    current_challenge_id: Optional[UUID] = None
    current_challenge_title: Optional[str] = None
    last_seen_at: datetime
    last_event_type: Optional[str] = None
    time_in_lab_seconds: Optional[int] = None


class LiveEventItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    event_id: UUID
    event_type: str
    created_at: datetime
    user_id: UUID
    username: str
    display_name: str
    team_id: Optional[UUID] = None
    team_name: Optional[str] = None
    room_id: Optional[UUID] = None
    room_title: Optional[str] = None
    room_slug: Optional[str] = None
    challenge_id: Optional[UUID] = None
    challenge_title: Optional[str] = None
    metadata: Dict[str, Any] = {}


class UserProgressSummaryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: UUID
    username: str
    display_name: str
    avatar_url: Optional[str] = None
    role: str
    is_banned: bool
    team_id: Optional[UUID] = None
    team_name: Optional[str] = None
    last_seen_at: datetime
    is_online: bool
    current_room_title: Optional[str] = None
    current_challenge_title: Optional[str] = None
    labs_completed: int
    labs_in_progress: int
    labs_not_started: int
    total_labs: int
    completion_percent: float
    total_points: int
    registered_at: datetime


class UserProgressListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    total: int
    page: int
    page_size: int
    users: List[UserProgressSummaryItem] = []


class UserDetailChallengeItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    challenge_id: UUID
    title: str
    category: str
    points: int
    is_solved: bool
    attempts_count: int = 0
    hints_used_count: int = 0
    solved_at: Optional[datetime] = None


class UserDetailLabCard(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    room_id: UUID
    title: str
    slug: str
    difficulty: str
    status: str
    solved_count: int
    total_count: int
    points_earned: int
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    challenges: List[UserDetailChallengeItem] = []


class UserDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user: UserProgressSummaryItem
    rank: Optional[int] = None
    labs: List[UserDetailLabCard] = []
    recent_activity: List[LiveEventItem] = []
    unsolved_challenges_remaining: int = 0


class AdminTeamProgressMember(BaseModel):
    user_id: UUID
    username: str
    display_name: str
    is_online: bool = False
    current_room_id: Optional[UUID] = None
    current_room_title: Optional[str] = None
    current_challenge_title: Optional[str] = None


class AdminTeamLabProgress(BaseModel):
    room_id: UUID
    title: str
    status: str
    solved_count: int = 0
    total_count: int = 0
    points_earned: int = 0


class AdminTeamDetailResponse(BaseModel):
    team_id: UUID
    team_name: str
    rank: Optional[int] = None
    score: int = 0
    member_count: int = 0
    max_members: int = 4
    current_labs: List[str] = []
    completed_labs: List[str] = []
    members: List[AdminTeamProgressMember] = []
    labs: List[AdminTeamLabProgress] = []


class AdminTeamProgressListItem(BaseModel):
    team_id: UUID
    team_name: str
    rank: Optional[int] = None
    score: int = 0
    team_score: int = 0
    solves_count: int = 0
    member_count: int = 0
    max_members: int = 4
    members_online: int = 0
    current_labs: List[str] = []
    completed_labs: List[str] = []


class AdminTeamProgressListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    teams: List[AdminTeamProgressListItem] = []


class LabCohortUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: UUID
    username: str
    display_name: str
    team_name: Optional[str] = None
    solved_count: int
    total_count: int
    completed_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    last_activity_at: Optional[datetime] = None


class LabDetailMetricsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    room_id: UUID
    title: str
    slug: str
    difficulty: str
    total_challenges: int
    total_points: int
    completion_rate_percent: float
    avg_completion_time_seconds: int
    completed_users: List[LabCohortUser] = []
    in_progress_users: List[LabCohortUser] = []
    not_started_users: List[LabCohortUser] = []
    hardest_challenges: List[Dict[str, Any]] = []


class MatrixCell(BaseModel):
    status: str  # 'not_started' | 'in_progress' | 'completed'
    solved_count: int
    total_count: int
    points_earned: int


class MatrixRow(BaseModel):
    id: UUID
    name: str
    subtext: Optional[str] = None
    cells: Dict[str, MatrixCell] = {}  # room_id -> cell


class MatrixResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    mode: str  # 'users' | 'teams'
    rooms: List[Dict[str, Any]] = []  # [{id, title, slug, display_order}]
    rows: List[MatrixRow] = []


class AlertItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    alert_type: str  # 'stuck' | 'inactive' | 'suspicious'
    severity: str    # 'warning' | 'danger' | 'info'
    title: str
    description: str
    user_id: Optional[UUID] = None
    username: Optional[str] = None
    room_title: Optional[str] = None
    timestamp: datetime
