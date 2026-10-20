from typing import Dict, Any
from uuid import UUID
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import get_current_user
from app.db.client import get_supabase_client
from app.models.challenge import HintUnlockResponse

router = APIRouter(prefix="/hints", tags=["Hints"])


@router.post("/{id}/unlock", response_model=HintUnlockResponse)
async def unlock_hint(
    id: UUID,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Unlocks an intelligence hint for a challenge, deducting penalty points on the scoreboard.
    """
    supabase = get_supabase_client()
    hint_id = str(id)
    user_id = str(current_user["id"])
    team_id = str(current_user.get("team_id")) if current_user.get("team_id") else None

    # Fetch hint details
    hint_res = supabase.table("hints").select(
        "id, challenge_id, content, cost, challenges(room_id)"
    ).eq("id", hint_id).limit(1).execute()

    if not hint_res.data or len(hint_res.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hint not found"
        )

    hint = hint_res.data[0]
    ch_info = hint.get("challenges") or {}
    room_id = ch_info.get("room_id")

    # Check if already unlocked by this user
    existing = supabase.table("hint_unlocks").select("id").eq("hint_id", hint_id).eq("user_id", user_id).limit(1).execute()
    if existing.data and len(existing.data) > 0:
        return HintUnlockResponse(
            hint_id=hint["id"],
            content=hint["content"],
            cost_deducted=0,
            message="Hint has already been unlocked for your profile."
        )

    # Insert unlock record
    cost = hint.get("cost", 0)
    supabase.table("hint_unlocks").insert({
        "hint_id": hint_id,
        "user_id": user_id,
        "team_id": team_id,
        "cost": cost,
        "created_at": datetime.now(timezone.utc).isoformat()
    }).execute()

    # Log activity event
    supabase.table("activity_events").insert({
        "user_id": user_id,
        "team_id": team_id,
        "event_type": "hint_unlocked",
        "room_id": room_id,
        "challenge_id": hint["challenge_id"],
        "metadata": {
            "hint_id": hint_id,
            "cost": cost
        }
    }).execute()

    return HintUnlockResponse(
        hint_id=hint["id"],
        content=hint["content"],
        cost_deducted=cost,
        message=f"Hint unlocked. {cost} points will be deducted from your net score."
    )
