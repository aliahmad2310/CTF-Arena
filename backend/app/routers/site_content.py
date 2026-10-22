from datetime import datetime, timezone
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import require_admin
from app.db.client import get_supabase_client
from app.models.site_content import AdminSiteContentUpdateRequest, SiteContentResponse

router = APIRouter(tags=["Site Content"])


@router.get("/site-content", response_model=SiteContentResponse)
async def get_site_content() -> SiteContentResponse:
    """Return the public editable homepage text."""
    try:
        result = get_supabase_client().table("site_content").select("content").eq("id", 1).limit(1).execute()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Homepage content is temporarily unavailable.",
        ) from exc
    row = result.data[0] if result.data else {}
    return SiteContentResponse(content=row.get("content") or {})


@router.patch("/admin/site-content", response_model=SiteContentResponse)
async def update_site_content(
    payload: AdminSiteContentUpdateRequest,
    admin: Dict[str, Any] = Depends(require_admin),
) -> SiteContentResponse:
    """Update selected homepage copy. Only administrators may make changes."""
    updates = payload.model_dump(exclude_unset=True, exclude_none=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Provide at least one homepage field to update.")

    supabase = get_supabase_client()
    try:
        current_result = supabase.table("site_content").select("content").eq("id", 1).limit(1).execute()
        current_content: Dict[str, Any] = (current_result.data[0].get("content") or {}) if current_result.data else {}
        current_content.update(updates)
        result = supabase.table("site_content").upsert({
            "id": 1,
            "content": current_content,
            "updated_by": str(admin["id"]),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Homepage content could not be saved. Verify that the site_content database table exists.",
        ) from exc

    saved = result.data[0].get("content", current_content) if result.data else current_content
    return SiteContentResponse(content=saved)
