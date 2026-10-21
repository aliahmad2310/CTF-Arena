from datetime import datetime
from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.core.deps import require_admin
from app.models.monitor import (
    MonitorOverviewStats,
    LiveActiveUserItem,
    LiveEventItem,
    UserProgressListResponse,
    UserDetailResponse,
    LabDetailMetricsResponse,
    MatrixResponse,
    AlertItem,
    AdminTeamProgressListResponse,
    AdminTeamDetailResponse,
)
from app.services import monitor_service, alert_service

router = APIRouter(prefix="/admin/monitor", tags=["Admin Monitoring"])


@router.get("/overview", response_model=MonitorOverviewStats)
async def get_overview(_admin=Depends(require_admin)):
    """
    Returns platform-wide administrative metrics: online competitors,
    active lab counts, completion rates, and submission failure distributions.
    """
    return await monitor_service.get_monitor_overview()


@router.get("/live", response_model=List[LiveActiveUserItem])
async def get_live_users(_admin=Depends(require_admin)):
    """
    Returns live online competitors who have transmitted a heartbeat within
    the active window, including their current lab and challenge context.
    """
    active_users, _ = await monitor_service.get_live_monitoring_feed()
    return active_users


@router.get("/events", response_model=List[LiveEventItem])
async def get_live_events(
    since: Optional[datetime] = Query(None, description="Retrieve events occurring after this ISO timestamp"),
    _admin=Depends(require_admin)
):
    """
    Returns chronological audit event records (solves, hints, attempts, completions).
    """
    _, events = await monitor_service.get_live_monitoring_feed(since=since)
    return events


@router.get("/users", response_model=UserProgressListResponse)
async def get_users_progress(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    q: Optional[str] = Query(None, description="Search by username or display name"),
    team_id: Optional[UUID] = Query(None, description="Filter by squad/team ID"),
    status: Optional[str] = Query(None, description="Filter status: completed, in_progress, not_started"),
    online: bool = Query(False, description="Filter only users active within window"),
    sort_by: str = Query("registered_at", description="Field to sort on"),
    order: str = Query("desc", regex="^(asc|desc)$", description="Sort direction"),
    _admin=Depends(require_admin)
):
    """
    Provides a paginated directory of competitor progress across all published labs.
    """
    return await monitor_service.get_user_progress_directory(
        page=page,
        page_size=page_size,
        q=q,
        team_id=team_id,
        status_filter=status,
        online_only=online,
        sort_by=sort_by,
        order_dir=order
    )


@router.get("/users/{user_id}", response_model=UserDetailResponse)
async def get_user_detail(
    user_id: UUID,
    _admin=Depends(require_admin)
):
    """
    Returns an exhaustive audit for a single competitor: lab cards, challenge breakdown,
    unlocked hints, activity timeline, and remaining unsolved challenges.
    """
    return await monitor_service.get_user_detail_audit(user_id=str(user_id))


@router.get("/teams", response_model=AdminTeamProgressListResponse)
async def get_team_progress(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    _admin=Depends(require_admin),
):
    """Return ranked teams with their current and completed lab activity."""
    return await monitor_service.get_team_progress_directory(page=page, page_size=page_size)


@router.get("/teams/{team_id}", response_model=AdminTeamDetailResponse)
async def get_team_detail(team_id: UUID, _admin=Depends(require_admin)):
    """Return the team's members and aggregated per-lab progress."""
    try:
        return await monitor_service.get_team_detail_audit(team_id=str(team_id))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found") from exc


@router.get("/labs/{room_id}", response_model=LabDetailMetricsResponse)
async def get_lab_detail(
    room_id: UUID,
    _admin=Depends(require_admin)
):
    """
    Returns lab cohort breakdowns (Completed, In Progress, Not Started),
    challenge solve rates, and difficulty funnels.
    """
    return await monitor_service.get_lab_detail_metrics(room_id=str(room_id))


@router.get("/matrix", response_model=MatrixResponse)
async def get_matrix(
    mode: str = Query("users", regex="^(users|teams)$", description="Aggregation dimension: users or teams"),
    _admin=Depends(require_admin)
):
    """
    Returns the two-dimensional progress matrix (entities by labs) for heatmap display.
    """
    return await monitor_service.get_matrix_data(mode=mode)


@router.get("/alerts", response_model=List[AlertItem])
async def get_alerts(_admin=Depends(require_admin)):
    """
    Returns automated administrative alerts for stuck competitors, inactive registrants,
    and suspicious submission bursts.
    """
    return await alert_service.detect_monitoring_alerts()


@router.get("/export/users.csv")
async def export_users_csv(_admin=Depends(require_admin)):
    """
    Streams a sanitized CSV export of all competitor progress records,
    guarding against formula injection.
    """
    result = await monitor_service.get_user_progress_directory(page=1, page_size=10000)
    generator = monitor_service.stream_users_csv(result.users)
    return StreamingResponse(
        generator,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=competitors_progress.csv"}
    )


@router.get("/export/matrix.csv")
async def export_matrix_csv(
    mode: str = Query("users", regex="^(users|teams)$"),
    _admin=Depends(require_admin)
):
    """
    Streams a sanitized CSV export of the two-dimensional progress matrix heatmap.
    """
    matrix = await monitor_service.get_matrix_data(mode=mode)
    generator = monitor_service.stream_matrix_csv(matrix)
    return StreamingResponse(
        generator,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=progress_matrix_{mode}.csv"}
    )
