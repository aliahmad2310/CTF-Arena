import secrets
from typing import Dict, Any, List
from uuid import UUID
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import get_current_user
from app.db.client import get_supabase_client
from app.services.team_service import enforce_team_capacity
from app.models.team import (
    TeamCreateRequest,
    TeamUpdateRequest,
    TeamJoinRequest,
    TeamDetailResponse,
    PublicTeamResponse,
    TeamMemberItem
)
from app.models.common import MessageResponse

router = APIRouter(prefix="/teams", tags=["Teams"])


def generate_invite_code() -> str:
    """Generates a secure, human-readable team invite code."""
    return f"INV-{secrets.token_hex(4).upper()}"


async def get_team_members_and_stats(supabase, team_id: str) -> tuple[List[TeamMemberItem], int, int | None]:
    """Helper to query members, member scores, team total score and leaderboard rank."""
    # Fetch team members from profiles
    members_res = supabase.table("profiles").select(
        "id, username, display_name, avatar_url, last_seen_at"
    ).eq("team_id", team_id).execute()

    members_data = members_res.data or []
    member_ids = [m["id"] for m in members_data]

    # Fetch team captain
    team_res = supabase.table("teams").select("captain_id").eq("id", team_id).limit(1).execute()
    captain_id = team_res.data[0].get("captain_id") if team_res.data else None

    # Fetch individual user scores from user_leaderboard view
    scores_by_user = {}
    solves_by_user = {}
    if member_ids:
        ul_res = supabase.table("user_leaderboard").select("user_id, score, solves_count").in_("user_id", member_ids).execute()
        if ul_res.data:
            for row in ul_res.data:
                scores_by_user[row["user_id"]] = row.get("score", 0)
                solves_by_user[row["user_id"]] = row.get("solves_count", 0)

    member_items: List[TeamMemberItem] = []
    for m in members_data:
        m_id = m["id"]
        member_items.append(TeamMemberItem(
            id=m_id,
            username=m["username"],
            display_name=m["display_name"],
            avatar_url=m.get("avatar_url"),
            is_captain=(str(m_id) == str(captain_id)),
            score=scores_by_user.get(m_id, 0),
            solves_count=solves_by_user.get(m_id, 0),
            last_seen_at=m["last_seen_at"]
        ))

    # Sort members by score descending
    member_items.sort(key=lambda x: x.score, reverse=True)

    # Fetch team score and rank from team_leaderboard view
    team_score = 0
    team_rank = None
    tl_res = supabase.table("team_leaderboard").select("score, rank").eq("team_id", team_id).limit(1).execute()
    if tl_res.data and len(tl_res.data) > 0:
        team_score = tl_res.data[0].get("score", 0)
        team_rank = tl_res.data[0].get("rank")

    return member_items, team_score, team_rank


@router.post("", response_model=TeamDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_team(
    payload: TeamCreateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Creates a new competition team.
    The creator is assigned as team captain. Enforces that the user is not already affiliated with a team.
    """
    supabase = get_supabase_client()
    user_id = current_user["id"]

    if current_user.get("team_id"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are already a member of a team. Please leave your current team first."
        )

    team_name = payload.name.strip()
    invite_code = generate_invite_code()

    try:
        settings_res = supabase.table("ctf_settings").select("max_team_size").eq("id", 1).limit(1).execute()
        default_team_capacity = settings_res.data[0].get("max_team_size", 4) if settings_res.data else 4
        # Create team record
        team_insert_res = supabase.table("teams").insert({
            "name": team_name,
            "invite_code": invite_code,
            "captain_id": user_id,
            "max_members": default_team_capacity,
        }).execute()

        if not team_insert_res.data or len(team_insert_res.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create team record"
            )

        new_team = team_insert_res.data[0]
        team_id = new_team["id"]

        # Update creator profile with team affiliation
        supabase.table("profiles").update({
            "team_id": team_id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", user_id).execute()

        max_size = new_team.get("max_members", 4)

        member_item = TeamMemberItem(
            id=user_id,
            username=current_user["username"],
            display_name=current_user["display_name"],
            avatar_url=current_user.get("avatar_url"),
            is_captain=True,
            score=0,
            solves_count=0,
            last_seen_at=current_user["last_seen_at"]
        )

        return TeamDetailResponse(
            id=new_team["id"],
            name=new_team["name"],
            invite_code=new_team["invite_code"],
            captain_id=user_id,
            score=0,
            rank=None,
            member_count=1,
            max_team_size=max_size,
            created_at=new_team["created_at"],
            members=[member_item]
        )
    except HTTPException:
        raise
    except Exception as exc:
        err_msg = str(exc)
        if "teams_name_key" in err_msg or "unique" in err_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A team named '{team_name}' already exists. Please choose a different name."
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error creating team: {err_msg}"
        )


@router.post("/join", response_model=TeamDetailResponse)
async def join_team(
    payload: TeamJoinRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Joins an existing competition team using a valid secret invite code.
    Enforces team capacity limit.
    """
    supabase = get_supabase_client()
    user_id = current_user["id"]

    if current_user.get("team_id"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are already a member of a team. Please leave your current team before joining another."
        )

    code = payload.invite_code.strip()

    try:
        # Resolve team by invite code
        team_res = supabase.table("teams").select("*").eq("invite_code", code).limit(1).execute()
        if not team_res.data or len(team_res.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invalid team invite code. Team not found."
            )

        team = team_res.data[0]
        team_id = team["id"]

        # Check team capacity
        count_res = supabase.table("profiles").select("id", count="exact").eq("team_id", team_id).execute()
        current_members_count = count_res.count or 0

        max_size = team.get("max_members", 4)
        try:
            enforce_team_capacity(current_members_count, max_size)
        except HTTPException as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Team '{team['name']}' has reached its maximum capacity of {max_size} members.",
            ) from exc

        # Associate competitor with team
        supabase.table("profiles").update({
            "team_id": team_id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", user_id).execute()

        members, team_score, team_rank = await get_team_members_and_stats(supabase, team_id)

        return TeamDetailResponse(
            id=team["id"],
            name=team["name"],
            invite_code=team["invite_code"],
            captain_id=team.get("captain_id"),
            score=team_score,
            rank=team_rank,
            member_count=len(members),
            max_team_size=max_size,
            created_at=team["created_at"],
            members=members
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error joining team: {str(exc)}"
        )


@router.post("/leave", response_model=MessageResponse)
async def leave_team(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Leaves current team.
    If the user is captain and other members remain, leadership must be transferred or disbanded.
    If the captain is the sole remaining member, the team is automatically disbanded.
    """
    supabase = get_supabase_client()
    user_id = current_user["id"]
    team_id = current_user.get("team_id")

    if not team_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are not affiliated with any team."
        )

    try:
        team_res = supabase.table("teams").select("captain_id").eq("id", team_id).limit(1).execute()
        if not team_res.data:
            supabase.table("profiles").update({"team_id": None}).eq("id", user_id).execute()
            return MessageResponse(message="Successfully left team")

        captain_id = team_res.data[0].get("captain_id")
        is_captain = (str(captain_id) == str(user_id))

        # Check total remaining members
        members_res = supabase.table("profiles").select("id").eq("team_id", team_id).execute()
        remaining = [m["id"] for m in (members_res.data or []) if str(m["id"]) != str(user_id)]

        if is_captain:
            if remaining:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="As team captain, you cannot abandon active teammates. Please disband the team or transfer leadership."
                )
            else:
                # Sole member leaving -> delete team
                supabase.table("profiles").update({"team_id": None}).eq("id", user_id).execute()
                supabase.table("teams").delete().eq("id", team_id).execute()
                return MessageResponse(message="Team disbanded and successfully exited")

        # Standard member leaving
        supabase.table("profiles").update({"team_id": None}).eq("id", user_id).execute()
        return MessageResponse(message="Successfully left team")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error leaving team: {str(exc)}"
        )


@router.get("/me", response_model=TeamDetailResponse)
async def get_my_team(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Fetches the authenticated competitor's team details, roster, and secret recruitment invite code.
    """
    supabase = get_supabase_client()
    team_id = current_user.get("team_id")

    if not team_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not currently affiliated with any team"
        )

    try:
        team_res = supabase.table("teams").select("*").eq("id", team_id).limit(1).execute()
        if not team_res.data or len(team_res.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team not found"
            )

        team = team_res.data[0]
        members, team_score, team_rank = await get_team_members_and_stats(supabase, team_id)

        max_size = team.get("max_members", 4)

        return TeamDetailResponse(
            id=team["id"],
            name=team["name"],
            invite_code=team["invite_code"],
            captain_id=team.get("captain_id"),
            score=team_score,
            rank=team_rank,
            member_count=len(members),
            max_team_size=max_size,
            created_at=team["created_at"],
            members=members
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving team details: {str(exc)}"
        )


@router.get("/{id}", response_model=PublicTeamResponse)
async def get_public_team(id: UUID):
    """
    Fetches public team profile, solves, and roster. Strictly omits secret invite codes.
    """
    supabase = get_supabase_client()
    team_id = str(id)

    try:
        team_res = supabase.table("teams").select("id, name, captain_id, max_members, created_at").eq("id", team_id).limit(1).execute()
        if not team_res.data or len(team_res.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Team with ID '{team_id}' not found"
            )

        team = team_res.data[0]
        members, team_score, team_rank = await get_team_members_and_stats(supabase, team_id)

        return PublicTeamResponse(
            id=team["id"],
            name=team["name"],
            captain_id=team.get("captain_id"),
            score=team_score,
            rank=team_rank,
            member_count=len(members),
            max_team_size=team.get("max_members", 4),
            created_at=team["created_at"],
            members=members
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving team profile: {str(exc)}"
        )


@router.patch("/{id}", response_model=MessageResponse)
async def update_team_name(
    id: UUID,
    payload: TeamUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Renames the team. Requires team captain privileges.
    """
    supabase = get_supabase_client()
    team_id = str(id)

    team_res = supabase.table("teams").select("captain_id").eq("id", team_id).limit(1).execute()
    if not team_res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    if str(team_res.data[0].get("captain_id")) != str(current_user["id"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the team captain can rename the team")

    new_name = payload.name.strip()
    try:
        supabase.table("teams").update({
            "name": new_name,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", team_id).execute()
        return MessageResponse(message=f"Team renamed to '{new_name}' successfully")
    except Exception as exc:
        if "unique" in str(exc).lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A team with this name already exists")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Update failed: {str(exc)}")


@router.post("/{id}/regenerate-invite", response_model=TeamDetailResponse)
async def regenerate_invite_code(
    id: UUID,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Generates a new recruitment invite code. Requires team captain privileges.
    """
    supabase = get_supabase_client()
    team_id = str(id)

    team_res = supabase.table("teams").select("captain_id").eq("id", team_id).limit(1).execute()
    if not team_res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    if str(team_res.data[0].get("captain_id")) != str(current_user["id"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the team captain can rotate invite codes")

    new_code = generate_invite_code()
    supabase.table("teams").update({
        "invite_code": new_code,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", team_id).execute()

    return await get_my_team(current_user)


@router.delete("/{id}/members/{user_id}", response_model=MessageResponse)
async def kick_team_member(
    id: UUID,
    user_id: UUID,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Removes a member from the team. Requires team captain privileges.
    Captains cannot kick themselves.
    """
    supabase = get_supabase_client()
    team_id = str(id)
    target_id = str(user_id)

    if target_id == str(current_user["id"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Captains cannot kick themselves. Use team leave or disband instead."
        )

    team_res = supabase.table("teams").select("captain_id").eq("id", team_id).limit(1).execute()
    if not team_res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    if str(team_res.data[0].get("captain_id")) != str(current_user["id"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the team captain can remove members")

    supabase.table("profiles").update({"team_id": None}).eq("id", target_id).eq("team_id", team_id).execute()
    return MessageResponse(message="Member removed from team successfully")


@router.delete("/{id}", response_model=MessageResponse)
async def disband_team(
    id: UUID,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Permanently disbands the team and removes all member associations. Requires captain privileges.
    """
    supabase = get_supabase_client()
    team_id = str(id)

    team_res = supabase.table("teams").select("captain_id").eq("id", team_id).limit(1).execute()
    if not team_res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    if str(team_res.data[0].get("captain_id")) != str(current_user["id"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the team captain can disband the team")

    # Remove all members from this team
    supabase.table("profiles").update({"team_id": None}).eq("team_id", team_id).execute()
    # Delete team row
    supabase.table("teams").delete().eq("id", team_id).execute()

    return MessageResponse(message="Team has been permanently disbanded")
