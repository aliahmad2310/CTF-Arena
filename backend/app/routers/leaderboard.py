from typing import Dict, Any, List, Optional
from uuid import UUID
from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException, status

from app.core.deps import get_optional_current_user
from app.db.client import get_supabase_client
from app.models.leaderboard import (
    UserLeaderboardResponse,
    UserLeaderboardEntry,
    TeamLeaderboardResponse,
    TeamLeaderboardEntry,
    TimelineResponse,
    TimelineSeries,
    TimelinePoint
)

router = APIRouter(prefix="/leaderboard", tags=["Leaderboard"])


@router.get("/users", response_model=UserLeaderboardResponse)
async def get_user_leaderboard(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    q: Optional[str] = Query(None)
):
    """
    Retrieves ranked individual competitors ordered by score descending and earliest solve tie-break.
    """
    supabase = get_supabase_client()
    offset = (page - 1) * page_size

    try:
        query = supabase.table("user_leaderboard").select("*", count="exact")

        if q:
            clean_q = q.strip()
            query = query.or_(f"username.ilike.%{clean_q}%,team_name.ilike.%{clean_q}%")

        res = query.order("rank").range(offset, offset + page_size - 1).execute()
        total_count = res.count or 0
        rows = res.data or []

        entries = [
            UserLeaderboardEntry(
                rank=r["rank"],
                user_id=r["user_id"],
                username=r["username"],
                display_name=r["display_name"],
                avatar_url=r.get("avatar_url"),
                team_id=r.get("team_id"),
                team_name=r.get("team_name"),
                score=r["score"],
                solves_count=r["solves_count"],
                last_solve_at=r.get("last_solve_at")
            )
            for r in rows
        ]

        return UserLeaderboardResponse(
            total=total_count,
            page=page,
            page_size=page_size,
            entries=entries
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error querying user leaderboard: {str(exc)}"
        )


@router.get("/teams", response_model=TeamLeaderboardResponse)
async def get_team_leaderboard(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    q: Optional[str] = Query(None)
):
    """
    Retrieves ranked squads ordered by team score descending and earliest solve tie-break.
    """
    supabase = get_supabase_client()
    offset = (page - 1) * page_size

    try:
        query = supabase.table("team_leaderboard").select(
            "rank, team_id, team_name, score, solves_count, member_count, last_solve_at",
            count="exact",
        )

        if q:
            clean_q = q.strip()
            query = query.ilike("team_name", f"%{clean_q}%")

        res = query.order("rank").range(offset, offset + page_size - 1).execute()
        total_count = res.count or 0
        rows = res.data or []

        entries = [
            TeamLeaderboardEntry(
                rank=r["rank"],
                team_id=r["team_id"],
                team_name=r["team_name"],
                score=r["score"],
                solves_count=r["solves_count"],
                member_count=r.get("member_count", 0),
                last_solve_at=r.get("last_solve_at")
            )
            for r in rows
        ]

        return TeamLeaderboardResponse(
            total=total_count,
            page=page,
            page_size=page_size,
            entries=entries
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error querying team leaderboard: {str(exc)}"
        )


@router.get("/timeline", response_model=TimelineResponse)
async def get_score_timeline():
    """
    Retrieves cumulative score progression timeline for top 10 teams/users for Chart.js graphing.
    """
    supabase = get_supabase_client()

    try:
        # Get top 10 teams from leaderboard view
        top_teams_res = supabase.table("team_leaderboard").select("team_id, team_name").order("rank").limit(10).execute()
        top_teams = top_teams_res.data or []

        if top_teams:
            team_ids = [t["team_id"] for t in top_teams]
            timeline_res = supabase.table("score_timeline").select(
                "timestamp, team_id, cumulative_score"
            ).in_("team_id", team_ids).order("timestamp").execute()

            # Group points by team
            points_by_team = {t["team_id"]: [] for t in top_teams}
            for row in (timeline_res.data or []):
                t_id = row["team_id"]
                if t_id in points_by_team:
                    points_by_team[t_id].append(TimelinePoint(
                        timestamp=row["timestamp"],
                        score=row["cumulative_score"]
                    ))

            series: List[TimelineSeries] = []
            for t in top_teams:
                t_id = t["team_id"]
                series.append(TimelineSeries(
                    id=t_id,
                    name=t["team_name"],
                    is_team=True,
                    points=points_by_team.get(t_id, [])
                ))

            return TimelineResponse(series=series)

        # Fallback to individual users if no teams exist yet
        top_users_res = supabase.table("user_leaderboard").select("user_id, username").order("rank").limit(10).execute()
        top_users = top_users_res.data or []
        user_ids = [u["user_id"] for u in top_users]

        series = []
        if user_ids:
            timeline_res = supabase.table("score_timeline").select(
                "timestamp, user_id, cumulative_score"
            ).in_("user_id", user_ids).order("timestamp").execute()

            points_by_user = {u["user_id"]: [] for u in top_users}
            for row in (timeline_res.data or []):
                u_id = row["user_id"]
                if u_id in points_by_user:
                    points_by_user[u_id].append(TimelinePoint(
                        timestamp=row["timestamp"],
                        score=row["cumulative_score"]
                    ))

            for u in top_users:
                u_id = u["user_id"]
                series.append(TimelineSeries(
                    id=u_id,
                    name=u["username"],
                    is_team=False,
                    points=points_by_user.get(u_id, [])
                ))

        return TimelineResponse(series=series)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving score timeline: {str(exc)}"
        )
