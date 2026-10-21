from typing import Dict, Any, List, Optional
from uuid import UUID
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response

from app.core.deps import get_optional_current_user, get_current_user
from app.core.rate_limit import limiter
from app.db.client import get_supabase_client
from app.models.challenge import (
    ChallengeDetailResponse,
    HintSummaryItem,
    ChallengeFileItem,
    FlagSubmitRequest,
    FlagSubmitResponse
)
from app.services.flag_service import process_flag_submission

router = APIRouter(prefix="/challenges", tags=["Challenges"])


@router.get("/{id}", response_model=ChallengeDetailResponse)
async def get_challenge_details(
    id: UUID,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_current_user)
):
    """
    Retrieves full challenge details, Markdown description, attachments, and unlocked hints.
    Locks hint contents unless unlocked by the competitor or user has administrative privileges.
    """
    supabase = get_supabase_client()
    ch_id = str(id)
    user_id = current_user["id"] if current_user else None
    team_id = current_user.get("team_id") if current_user else None
    is_admin = bool(current_user and current_user.get("role") == "admin")

    try:
        # Query challenge record
        ch_res = supabase.table("challenges").select(
            "id, room_id, title, description, category, points, difficulty, external_link, is_published, rooms(slug, title, is_published)"
        ).eq("id", ch_id).limit(1).execute()

        if not ch_res.data or len(ch_res.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Challenge not found"
            )

        ch = ch_res.data[0]
        room_info = ch.get("rooms") or {}

        if not ch.get("is_published") and not is_admin:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Challenge is not currently published"
            )

        # Check user solves
        is_solved_by_user = False
        is_solved_by_team = False

        if user_id:
            u_solve_res = supabase.table("solves").select("id").eq("challenge_id", ch_id).eq("user_id", user_id).limit(1).execute()
            if u_solve_res.data and len(u_solve_res.data) > 0:
                is_solved_by_user = True

            if team_id:
                t_solve_res = supabase.table("solves").select("id").eq("challenge_id", ch_id).eq("team_id", team_id).limit(1).execute()
                if t_solve_res.data and len(t_solve_res.data) > 0:
                    is_solved_by_team = True

        # Total solves count
        solves_count_res = supabase.table("solves").select("id", count="exact").eq("challenge_id", ch_id).execute()
        solves_count = solves_count_res.count or 0

        # Query hints
        hints_res = supabase.table("hints").select("id, content, cost, display_order").eq("challenge_id", ch_id).order("display_order").execute()
        raw_hints = hints_res.data or []

        # Find unlocked hints for this user
        unlocked_hint_ids = set()
        if user_id:
            unlocked_res = supabase.table("hint_unlocks").select("hint_id").eq("user_id", user_id).execute()
            if unlocked_res.data:
                unlocked_hint_ids = {u["hint_id"] for u in unlocked_res.data}

        hint_items: List[HintSummaryItem] = []
        for h in raw_hints:
            h_id = h["id"]
            unlocked = (h_id in unlocked_hint_ids) or is_admin
            hint_items.append(HintSummaryItem(
                id=h_id,
                cost=h["cost"],
                display_order=h["display_order"],
                is_unlocked=unlocked,
                content=h["content"] if unlocked else None
            ))

        # Query files
        files_res = supabase.table("challenge_files").select("id, file_name, file_size, file_path").eq("challenge_id", ch_id).execute()
        raw_files = files_res.data or []

        file_items: List[ChallengeFileItem] = []
        for f in raw_files:
            file_items.append(ChallengeFileItem(
                id=f["id"],
                file_name=f["file_name"],
                file_size=f.get("file_size", 0),
                download_url=f"/challenges/{ch_id}/files/{f['id']}"
            ))

        # Log challenge opened event if authenticated
        if user_id:
            try:
                supabase.table("activity_events").insert({
                    "user_id": user_id,
                    "team_id": team_id,
                    "event_type": "challenge_opened",
                    "room_id": ch["room_id"],
                    "challenge_id": ch_id,
                    "metadata": {}
                }).execute()
            except Exception:
                pass

        return ChallengeDetailResponse(
            id=ch["id"],
            room_id=ch["room_id"],
            room_slug=room_info.get("slug", ""),
            room_title=room_info.get("title", ""),
            title=ch["title"],
            description=ch.get("description", ""),
            category=ch["category"],
            points=ch["points"],
            difficulty=ch["difficulty"],
            external_link=ch.get("external_link"),
            is_solved_by_user=is_solved_by_user,
            is_solved_by_team=is_solved_by_team,
            solves_count=solves_count,
            hints=hint_items,
            files=file_items
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving challenge details: {str(exc)}"
        )


@router.get("/{id}/files/{file_id}")
async def download_challenge_file(
    id: UUID,
    file_id: UUID,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Generates a secure download link for challenge artifacts stored in Supabase Storage.
    """
    supabase = get_supabase_client()
    f_res = supabase.table("challenge_files").select(
        "file_path, file_name, file_size, challenges!inner(is_published)"
    ).eq("id", str(file_id)).eq("challenge_id", str(id)).limit(1).execute()

    if not f_res.data or len(f_res.data) == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment file not found")

    file_row = f_res.data[0]
    if not file_row.get("challenges", {}).get("is_published") and current_user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment file not found")
    file_path = file_row["file_path"]

    try:
        file_bytes = supabase.storage.from_("challenge-files").download(file_path)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Attachment storage is unavailable") from exc

    file_name = file_row["file_name"].replace("\r", "").replace("\n", "").replace('"', "")
    return Response(
        content=file_bytes,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{file_name}"',
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )


@router.post("/{id}/submit", response_model=FlagSubmitResponse)
@limiter.limit("10/minute")
async def submit_challenge_flag(
    request: Request,
    id: UUID,
    payload: FlagSubmitRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Submits and validates a flag string. Rate limited to 10 attempts per minute per user/IP.
    Awards points, calculates First Blood, updates lab progress, and checks for 100% lab completion.
    """
    return await process_flag_submission(
        challenge_id=str(id),
        submitted_flag=payload.flag,
        user=current_user
    )
