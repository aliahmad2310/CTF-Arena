import logging
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)


def insert_team_compatible(supabase, team_data: dict):
    """Insert a team and tolerate older PostgREST schemas without max_members."""
    try:
        return supabase.table("teams").insert(team_data).execute()
    except Exception as exc:
        error_text = str(exc).lower()
        is_missing_capacity_column = "max_members" in error_text and (
            "pgrst204" in error_text
            or "schema cache" in error_text
            or ("column" in error_text and "not find" in error_text)
            or ("column" in error_text and "does not exist" in error_text)
        )
        if not is_missing_capacity_column:
            raise

        logger.warning(
            "Database schema missing max_members column on teams table; falling back to standard insertion."
        )
        legacy_data = {key: value for key, value in team_data.items() if key != "max_members"}
        return supabase.table("teams").insert(legacy_data).execute()


def enforce_team_capacity(member_count: int, max_members: int) -> None:
    """Raise a conflict when adding another member would exceed team capacity."""
    if member_count >= max_members:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Team has reached its maximum size of {max_members} members.",
        )