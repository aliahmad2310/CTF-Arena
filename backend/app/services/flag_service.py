from datetime import datetime, timezone
from typing import Dict, Any, Optional
from uuid import UUID
from fastapi import HTTPException, status

from app.db.client import get_supabase_client
from app.core.security import verify_flag
from app.models.challenge import FlagSubmitResponse


def check_ctf_submission_eligibility(supabase) -> None:
    """
    Verifies that the competition is currently active and within scheduled submission windows.
    """
    settings_res = supabase.table("ctf_settings").select("*").eq("id", 1).limit(1).execute()
    if not settings_res.data or len(settings_res.data) == 0:
        return

    config = settings_res.data[0]
    now = datetime.now(timezone.utc)

    if not config.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Competition submissions are currently disabled by administrators."
        )

    start_time = config.get("start_time")
    if start_time:
        st = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        if now < st:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Competition has not started yet. Submissions are locked."
            )

    end_time = config.get("end_time")
    if end_time:
        et = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
        if now > et:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Competition has concluded. Submissions are permanently closed."
            )


async def process_flag_submission(
    challenge_id: str,
    submitted_flag: str,
    user: Dict[str, Any]
) -> FlagSubmitResponse:
    """
    Evaluates a submitted flag against salted hash, checks duplicate solves,
    awards first blood, updates lab progress, and logs audit events.
    """
    if user.get("role") != "user":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative accounts cannot submit flags or earn competition points."
        )

    supabase = get_supabase_client()
    user_id = str(user["id"])
    team_id = str(user.get("team_id")) if user.get("team_id") else None
    now_iso = datetime.now(timezone.utc).isoformat()

    # 1. Check competition time window
    check_ctf_submission_eligibility(supabase)

    # 2. Verify challenge exists and is published
    ch_res = supabase.table("challenges").select(
        "id, room_id, title, points, is_published"
    ).eq("id", challenge_id).limit(1).execute()

    if not ch_res.data or len(ch_res.data) == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Challenge not found")

    ch = ch_res.data[0]
    room_id = ch["room_id"]

    if not ch.get("is_published") and user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Challenge is not currently published")

    # 3. Check if user already solved
    u_solve = supabase.table("solves").select("id").eq("challenge_id", challenge_id).eq("user_id", user_id).limit(1).execute()
    if u_solve.data and len(u_solve.data) > 0:
        return FlagSubmitResponse(
            is_correct=True,
            message="You have already captured this flag.",
            points_awarded=0,
            is_first_blood=False,
            lab_completed=False
        )

    # 4. Check if team already solved (prevent double team points)
    if team_id:
        t_solve = supabase.table("solves").select("id").eq("challenge_id", challenge_id).eq("team_id", team_id).limit(1).execute()
        if t_solve.data and len(t_solve.data) > 0:
            return FlagSubmitResponse(
                is_correct=True,
                message="Your squad has already solved this challenge. No duplicate points awarded.",
                points_awarded=0,
                is_first_blood=False,
                lab_completed=False
            )

    # 5. Fetch salted flag hash from challenge_flags (service_role only)
    flag_res = supabase.table("challenge_flags").select(
        "flag_hash, salt, is_case_sensitive"
    ).eq("challenge_id", challenge_id).limit(1).execute()

    if not flag_res.data or len(flag_res.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Configuration error: challenge flag is uninitialized in database"
        )

    flag_row = flag_res.data[0]
    target_hash = flag_row["flag_hash"]
    salt = flag_row["salt"]
    is_case_sensitive = flag_row.get("is_case_sensitive", True)

    # 6. Verify flag using constant-time comparison
    is_match = verify_flag(submitted_flag, salt, target_hash, is_case_sensitive)

    # 7. Record submission attempt audit log
    clean_snippet = submitted_flag.strip()[:100]  # Store sanitized snippet for audit
    supabase.table("submissions").insert({
        "challenge_id": challenge_id,
        "user_id": user_id,
        "team_id": team_id,
        "submitted_flag": clean_snippet,
        "is_correct": is_match,
        "created_at": now_iso
    }).execute()

    # If INCORRECT
    if not is_match:
        # Log activity event
        supabase.table("activity_events").insert({
            "user_id": user_id,
            "team_id": team_id,
            "event_type": "flag_attempt_wrong",
            "room_id": room_id,
            "challenge_id": challenge_id,
            "metadata": {}
        }).execute()

        # Update last activity in lab_progress
        supabase.table("lab_progress").update({
            "last_activity_at": now_iso
        }).eq("user_id", user_id).eq("room_id", room_id).execute()

        return FlagSubmitResponse(
            is_correct=False,
            message="Incorrect flag. Check your methodology and try again.",
            points_awarded=0,
            is_first_blood=False,
            lab_completed=False
        )

    # If CORRECT:
    # 8. Check first blood atomically
    fb_res = supabase.table("solves").select("id", count="exact").eq("challenge_id", challenge_id).execute()
    is_first_blood = ((fb_res.count or 0) == 0)

    points_to_award = ch["points"]

    # 9. Insert solve record
    supabase.table("solves").insert({
        "challenge_id": challenge_id,
        "user_id": user_id,
        "team_id": team_id,
        "points_awarded": points_to_award,
        "is_first_blood": is_first_blood,
        "created_at": now_iso
    }).execute()

    # 10. Log flag_solved activity event
    supabase.table("activity_events").insert({
        "user_id": user_id,
        "team_id": team_id,
        "event_type": "flag_solved",
        "room_id": room_id,
        "challenge_id": challenge_id,
        "metadata": {
            "points": points_to_award,
            "first_blood": is_first_blood
        }
    }).execute()

    # 11. Evaluate Lab Completion
    # Count total published challenges in this lab
    total_ch_res = supabase.table("challenges").select("id", count="exact").eq("room_id", room_id).eq("is_published", True).execute()
    total_ch_count = total_ch_res.count or 1

    # Count user's solves in this lab
    user_room_solves_res = supabase.table("solves").select(
        "id, challenges!inner(room_id)"
    ).eq("user_id", user_id).eq("challenges.room_id", room_id).execute()
    user_solved_count = len(user_room_solves_res.data or [])

    is_lab_completed = (user_solved_count >= total_ch_count)

    # 12. Update lab_progress table
    lp_res = supabase.table("lab_progress").select("*").eq("user_id", user_id).eq("room_id", room_id).limit(1).execute()
    if lp_res.data and len(lp_res.data) > 0:
        lp_row = lp_res.data[0]
        new_points = lp_row.get("points_earned", 0) + points_to_award
        update_data = {
            "solved_count": user_solved_count,
            "total_count": total_ch_count,
            "points_earned": new_points,
            "last_activity_at": now_iso
        }
        if is_lab_completed and lp_row.get("status") != "completed":
            update_data["status"] = "completed"
            update_data["completed_at"] = now_iso

        supabase.table("lab_progress").update(update_data).eq("id", lp_row["id"]).execute()
    else:
        supabase.table("lab_progress").insert({
            "user_id": user_id,
            "room_id": room_id,
            "status": "completed" if is_lab_completed else "in_progress",
            "started_at": now_iso,
            "last_activity_at": now_iso,
            "completed_at": now_iso if is_lab_completed else None,
            "solved_count": user_solved_count,
            "total_count": total_ch_count,
            "points_earned": points_to_award
        }).execute()

    # 13. If lab was completed on this solve, generate lab_completed activity event
    if is_lab_completed:
        supabase.table("activity_events").insert({
            "user_id": user_id,
            "team_id": team_id,
            "event_type": "lab_completed",
            "room_id": room_id,
            "metadata": {
                "total_solved": user_solved_count,
                "completed_at": now_iso
            }
        }).execute()

    success_msg = f"Flag verified! Awarded {points_to_award} points."
    if is_first_blood:
        success_msg += " First blood captured!"
    if is_lab_completed:
        success_msg += " Lab completed 100%!"

    return FlagSubmitResponse(
        is_correct=True,
        message=success_msg,
        points_awarded=points_to_award,
        is_first_blood=is_first_blood,
        lab_completed=is_lab_completed
    )
