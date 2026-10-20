import secrets
from typing import Dict, Any, List, Optional
from uuid import UUID
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import require_admin
from app.db.client import get_supabase_client
from app.core.security import compute_flag_hash
from app.models.common import MessageResponse, CtfStatusResponse
from app.models.admin import (
    AdminRoomCreateRequest,
    AdminRoomUpdateRequest,
    AdminChallengeCreateRequest,
    AdminChallengeUpdateRequest,
    AdminHintCreateRequest,
    AdminHintUpdateRequest,
    AdminCtfSettingsUpdateRequest,
    AdminUserBanRequest,
    AdminUserCreateRequest,
    AdminUserResetPasswordRequest,
    AdminTeamCreateRequest
)

router = APIRouter(prefix="/admin", tags=["Admin Content Management"])


# ==============================================================================
# 1. Labs (Rooms) Management
# ==============================================================================
@router.post("/rooms", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def create_room(
    payload: AdminRoomCreateRequest,
    admin: Dict[str, Any] = Depends(require_admin)
):
    supabase = get_supabase_client()
    try:
        data = payload.model_dump()
        data["created_at"] = datetime.now(timezone.utc).isoformat()
        data["updated_at"] = data["created_at"]
        supabase.table("rooms").insert(data).execute()
        return MessageResponse(message=f"Lab '{payload.title}' created successfully")
    except Exception as exc:
        if "unique" in str(exc).lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A lab with this slug already exists")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Creation failed: {str(exc)}")


@router.patch("/rooms/{id}", response_model=MessageResponse)
async def update_room(
    id: UUID,
    payload: AdminRoomUpdateRequest,
    admin: Dict[str, Any] = Depends(require_admin)
):
    supabase = get_supabase_client()
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No update fields specified")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    try:
        supabase.table("rooms").update(updates).eq("id", str(id)).execute()
        return MessageResponse(message="Lab updated successfully")
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Update failed: {str(exc)}")


@router.delete("/rooms/{id}", response_model=MessageResponse)
async def delete_room(
    id: UUID,
    admin: Dict[str, Any] = Depends(require_admin)
):
    supabase = get_supabase_client()
    try:
        supabase.table("rooms").delete().eq("id", str(id)).execute()
        return MessageResponse(message="Lab deleted successfully")
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Delete failed: {str(exc)}")


# ==============================================================================
# 2. Challenges Management
# ==============================================================================
@router.get("/challenges")
async def list_all_admin_challenges(
    admin: Dict[str, Any] = Depends(require_admin)
):
    supabase = get_supabase_client()
    res = supabase.table("challenges").select(
        "id, room_id, title, category, points, difficulty, is_published, display_order, rooms(title)"
    ).order("display_order").execute()
    return res.data or []


@router.post("/challenges", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def create_challenge(
    payload: AdminChallengeCreateRequest,
    admin: Dict[str, Any] = Depends(require_admin)
):
    supabase = get_supabase_client()
    try:
        ch_data = payload.model_dump(exclude={"flag", "is_case_sensitive"})
        ch_data["room_id"] = str(payload.room_id)
        ch_data["created_at"] = datetime.now(timezone.utc).isoformat()
        ch_data["updated_at"] = ch_data["created_at"]

        # Insert challenge
        ch_res = supabase.table("challenges").insert(ch_data).execute()
        new_ch = ch_res.data[0]
        challenge_id = new_ch["id"]

        # Hash and store flag
        salt = secrets.token_hex(8)
        flag_hash = compute_flag_hash(payload.flag, salt, payload.is_case_sensitive)

        supabase.table("challenge_flags").insert({
            "challenge_id": challenge_id,
            "flag_hash": flag_hash,
            "salt": salt,
            "is_case_sensitive": payload.is_case_sensitive,
            "created_at": ch_data["created_at"]
        }).execute()

        return MessageResponse(message=f"Challenge '{payload.title}' initialized with hashed flag")
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Challenge creation failed: {str(exc)}")


@router.patch("/challenges/{id}", response_model=MessageResponse)
async def update_challenge(
    id: UUID,
    payload: AdminChallengeUpdateRequest,
    admin: Dict[str, Any] = Depends(require_admin)
):
    supabase = get_supabase_client()
    ch_id = str(id)
    updates = {k: v for k, v in payload.model_dump(exclude={"flag", "is_case_sensitive"}).items() if v is not None}
    if "room_id" in updates and updates["room_id"]:
        updates["room_id"] = str(updates["room_id"])

    try:
        if updates:
            updates["updated_at"] = datetime.now(timezone.utc).isoformat()
            supabase.table("challenges").update(updates).eq("id", ch_id).execute()

        # Rotate flag if new flag was provided
        if payload.flag:
            salt = secrets.token_hex(8)
            case_sens = payload.is_case_sensitive if payload.is_case_sensitive is not None else True
            flag_hash = compute_flag_hash(payload.flag, salt, case_sens)

            supabase.table("challenge_flags").upsert({
                "challenge_id": ch_id,
                "flag_hash": flag_hash,
                "salt": salt,
                "is_case_sensitive": case_sens
            }).execute()

        return MessageResponse(message="Challenge updated successfully")
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Update failed: {str(exc)}")


@router.delete("/challenges/{id}", response_model=MessageResponse)
async def delete_challenge(
    id: UUID,
    admin: Dict[str, Any] = Depends(require_admin)
):
    supabase = get_supabase_client()
    try:
        supabase.table("challenges").delete().eq("id", str(id)).execute()
        return MessageResponse(message="Challenge deleted successfully")
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Delete failed: {str(exc)}")


# ==============================================================================
# 3. Hints Management
# ==============================================================================
@router.post("/hints", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def create_hint(
    payload: AdminHintCreateRequest,
    admin: Dict[str, Any] = Depends(require_admin)
):
    supabase = get_supabase_client()
    data = payload.model_dump()
    data["challenge_id"] = str(payload.challenge_id)
    supabase.table("hints").insert(data).execute()
    return MessageResponse(message="Hint created successfully")


@router.delete("/hints/{id}", response_model=MessageResponse)
async def delete_hint(
    id: UUID,
    admin: Dict[str, Any] = Depends(require_admin)
):
    supabase = get_supabase_client()
    supabase.table("hints").delete().eq("id", str(id)).execute()
    return MessageResponse(message="Hint deleted successfully")


# ==============================================================================
# 4. Users Operations
# ==============================================================================
@router.get("/users")
async def list_admin_users(
    admin: Dict[str, Any] = Depends(require_admin)
):
    supabase = get_supabase_client()
    res = supabase.table("profiles").select(
        "id, username, display_name, role, is_banned, last_seen_at, created_at, teams(name)"
    ).order("created_at", desc=True).execute()
    return res.data or []


@router.post("/users/{id}/ban", response_model=MessageResponse)
async def set_user_ban_status(
    id: UUID,
    payload: AdminUserBanRequest,
    admin: Dict[str, Any] = Depends(require_admin)
):
    supabase = get_supabase_client()
    user_id = str(id)
    if user_id == str(admin["id"]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Admins cannot ban their own account")

    supabase.table("profiles").update({"is_banned": payload.is_banned}).eq("id", user_id).execute()
    status_label = "suspended" if payload.is_banned else "restored"
    return MessageResponse(message=f"User account has been {status_label}")


@router.post("/users", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def admin_create_user(
    payload: AdminUserCreateRequest,
    admin: Dict[str, Any] = Depends(require_admin)
):
    supabase = get_supabase_client()
    try:
        # Check username uniqueness in profiles
        existing = supabase.table("profiles").select("id").eq("username", payload.username).execute()
        if existing.data and len(existing.data) > 0:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username is already taken")

        # Create user via Supabase Auth Admin API
        user_attributes = {
            "email": payload.email,
            "password": payload.password,
            "email_confirm": True,
            "user_metadata": {
                "username": payload.username,
                "display_name": payload.display_name or payload.username
            }
        }
        res = supabase.auth.admin.create_user(user_attributes)
        new_user_id = str(res.user.id)

        # Upsert profile record with chosen role
        supabase.table("profiles").upsert({
            "id": new_user_id,
            "username": payload.username,
            "display_name": payload.display_name or payload.username,
            "role": payload.role
        }).execute()

        return MessageResponse(message=f"User '{payload.username}' created successfully")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create user: {str(exc)}")


@router.delete("/users/{id}", response_model=MessageResponse)
async def admin_delete_user(
    id: UUID,
    admin: Dict[str, Any] = Depends(require_admin)
):
    supabase = get_supabase_client()
    user_id = str(id)
    if user_id == str(admin["id"]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Admins cannot delete their own account")

    try:
        try:
            supabase.auth.admin.delete_user(user_id)
        except Exception:
            pass
        supabase.table("profiles").delete().eq("id", user_id).execute()
        return MessageResponse(message="User account deleted successfully")
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to delete user: {str(exc)}")


@router.post("/users/{id}/reset-password", response_model=MessageResponse)
async def admin_reset_user_password(
    id: UUID,
    payload: AdminUserResetPasswordRequest,
    admin: Dict[str, Any] = Depends(require_admin)
):
    supabase = get_supabase_client()
    user_id = str(id)
    try:
        supabase.auth.admin.update_user_by_id(user_id, {"password": payload.new_password})
        return MessageResponse(message="Password reset successfully")
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to reset password: {str(exc)}")


# ==============================================================================
# 5. Teams Operations
# ==============================================================================
@router.get("/teams")
async def list_admin_teams(
    admin: Dict[str, Any] = Depends(require_admin)
):
    supabase = get_supabase_client()
    res = supabase.table("teams").select(
        "id, name, invite_code, captain_id, created_at, profiles!fk_teams_captain(username)"
    ).order("created_at", desc=True).execute()
    return res.data or []


@router.post("/teams", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def admin_create_team(
    payload: AdminTeamCreateRequest,
    admin: Dict[str, Any] = Depends(require_admin)
):
    supabase = get_supabase_client()
    try:
        captain_id = None
        if payload.captain_username:
            user_res = supabase.table("profiles").select("id, team_id").eq("username", payload.captain_username).limit(1).execute()
            if not user_res.data:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User '{payload.captain_username}' not found")
            if user_res.data[0].get("team_id"):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"User '{payload.captain_username}' already belongs to a squad")
            captain_id = user_res.data[0]["id"]

        invite_code = secrets.token_hex(6)
        team_data = {
            "name": payload.name,
            "invite_code": invite_code,
            "captain_id": captain_id
        }
        res = supabase.table("teams").insert(team_data).execute()
        if captain_id and res.data and len(res.data) > 0:
            new_team_id = res.data[0]["id"]
            supabase.table("profiles").update({"team_id": new_team_id}).eq("id", captain_id).execute()

        return MessageResponse(message=f"Team '{payload.name}' established successfully")
    except HTTPException:
        raise
    except Exception as exc:
        if "unique" in str(exc).lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A team with this name already exists")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create team: {str(exc)}")


@router.post("/teams/{id}/reset-score", response_model=MessageResponse)
async def reset_team_score(
    id: UUID,
    admin: Dict[str, Any] = Depends(require_admin)
):
    supabase = get_supabase_client()
    team_id = str(id)
    # Clear solves associated with team
    supabase.table("solves").delete().eq("team_id", team_id).execute()
    return MessageResponse(message="Team score and solve history have been reset")


@router.delete("/teams/{id}", response_model=MessageResponse)
async def admin_delete_team(
    id: UUID,
    admin: Dict[str, Any] = Depends(require_admin)
):
    supabase = get_supabase_client()
    team_id = str(id)
    supabase.table("profiles").update({"team_id": None}).eq("team_id", team_id).execute()
    supabase.table("teams").delete().eq("id", team_id).execute()
    return MessageResponse(message="Team disbanded by administrator")


# ==============================================================================
# 6. Global Submissions Audit Log
# ==============================================================================
@router.get("/submissions")
async def list_admin_submissions(
    limit: int = Query(100, ge=1, le=500),
    admin: Dict[str, Any] = Depends(require_admin)
):
    supabase = get_supabase_client()
    res = supabase.table("submissions").select(
        "id, submitted_flag, is_correct, created_at, profiles(username), challenges(title), teams(name)"
    ).order("created_at", desc=True).limit(limit).execute()
    return res.data or []


# ==============================================================================
# 7. CTF Settings
# ==============================================================================
@router.get("/settings", response_model=CtfStatusResponse)
async def get_admin_settings(
    admin: Dict[str, Any] = Depends(require_admin)
):
    supabase = get_supabase_client()
    res = supabase.table("ctf_settings").select("*").eq("id", 1).limit(1).execute()
    row = res.data[0] if res.data else {}
    return CtfStatusResponse(
        id=row.get("id", 1),
        title=row.get("title", "CTF Arena"),
        start_time=row.get("start_time"),
        end_time=row.get("end_time"),
        is_active=row.get("is_active", True),
        freeze_leaderboard=row.get("freeze_leaderboard", False),
        dynamic_scoring=row.get("dynamic_scoring", False),
        max_team_size=row.get("max_team_size", 4),
        leaderboard_refresh_seconds=row.get("leaderboard_refresh_seconds", 15),
        server_time=datetime.now(timezone.utc)
    )


@router.patch("/settings", response_model=MessageResponse)
async def update_admin_settings(
    payload: AdminCtfSettingsUpdateRequest,
    admin: Dict[str, Any] = Depends(require_admin)
):
    supabase = get_supabase_client()
    updates = {}
    for k, v in payload.model_dump().items():
        if v is not None:
            if isinstance(v, datetime):
                updates[k] = v.isoformat()
            else:
                updates[k] = v

    if updates:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        supabase.table("ctf_settings").update(updates).eq("id", 1).execute()

    return MessageResponse(message="Competition settings saved successfully")
