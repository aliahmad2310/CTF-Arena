from fastapi import HTTPException, status


def enforce_team_capacity(member_count: int, max_members: int) -> None:
    """Raise a conflict when adding another member would exceed team capacity."""
    if member_count >= max_members:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Team has reached its maximum size of {max_members} members.",
        )