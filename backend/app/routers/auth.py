from datetime import datetime, timezone
import logging
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Request, status
from supabase import create_client

from app.core.config import settings
from app.core.deps import get_current_user
from app.core.rate_limit import limiter
from app.db.client import get_supabase_client
from app.models.user import (
    UserProfileResponse,
    UserUpdateRequest,
    HeartbeatRequest,
    PublicUserProfileResponse,
    UserSolveItem,
    UsernameLoginRequest,
    UsernameLoginResponse,
    PasswordUpdateRequest
)
from app.models.common import MessageResponse

router = APIRouter(prefix="", tags=["User Profile & Authentication"])


@router.post("/auth/login", response_model=UsernameLoginResponse)
@limiter.limit("10/minute")
async def login_with_username(request: Request, payload: UsernameLoginRequest):
    """Authenticates a username/password pair without exposing the account email."""
    if not settings.SUPABASE_ANON_KEY or settings.SUPABASE_ANON_KEY.startswith("placeholder-"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Username login is not configured on the server. Contact the administrator."
        )

    supabase = get_supabase_client()
    try:
        profile_res = supabase.table("profiles").select("id, is_banned").eq(
            "username", payload.username.lower()
        ).limit(1).execute()
        if not profile_res.data:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

        profile = profile_res.data[0]
        if profile.get("is_banned"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account has been suspended by system administrator")

        auth_user = supabase.auth.admin.get_user_by_id(str(profile["id"]))
        account_email = getattr(auth_user.user, "email", None)
        if not account_email:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

        # Use the configured public key and a fresh client so concurrent sign-ins
        # cannot overwrite shared server-side auth state.
        auth_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
        auth_response = auth_client.auth.sign_in_with_password({
            "email": account_email,
            "password": payload.password
        })
        session = auth_response.session
        if not session:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

        return UsernameLoginResponse(
            access_token=session.access_token,
            refresh_token=session.refresh_token,
            expires_in=session.expires_in,
            token_type=session.token_type
        )
    except HTTPException:
        raise
    except Exception as exc:
        # Return the same response for unknown users and bad credentials.
        # Log operational details server-side without exposing account data.
        logging.getLogger("ctf-arena.auth").exception("Username login failed: %s", exc)
        error_text = str(exc).lower()
        if "api key" in error_text or "supabase_anon_key" in error_text:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Username login is not configured on the server. Contact the administrator."
            )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")


@router.get("/me", response_model=UserProfileResponse)
async def get_my_profile(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Retrieves the current authenticated user profile, team affiliation, rank, and score.
    """
    supabase = get_supabase_client()
    user_id = current_user["id"]

    # Retrieve score and rank from leaderboard view if available
    total_score = 0
    rank = None
    team_name = None

    try:
        lb_res = supabase.table("user_leaderboard").select("score, rank, team_name").eq("user_id", user_id).limit(1).execute()
        if lb_res.data and len(lb_res.data) > 0:
            total_score = lb_res.data[0].get("score", 0)
            rank = lb_res.data[0].get("rank")
            team_name = lb_res.data[0].get("team_name")
        elif current_user.get("team_id"):
            t_res = supabase.table("teams").select("name").eq("id", current_user["team_id"]).limit(1).execute()
            if t_res.data and len(t_res.data) > 0:
                team_name = t_res.data[0].get("name")
    except Exception:
        pass

    return UserProfileResponse(
        id=current_user["id"],
        username=current_user["username"],
        display_name=current_user["display_name"],
        avatar_url=current_user.get("avatar_url"),
        role=current_user.get("role", "user"),
        team_id=current_user.get("team_id"),
        team_name=team_name,
        is_banned=current_user.get("is_banned", False),
        last_seen_at=current_user["last_seen_at"],
        total_score=total_score,
        rank=rank,
        created_at=current_user["created_at"]
    )


@router.post("/me/password", response_model=MessageResponse)
@limiter.limit("5/minute")
async def update_my_password(
    request: Request,
    payload: PasswordUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Changes the current account password without requiring the old password."""
    try:
        get_supabase_client().auth.admin.update_user_by_id(
            str(current_user["id"]),
            {"password": payload.new_password}
        )
        return MessageResponse(message="Password updated successfully")
    except Exception as exc:
        logging.getLogger("ctf-arena.auth").exception("Password update failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Password update failed")


@router.patch("/me", response_model=UserProfileResponse)
async def update_my_profile(
    payload: UserUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Updates the authenticated user's display name or avatar URL.
    """
    supabase = get_supabase_client()
    user_id = current_user["id"]

    updates = {}
    if payload.display_name is not None:
        updates["display_name"] = payload.display_name.strip()
    if payload.avatar_url is not None:
        updates["avatar_url"] = payload.avatar_url.strip()

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid update fields provided"
        )

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        res = supabase.table("profiles").update(updates).eq("id", user_id).execute()
        if not res.data or len(res.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found"
            )
        updated_user = res.data[0]
        updated_user["jwt_payload"] = current_user.get("jwt_payload", {})
        return await get_my_profile(current_user=updated_user)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database update failed: {str(exc)}"
        )


@router.post("/me/heartbeat", response_model=MessageResponse)
@limiter.limit("60/minute")
async def send_heartbeat(
    request: Request,
    payload: HeartbeatRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Competitor heartbeat endpoint. Pings every 60s while the browser tab is active.
    Updates last_seen_at, active lab, and active challenge.
    """
    supabase = get_supabase_client()
    user_id = current_user["id"]
    now_iso = datetime.now(timezone.utc).isoformat()

    updates = {
        "last_seen_at": now_iso,
        "current_room_id": str(payload.current_room_id) if payload.current_room_id else None,
        "current_challenge_id": str(payload.current_challenge_id) if payload.current_challenge_id else None
    }

    try:
        supabase.table("profiles").update(updates).eq("id", user_id).execute()

        # If user opened a lab, ensure a lab_progress record exists in 'in_progress' state
        if payload.current_room_id:
            room_id = str(payload.current_room_id)
            lp_res = supabase.table("lab_progress").select("id, status").eq("user_id", user_id).eq("room_id", room_id).limit(1).execute()
            if not lp_res.data:
                # Count total published challenges for this room
                ch_count_res = supabase.table("challenges").select("id", count="exact").eq("room_id", room_id).eq("is_published", True).execute()
                total_count = ch_count_res.count or 0

                supabase.table("lab_progress").insert({
                    "user_id": user_id,
                    "room_id": room_id,
                    "status": "in_progress",
                    "started_at": now_iso,
                    "last_activity_at": now_iso,
                    "solved_count": 0,
                    "total_count": total_count,
                    "points_earned": 0
                }).execute()

                # Log activity event
                supabase.table("activity_events").insert({
                    "user_id": user_id,
                    "team_id": current_user.get("team_id"),
                    "event_type": "lab_opened",
                    "room_id": room_id,
                    "metadata": {}
                }).execute()

        return MessageResponse(message="Heartbeat recorded successfully")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Heartbeat recording error: {str(exc)}"
        )


@router.get("/users/{username}", response_model=PublicUserProfileResponse)
async def get_public_user_profile(username: str):
    """
    Public competitor profile displaying team affiliation, total score, rank, and solve history.
    """
    supabase = get_supabase_client()

    try:
        user_res = supabase.table("profiles").select("*").eq("username", username).limit(1).execute()
        if not user_res.data or len(user_res.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User with username '{username}' was not found"
            )
        user = user_res.data[0]
        user_id = user["id"]

        # Fetch leaderboard stats
        total_score = 0
        rank = None
        team_name = None
        solves_count = 0

        lb_res = supabase.table("user_leaderboard").select("*").eq("user_id", user_id).limit(1).execute()
        if lb_res.data and len(lb_res.data) > 0:
            lb_row = lb_res.data[0]
            total_score = lb_row.get("score", 0)
            rank = lb_row.get("rank")
            team_name = lb_row.get("team_name")
            solves_count = lb_row.get("solves_count", 0)
        elif user.get("team_id"):
            t_res = supabase.table("teams").select("name").eq("id", user["team_id"]).limit(1).execute()
            if t_res.data and len(t_res.data) > 0:
                team_name = t_res.data[0].get("name")

        # Fetch solved challenges list
        solves_res = supabase.table("solves").select(
            "challenge_id, points_awarded, is_first_blood, created_at, challenges(title, category, room_id, rooms(title))"
        ).eq("user_id", user_id).order("created_at", desc=True).execute()

        solves_list: List[UserSolveItem] = []
        if solves_res.data:
            for s in solves_res.data:
                ch = s.get("challenges") or {}
                rm = ch.get("rooms") or {}
                solves_list.append(UserSolveItem(
                    challenge_id=s["challenge_id"],
                    challenge_title=ch.get("title", "Unknown Challenge"),
                    challenge_category=ch.get("category", "Misc"),
                    room_id=ch.get("room_id", "00000000-0000-0000-0000-000000000000"),
                    room_title=rm.get("title", "Unknown Lab"),
                    points_awarded=s["points_awarded"],
                    is_first_blood=s["is_first_blood"],
                    solved_at=s["created_at"]
                ))

        return PublicUserProfileResponse(
            id=user["id"],
            username=user["username"],
            display_name=user["display_name"],
            avatar_url=user.get("avatar_url"),
            role=user.get("role", "user"),
            team_id=user.get("team_id"),
            team_name=team_name,
            total_score=total_score,
            rank=rank,
            solves_count=solves_count,
            created_at=user["created_at"],
            solves=solves_list
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving user profile: {str(exc)}"
        )
