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


def _admin_auth_client():
    """Create a project auth client with a configured public key or backend fallback."""
    api_key = settings.SUPABASE_ANON_KEY
    if not api_key or api_key.startswith("placeholder-"):
        api_key = get_supabase_client().supabase_key
    return create_client(settings.SUPABASE_URL, api_key)


@router.post("/auth/login", response_model=UsernameLoginResponse)
@limiter.limit("10/minute")
async def login_with_username(request: Request, payload: UsernameLoginRequest):
    """Authenticates a username/password pair without exposing the account email."""
    supabase = get_supabase_client()
    try:
        profile_res = supabase.table("profiles").select("id, is_banned").eq(
            "username", payload.username.lower()
        ).limit(1).execute()
        if not profile_res.data:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Username was not found in the Supabase project configured on the backend. Check its SUPABASE_URL and service-role key."
            )

        profile = profile_res.data[0]
        if profile.get("is_banned"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account has been suspended by system administrator")

        auth_user = supabase.auth.admin.get_user_by_id(str(profile["id"]))
        account_email = getattr(auth_user.user, "email", None)
        if not account_email:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="The profile has no linked Supabase Auth email. Verify that its profile ID matches the Auth user ID."
            )

        # Use the configured public key and a fresh client so concurrent sign-ins
        # cannot overwrite shared server-side auth state.
        auth_client = _admin_auth_client()
        try:
            auth_response = auth_client.auth.sign_in_with_password({
                "email": account_email,
                "password": payload.password
            })
        except Exception as exc:
            logging.getLogger("ctf-arena.auth").exception("Supabase rejected username login")
            message = str(exc).lower()
            if "email logins are disabled" in message or "email provider is disabled" in message:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Supabase Auth email/password provider is disabled. Enable Email login in Supabase Auth settings; users will still sign in here with usernames, and no email address is requested or sent."
                ) from exc
            if "invalid login credentials" in message or "invalid_credentials" in message:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Supabase Auth rejected the password for this account. Reset it for the exact Auth email returned by the admin profile, then try again."
                ) from exc
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Supabase Auth sign-in failed. Check backend Supabase URL and publishable/anon key in Vercel logs."
            ) from exc
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
        # Preserve a generic response for invalid credentials; report server
        # project/key mismatches as configuration failures instead of blaming users.
        logger = logging.getLogger("ctf-arena.auth")
        error_text = str(exc).lower()
        logger.exception("Username login failed")
        if any(marker in error_text for marker in ("api key", "supabase_anon_key", "invalid jwt", "invalid api key", "project not found", "invalid url", "name or service not known")):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Authentication service configuration is invalid. Check backend Supabase URL and keys."
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
