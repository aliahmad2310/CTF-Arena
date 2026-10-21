import logging
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)


def is_missing_column_error(exc: Exception, column_name: str = "max_members") -> bool:
    """Check if an exception is due to a missing column in Postgres/PostgREST."""
    err = str(exc).lower()
    return column_name in err and (
        "pgrst204" in err
        or "schema cache" in err
        or "42703" in err
        or "does not exist" in err
        or "not find" in err
    )


def insert_team_compatible(supabase, team_data: dict):
    """Insert a team and tolerate older PostgREST schemas without max_members."""
    try:
        return supabase.table("teams").insert(team_data).execute()
    except Exception as exc:
        if not is_missing_column_error(exc, "max_members"):
            raise

        logger.warning(
            "Database schema missing max_members column on teams table; falling back to standard insertion."
        )
        legacy_data = {key: value for key, value in team_data.items() if key != "max_members"}
        return supabase.table("teams").insert(legacy_data).execute()


def select_team_compatible(supabase, team_id: str, columns: str = "id, name, max_members"):
    """Query a team by ID, gracefully omitting max_members if column does not exist."""
    try:
        return supabase.table("teams").select(columns).eq("id", team_id).limit(1).execute()
    except Exception as exc:
        if is_missing_column_error(exc, "max_members"):
            fallback_cols = ", ".join(col.strip() for col in columns.split(",") if col.strip() != "max_members")
            return supabase.table("teams").select(fallback_cols).eq("id", team_id).limit(1).execute()
        raise


def enforce_team_capacity(member_count: int, max_members: int) -> None:
    """Raise a conflict when adding another member would exceed team capacity."""
    if member_count >= max_members:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Team has reached its maximum size of {max_members} members.",
        )