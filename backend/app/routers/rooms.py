from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import get_optional_current_user
from app.db.client import get_supabase_client
from app.models.room import RoomListItem, RoomDetailResponse, ChallengeSummaryItem

router = APIRouter(prefix="/rooms", tags=["Labs"])


@router.get("", response_model=List[RoomListItem])
async def list_published_rooms(
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_current_user)
):
    """
    Retrieves all published cybersecurity labs with competitor completion statistics.
    """
    supabase = get_supabase_client()
    user_id = current_user["id"] if current_user else None

    try:
        # Fetch published rooms
        rooms_res = supabase.table("rooms").select("*").eq("is_published", True).order("display_order").execute()
        rooms = rooms_res.data or []

        # Fetch challenge counts and total points per room
        challenges_res = supabase.table("challenges").select("room_id, points").eq("is_published", True).execute()
        challenges_data = challenges_res.data or []

        room_stats = {}
        for c in challenges_data:
            r_id = c["room_id"]
            if r_id not in room_stats:
                room_stats[r_id] = {"count": 0, "points": 0}
            room_stats[r_id]["count"] += 1
            room_stats[r_id]["points"] += c.get("points", 0)

        # Fetch competitor progress if authenticated
        progress_by_room = {}
        if user_id:
            prog_res = supabase.table("lab_progress").select("*").eq("user_id", user_id).execute()
            if prog_res.data:
                for p in prog_res.data:
                    progress_by_room[p["room_id"]] = p

        result: List[RoomListItem] = []
        for r in rooms:
            r_id = r["id"]
            stats = room_stats.get(r_id, {"count": 0, "points": 0})
            user_prog = progress_by_room.get(r_id, {})

            # Determine dynamic lab status
            user_solved = user_prog.get("solved_count", 0)
            total_challenges = stats["count"]
            status_val = user_prog.get("status", "not_started")

            # Dynamic check: if admin added challenge after user completed, revert to in_progress
            if status_val == "completed" and total_challenges > user_solved:
                status_val = "in_progress"

            result.append(RoomListItem(
                id=r["id"],
                title=r["title"],
                slug=r["slug"],
                description=r.get("description", ""),
                difficulty=r["difficulty"],
                tags=r.get("tags") or [],
                cover_image_url=r.get("cover_image_url"),
                display_order=r["display_order"],
                challenge_count=total_challenges,
                total_points=stats["points"],
                user_status=status_val,
                user_solved_count=user_solved,
                user_points_earned=user_prog.get("points_earned", 0)
            ))

        return result
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error listing labs: {str(exc)}"
        )


@router.get("/{slug}", response_model=RoomDetailResponse)
async def get_room_details(
    slug: str,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_current_user)
):
    """
    Retrieves full lab details along with published challenge list and competitor solve states.
    Initializes lab progress tracking if competitor is authenticated.
    """
    supabase = get_supabase_client()
    user_id = current_user["id"] if current_user else None
    team_id = current_user.get("team_id") if current_user else None

    try:
        # Query room by slug (fallback to ID lookup)
        room_res = supabase.table("rooms").select("*").eq("slug", slug).limit(1).execute()
        if not room_res.data:
            room_res = supabase.table("rooms").select("*").eq("id", slug).limit(1).execute()

        if not room_res.data or len(room_res.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Lab '{slug}' not found"
            )

        room = room_res.data[0]
        room_id = room["id"]

        # Only admins can view unpublished drafts
        if not room.get("is_published") and (not current_user or current_user.get("role") != "admin"):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lab is not currently published"
            )

        # Fetch published challenges for this room
        ch_res = supabase.table("challenges").select(
            "id, title, category, points, difficulty, display_order"
        ).eq("room_id", room_id).eq("is_published", True).order("display_order").execute()
        challenges = ch_res.data or []
        ch_ids = [c["id"] for c in challenges]

        # Fetch solve statistics
        user_solves = set()
        team_solves = set()
        solve_counts = {}

        if ch_ids:
            # Query solve counts per challenge
            solves_count_res = supabase.table("solves").select("challenge_id").in_("challenge_id", ch_ids).execute()
            if solves_count_res.data:
                for row in solves_count_res.data:
                    c_id = row["challenge_id"]
                    solve_counts[c_id] = solve_counts.get(c_id, 0) + 1

            if user_id:
                # Query user individual solves
                u_solves_res = supabase.table("solves").select("challenge_id").eq("user_id", user_id).in_("challenge_id", ch_ids).execute()
                if u_solves_res.data:
                    user_solves = {s["challenge_id"] for s in u_solves_res.data}

                if team_id:
                    # Query team solves
                    t_solves_res = supabase.table("solves").select("challenge_id").eq("team_id", team_id).in_("challenge_id", ch_ids).execute()
                    if t_solves_res.data:
                        team_solves = {s["challenge_id"] for s in t_solves_res.data}

        # Initialize or retrieve user progress
        user_status = "not_started"
        user_solved_count = len(user_solves)
        user_points_earned = 0

        if user_id:
            now_iso = datetime.now(timezone.utc).isoformat()
            lp_res = supabase.table("lab_progress").select("*").eq("user_id", user_id).eq("room_id", room_id).limit(1).execute()

            if lp_res.data and len(lp_res.data) > 0:
                lp_row = lp_res.data[0]
                user_status = lp_row["status"]
                user_points_earned = lp_row.get("points_earned", 0)

                # Update last activity
                supabase.table("lab_progress").update({
                    "last_activity_at": now_iso
                }).eq("id", lp_row["id"]).execute()
            else:
                # First time opening lab -> mark in_progress
                user_status = "in_progress"
                supabase.table("lab_progress").insert({
                    "user_id": user_id,
                    "room_id": room_id,
                    "status": "in_progress",
                    "started_at": now_iso,
                    "last_activity_at": now_iso,
                    "solved_count": user_solved_count,
                    "total_count": len(challenges),
                    "points_earned": 0
                }).execute()

                # Log activity event
                supabase.table("activity_events").insert({
                    "user_id": user_id,
                    "team_id": team_id,
                    "event_type": "lab_opened",
                    "room_id": room_id,
                    "metadata": {}
                }).execute()

        # Dynamic check if newly published challenges exist
        if user_status == "completed" and len(challenges) > user_solved_count:
            user_status = "in_progress"

        challenge_items: List[ChallengeSummaryItem] = []
        total_room_points = 0
        for c in challenges:
            c_id = c["id"]
            total_room_points += c.get("points", 0)
            challenge_items.append(ChallengeSummaryItem(
                id=c_id,
                title=c["title"],
                category=c["category"],
                points=c["points"],
                difficulty=c["difficulty"],
                display_order=c["display_order"],
                is_solved_by_user=(c_id in user_solves),
                is_solved_by_team=(c_id in team_solves),
                solves_count=solve_counts.get(c_id, 0)
            ))

        return RoomDetailResponse(
            id=room["id"],
            title=room["title"],
            slug=room["slug"],
            description=room.get("description", ""),
            difficulty=room["difficulty"],
            tags=room.get("tags") or [],
            cover_image_url=room.get("cover_image_url"),
            display_order=room["display_order"],
            challenge_count=len(challenges),
            total_points=total_room_points,
            user_status=user_status,
            user_solved_count=user_solved_count,
            user_points_earned=user_points_earned,
            challenges=challenge_items
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving lab details: {str(exc)}"
        )
