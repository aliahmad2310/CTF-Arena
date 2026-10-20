from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import get_current_user
from app.db.client import get_supabase_client
from app.models.dashboard import (
    DashboardResponse,
    DashboardStats,
    ActiveLabResumeItem,
    RecentActivityFeedItem
)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("", response_model=DashboardResponse)
async def get_competitor_dashboard(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Aggregated competitor operational dashboard:
    Global rank, total points, in-progress labs with quick-resume shortcuts, and recent activity logs.
    """
    supabase = get_supabase_client()
    user_id = current_user["id"]
    team_id = current_user.get("team_id")

    try:
        # 1. Fetch user rank & score from user_leaderboard view
        user_rank = None
        total_score = 0
        solves_count = 0
        team_name = None

        ul_res = supabase.table("user_leaderboard").select("*").eq("user_id", user_id).limit(1).execute()
        if ul_res.data and len(ul_res.data) > 0:
            row = ul_res.data[0]
            user_rank = row.get("rank")
            total_score = row.get("score", 0)
            solves_count = row.get("solves_count", 0)
            team_name = row.get("team_name")

        # 2. Fetch team rank & score if affiliated
        team_score = None
        team_rank = None
        if team_id:
            tl_res = supabase.table("team_leaderboard").select("score, rank, team_name").eq("team_id", team_id).limit(1).execute()
            if tl_res.data and len(tl_res.data) > 0:
                t_row = tl_res.data[0]
                team_score = t_row.get("score", 0)
                team_rank = t_row.get("rank")
                team_name = t_row.get("team_name")

        # 3. Fetch lab counts
        total_labs_res = supabase.table("rooms").select("id", count="exact").eq("is_published", True).execute()
        total_published_labs = total_labs_res.count or 0

        # Query user lab_progress
        prog_res = supabase.table("lab_progress").select(
            "room_id, status, solved_count, total_count, points_earned, last_activity_at, rooms!inner(slug, title, difficulty, is_published)"
        ).eq("user_id", user_id).eq("rooms.is_published", True).order("last_activity_at", desc=True).execute()

        prog_rows = prog_res.data or []
        labs_completed = sum(1 for p in prog_rows if p["status"] == "completed")
        labs_in_progress = sum(1 for p in prog_rows if p["status"] == "in_progress")

        active_labs: List[ActiveLabResumeItem] = []
        for p in prog_rows:
            if p["status"] == "in_progress":
                rm = p.get("rooms") or {}
                tot = p.get("total_count", 0)
                slv = p.get("solved_count", 0)
                pct = round((slv / tot) * 100) if tot > 0 else 0
                active_labs.append(ActiveLabResumeItem(
                    room_id=p["room_id"],
                    slug=rm.get("slug", ""),
                    title=rm.get("title", "Unknown Lab"),
                    difficulty=rm.get("difficulty", "Medium"),
                    solved_count=slv,
                    total_count=tot,
                    percent=pct,
                    points_earned=p.get("points_earned", 0),
                    last_activity_at=p.get("last_activity_at")
                ))

        # 4. Fetch recent personal activity logs
        events_res = supabase.table("activity_events").select(
            "event_type, created_at, metadata, rooms(title), challenges(title)"
        ).eq("user_id", user_id).order("created_at", desc=True).limit(8).execute()

        recent_activity: List[RecentActivityFeedItem] = []
        for ev in (events_res.data or []):
            rm = ev.get("rooms") or {}
            ch = ev.get("challenges") or {}
            meta = ev.get("metadata") or {}
            recent_activity.append(RecentActivityFeedItem(
                event_type=ev["event_type"],
                created_at=ev["created_at"],
                room_title=rm.get("title"),
                challenge_title=ch.get("title"),
                points=meta.get("points")
            ))

        stats = DashboardStats(
            rank=user_rank,
            total_score=total_score,
            solves_count=solves_count,
            labs_completed=labs_completed,
            labs_in_progress=labs_in_progress,
            total_labs=total_published_labs,
            team_name=team_name,
            team_score=team_score,
            team_rank=team_rank
        )

        return DashboardResponse(
            stats=stats,
            active_labs=active_labs,
            recent_activity=recent_activity
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error compiling competitor dashboard: {str(exc)}"
        )
