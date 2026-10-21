import secrets
import re
import logging
from typing import Dict, Any, List, Optional
from uuid import UUID
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status

from app.core.deps import require_admin
from app.db.client import get_supabase_client
from app.core.security import compute_flag_hash
from app.services.team_service import enforce_team_capacity, insert_team_compatible
from app.models.common import MessageResponse, CtfStatusResponse
from app.models.admin import (
    AdminRoomCreateRequest,
    AdminRoomUpdateRequest,
    AdminChallengeCreateRequest,
    AdminChallengeCreatedResponse,
    AdminChallengeFileItem,
    AdminChallengeUpdateRequest,
    AdminHintCreateRequest,
    AdminHintUpdateRequest,
    AdminCtfSettingsUpdateRequest,
    AdminUserBanRequest,
    AdminUserCreateRequest,
    AdminUserListResponse,
    AdminUserResetPasswordRequest,
    AdminTeamListResponse,
    AdminTeamCreateRequest,
    AdminTeamCapacityRequest,
    AdminTeamMemberRequest
)

router = APIRouter(prefix="/admin", tags=["Admin Content Management"])
logger = logging.getLogger("ctf-arena.admin")

MAX_CHALLENGE_FILE_BYTES = 10 * 1024 * 1024
ALLOWED_CHALLENGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".txt", ".py", ".md", ".pdf", ".zip"}
CHALLENGE_FILE_CONTENT_TYPES = {
    ".png": {"image/png"},
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".gif": {"image/gif"},
    ".webp": {"image/webp"},
    ".txt": {"text/plain", "application/octet-stream"},
    ".py": {"text/x-python", "text/plain", "application/octet-stream"},
    ".md": {"text/markdown", "text/plain", "application/octet-stream"},
    ".pdf": {"application/pdf"},
    ".zip": {"application/zip", "application/x-zip-compressed", "application/octet-stream"},
}


def _safe_attachment_name(filename: str) -> str:
    """Return a basename only; never trust a client-provided storage path."""
    from pathlib import PurePath

    return PurePath((filename or "attachment").replace("\\", "/")).name[:180] or "attachment"


def _validate_attachment(filename: str, content_type: Optional[str]) -> str:
    """Validate the declared attachment type and return its normalized extension."""
    from pathlib import PurePath

    extension = PurePath(filename).suffix.lower()
    if extension not in ALLOWED_CHALLENGE_EXTENSIONS:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Unsupported attachment file type")
    if content_type not in CHALLENGE_FILE_CONTENT_TYPES[extension]:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Attachment content type does not match its file type")
    return extension


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
        challenge_rows = supabase.table("challenges").select("id").eq("room_id", str(id)).execute().data or []
        challenge_ids = [row["id"] for row in challenge_rows]
        if challenge_ids:
            file_rows = supabase.table("challenge_files").select("file_path").in_("challenge_id", challenge_ids).execute().data or []
            paths = [row["file_path"] for row in file_rows]
            if paths:
                supabase.storage.from_("challenge-files").remove(paths)
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


@router.post("/challenges", response_model=AdminChallengeCreatedResponse, status_code=status.HTTP_201_CREATED)
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

        return AdminChallengeCreatedResponse(
            message=f"Challenge '{payload.title}' initialized with hashed flag",
            challenge_id=challenge_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Challenge creation failed: {str(exc)}")


@router.post("/challenges/{id}/files", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def upload_challenge_attachment(
    id: UUID,
    file: UploadFile = File(...),
    admin: Dict[str, Any] = Depends(require_admin),
):
    """Store a bounded, allowlisted attachment as inert bytes in private Supabase Storage."""
    import uuid

    try:
        filename = _safe_attachment_name(file.filename or "attachment")
        extension = _validate_attachment(filename, file.content_type)
        content = await file.read(MAX_CHALLENGE_FILE_BYTES + 1)
        if not content:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attachment is empty")
        if len(content) > MAX_CHALLENGE_FILE_BYTES:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Attachment exceeds the 10 MiB limit")
    finally:
        await file.close()

    supabase = get_supabase_client()
    challenge = supabase.table("challenges").select("id").eq("id", str(id)).limit(1).execute()
    if not challenge.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Challenge not found")

    storage_path = f"{id}/{uuid.uuid4().hex}{extension}"
    safe_content_type = "application/octet-stream" if extension in {".py", ".txt", ".md", ".zip"} else file.content_type
    try:
        supabase.storage.from_("challenge-files").upload(
            storage_path,
            content,
            {"content-type": safe_content_type, "cache-control": "3600", "upsert": "false"},
        )
        supabase.table("challenge_files").insert({
            "challenge_id": str(id),
            "file_name": filename,
            "file_path": storage_path,
            "file_size": len(content),
        }).execute()
    except Exception as exc:
        try:
            supabase.storage.from_("challenge-files").remove([storage_path])
        except Exception:
            pass
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Attachment could not be saved") from exc
    return MessageResponse(message="Attachment uploaded as a non-executable file")


@router.get("/challenges/{id}/files", response_model=List[AdminChallengeFileItem])
async def list_challenge_attachments(id: UUID, admin: Dict[str, Any] = Depends(require_admin)):
    supabase = get_supabase_client()
    result = supabase.table("challenge_files").select("id, file_name, file_size").eq("challenge_id", str(id)).order("created_at").execute()
    return result.data or []


@router.delete("/challenges/{id}/files/{file_id}", response_model=MessageResponse)
async def delete_challenge_attachment(
    id: UUID,
    file_id: UUID,
    admin: Dict[str, Any] = Depends(require_admin),
):
    supabase = get_supabase_client()
    result = supabase.table("challenge_files").select("file_path").eq("id", str(file_id)).eq("challenge_id", str(id)).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment file not found")
    file_path = result.data[0]["file_path"]
    try:
        supabase.storage.from_("challenge-files").remove([file_path])
        supabase.table("challenge_files").delete().eq("id", str(file_id)).eq("challenge_id", str(id)).execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Attachment could not be deleted") from exc
    return MessageResponse(message="Attachment deleted")


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
        file_rows = supabase.table("challenge_files").select("file_path").eq("challenge_id", str(id)).execute().data or []
        paths = [row["file_path"] for row in file_rows]
        if paths:
            supabase.storage.from_("challenge-files").remove(paths)
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
@router.get("/users", response_model=AdminUserListResponse)
async def list_admin_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    q: Optional[str] = Query(None, max_length=80),
    unassigned: bool = Query(False),
    admin: Dict[str, Any] = Depends(require_admin)
):
    try:
        supabase = get_supabase_client()
        query = supabase.table("profiles").select(
            "id, username, display_name, role, is_banned, team_id, last_seen_at, created_at",
            count="exact",
        ).eq("role", "user").order("created_at", desc=True)
        if unassigned:
            query = query.is_("team_id", "null")
        if q and q.strip():
            search = re.sub(r"[^a-zA-Z0-9 _-]", "", q).strip()
            if search:
                query = query.or_(f"username.ilike.%{search}%,display_name.ilike.%{search}%")
        res = query.range((page - 1) * page_size, page * page_size - 1).execute()
        users = res.data or []

        team_ids = list({str(user["team_id"]) for user in users if user.get("team_id")})
        team_names = {}
        if team_ids:
            teams_res = supabase.table("teams").select("id, name").in_("id", team_ids).execute()
            team_names = {str(team["id"]): team["name"] for team in (teams_res.data or [])}
        for user in users:
            team_id = user.get("team_id")
            user["teams"] = {"name": team_names.get(str(team_id))} if team_id else None

        return {"items": users, "total": res.count or 0, "page": page, "page_size": page_size}
    except Exception as exc:
        logger.exception("Failed to list admin users (page=%s, page_size=%s)", page, page_size)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The user directory could not be loaded. Verify the database schema and backend Supabase connection.",
        ) from exc


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
        username = payload.username.lower()
        existing = supabase.table("profiles").select("id").eq("username", username).execute()
        if existing.data and len(existing.data) > 0:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username is already taken")

        if payload.team_id:
            team_id = str(payload.team_id)
            try:
                team_res = supabase.table("teams").select("id, max_members").eq("id", team_id).limit(1).execute()
            except Exception as exc:
                error_text = str(exc).lower()
                if "max_members" in error_text and ("pgrst204" in error_text or "schema cache" in error_text):
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Team capacity cannot be changed until the database max_members migration is applied.",
                    ) from exc
                raise
            if not team_res.data:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
            max_size = team_res.data[0].get("max_members", 4)
            members_res = supabase.table("profiles").select("id", count="exact").eq("team_id", team_id).execute()
            enforce_team_capacity(members_res.count or 0, max_size)

        # Create user via Supabase Auth Admin API
        user_attributes = {
            "email": payload.email.strip().lower(),
            "password": payload.password,
            "email_confirm": True,
            "phone_confirm": True,
            "user_metadata": {
                "username": username,
                "display_name": payload.display_name or username
            }
        }
        res = supabase.auth.admin.create_user(user_attributes)
        new_user_id = str(res.user.id)

        # Upsert profile record with chosen role
        try:
            supabase.table("profiles").upsert({
                "id": new_user_id,
                "username": username,
                "display_name": payload.display_name or username,
                "role": payload.role,
                "team_id": str(payload.team_id) if payload.team_id else None
            }).execute()
        except Exception:
            supabase.auth.admin.delete_user(new_user_id)
            raise

        return MessageResponse(message=f"User '{username}' created successfully")
    except HTTPException:
        raise
    except Exception as exc:
        if "already registered" in str(exc).lower() or "already exists" in str(exc).lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This email is already registered") from exc
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create user: {str(exc)}")


@router.post("/teams/{id}/members", response_model=MessageResponse, status_code=status.HTTP_200_OK)
async def admin_add_team_member(
    id: UUID,
    payload: AdminTeamMemberRequest,
    admin: Dict[str, Any] = Depends(require_admin)
):
    supabase = get_supabase_client()
    team_id = str(id)
    try:
        team_res = supabase.table("teams").select("id, max_members, name").eq("id", team_id).limit(1).execute()
        if not team_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

        user_res = supabase.table("profiles").select("id, team_id").ilike("username", payload.username).limit(1).execute()
        if not user_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        user = user_res.data[0]
        if user.get("team_id") and str(user["team_id"]) != team_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already belongs to another team")

        max_size = team_res.data[0].get("max_members", 4)
        members_res = supabase.table("profiles").select("id", count="exact").eq("team_id", team_id).execute()
        if not user.get("team_id"):
            enforce_team_capacity(members_res.count or 0, max_size)

        supabase.table("profiles").update({"team_id": team_id}).eq("id", str(user["id"])).execute()
        return MessageResponse(message=f"User '{payload.username}' added to the team")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to add team member: {str(exc)}")


@router.delete("/teams/{id}/members/{user_id}", response_model=MessageResponse)
async def admin_remove_team_member(
    id: UUID,
    user_id: UUID,
    admin: Dict[str, Any] = Depends(require_admin)
):
    supabase = get_supabase_client()
    try:
        member_res = supabase.table("profiles").select("id, username").eq("id", str(user_id)).eq("team_id", str(id)).limit(1).execute()
        if not member_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team member not found")

        team_res = supabase.table("teams").select("captain_id").eq("id", str(id)).limit(1).execute()
        if team_res.data and str(team_res.data[0].get("captain_id")) == str(user_id):
            replacement_res = supabase.table("profiles").select("id").eq("team_id", str(id)).neq("id", str(user_id)).limit(1).execute()
            replacement_id = replacement_res.data[0]["id"] if replacement_res.data else None
            supabase.table("teams").update({"captain_id": replacement_id}).eq("id", str(id)).execute()

        supabase.table("profiles").update({"team_id": None}).eq("id", str(user_id)).execute()
        return MessageResponse(message=f"User '{member_res.data[0]['username']}' removed from the team")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to remove team member: {str(exc)}")


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
        supabase.auth.admin.delete_user(user_id)
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
@router.get("/teams", response_model=AdminTeamListResponse)
async def list_admin_teams(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    q: Optional[str] = Query(None, max_length=80),
    admin: Dict[str, Any] = Depends(require_admin)
):
    stage = "initialize"
    try:
        supabase = get_supabase_client()
        stage = "query teams"
        query = supabase.table("teams").select(
            "id, name, captain_id, max_members, created_at",
            count="exact",
        ).order("created_at", desc=True)
        if q and q.strip():
            search = re.sub(r"[^a-zA-Z0-9 _-]", "", q).strip()
            if search:
                query = query.ilike("name", f"%{search}%")
        try:
            res = query.range((page - 1) * page_size, page * page_size - 1).execute()
        except Exception as query_error:
            error_text = str(query_error).lower()
            if "max_members" not in error_text or not any(
                marker in error_text for marker in ("column", "schema cache", "does not exist", "could not find")
            ):
                raise
            logger.warning("Teams table has no max_members column; using legacy capacity fallback")
            legacy_query = supabase.table("teams").select(
                "id, name, captain_id, created_at",
                count="exact",
            ).order("created_at", desc=True)
            if q and q.strip():
                search = re.sub(r"[^a-zA-Z0-9 _-]", "", q).strip()
                if search:
                    legacy_query = legacy_query.ilike("name", f"%{search}%")
            res = legacy_query.range((page - 1) * page_size, page * page_size - 1).execute()
        teams = res.data or []
        for team in teams:
            team.setdefault("max_members", 4)
        team_ids = [str(team["id"]) for team in teams]

        members_by_team: Dict[str, List[Dict[str, Any]]] = {}
        profiles_by_id: Dict[str, Dict[str, Any]] = {}
        if team_ids:
            stage = "query team members"
            profiles_res = supabase.table("profiles").select(
                "id, username, team_id"
            ).in_("team_id", team_ids).eq("role", "user").execute()
            for profile in profiles_res.data or []:
                profile_id = str(profile["id"])
                profiles_by_id[profile_id] = profile
                members_by_team.setdefault(str(profile["team_id"]), []).append({
                    "id": profile["id"],
                    "username": profile["username"]
                })

        missing_captains = [
            str(team["captain_id"])
            for team in teams
            if team.get("captain_id") and str(team["captain_id"]) not in profiles_by_id
        ]
        if missing_captains:
            stage = "query team captains"
            captain_res = supabase.table("profiles").select("id, username").in_("id", missing_captains).execute()
            profiles_by_id.update({str(profile["id"]): profile for profile in captain_res.data or []})

        for team in teams:
            captain = profiles_by_id.get(str(team.get("captain_id")))
            team["profiles"] = {"username": captain["username"]} if captain else None
            team["members"] = members_by_team.get(str(team["id"]), [])
        return {"items": teams, "total": res.count or 0, "page": page, "page_size": page_size}
    except Exception as exc:
        logger.exception("Failed to list admin teams during %s (page=%s, page_size=%s)", stage, page, page_size)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The team directory could not be loaded. Verify the database schema and backend Supabase connection.",
        ) from exc


@router.post("/teams", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def admin_create_team(
    payload: AdminTeamCreateRequest,
    admin: Dict[str, Any] = Depends(require_admin)
):
    supabase = get_supabase_client()
    try:
        captain_id = None
        if payload.captain_username:
            user_res = supabase.table("profiles").select("id, team_id").eq("username", payload.captain_username).eq("role", "user").limit(1).execute()
            if not user_res.data:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User '{payload.captain_username}' not found")
            if user_res.data[0].get("team_id"):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"User '{payload.captain_username}' already belongs to a squad")
            captain_id = user_res.data[0]["id"]

        invite_code = secrets.token_hex(6)
        team_data = {
            "name": payload.name,
            "invite_code": invite_code,
            "captain_id": captain_id,
            "max_members": payload.max_members,
        }
        res = insert_team_compatible(supabase, team_data)
        if captain_id and res.data and len(res.data) > 0:
            new_team_id = res.data[0]["id"]
            supabase.table("profiles").update({"team_id": new_team_id}).eq("id", captain_id).execute()

        return MessageResponse(message=f"Team '{payload.name}' established successfully")
    except HTTPException:
        raise
    except Exception as exc:
        if "custom team capacity" in str(exc).lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
        if "unique" in str(exc).lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A team with this name already exists")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create team: {str(exc)}")


@router.patch("/teams/{id}/capacity", response_model=MessageResponse)
async def update_team_capacity(
    id: UUID,
    payload: AdminTeamCapacityRequest,
    admin: Dict[str, Any] = Depends(require_admin),
):
    supabase = get_supabase_client()
    team_id = str(id)
    team = supabase.table("teams").select("id, max_members").eq("id", team_id).limit(1).execute()
    if not team.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    members = supabase.table("profiles").select("id", count="exact").eq("team_id", team_id).execute()
    if (members.count or 0) > payload.max_members:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Team currently has {members.count} members; capacity cannot be set below its current membership.",
        )
        try:
            supabase.table("teams").update({"max_members": payload.max_members, "updated_at": datetime.now(timezone.utc).isoformat()}).eq("id", team_id).execute()
        except Exception as exc:
            error_text = str(exc).lower()
            if "max_members" in error_text and ("pgrst204" in error_text or "schema cache" in error_text):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Team capacity cannot be changed until the database max_members migration is applied.",
                ) from exc
            raise
    return MessageResponse(message="Team capacity updated")


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
    patch_values = payload.model_dump(exclude_unset=True)
    candidate_start = patch_values.get("start_time")
    candidate_end = patch_values.get("end_time")
    if "start_time" not in patch_values or "end_time" not in patch_values:
        existing = supabase.table("ctf_settings").select("start_time, end_time").eq("id", 1).limit(1).execute()
        current = existing.data[0] if existing.data else {}
        if "start_time" not in patch_values:
            raw_start = current.get("start_time")
            candidate_start = datetime.fromisoformat(raw_start.replace("Z", "+00:00")) if raw_start else None
        if "end_time" not in patch_values:
            raw_end = current.get("end_time")
            candidate_end = datetime.fromisoformat(raw_end.replace("Z", "+00:00")) if raw_end else None
    if candidate_start and candidate_end and candidate_end <= candidate_start:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Competition end time must be after its start time")

    for k, v in patch_values.items():
        if v is not None:
            if isinstance(v, datetime):
                updates[k] = v.isoformat()
            else:
                updates[k] = v

    if updates:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        supabase.table("ctf_settings").update(updates).eq("id", 1).execute()

    return MessageResponse(message="Competition settings saved successfully")
