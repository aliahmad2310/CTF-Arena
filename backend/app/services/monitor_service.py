import io
import csv
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from uuid import UUID

from app.db.client import get_supabase_client
from app.core.config import settings
from app.services.alert_service import sanitize_csv_cell
from app.services.team_service import select_team_compatible
from app.models.monitor import (
    MonitorOverviewStats,
    LiveActiveUserItem,
    LiveEventItem,
    UserProgressSummaryItem,
    UserProgressListResponse,
    UserDetailResponse,
    AdminTeamDetailResponse,
    AdminTeamProgressMember,
    AdminTeamLabProgress,
    AdminTeamProgressListItem,
    AdminTeamProgressListResponse,
    UserDetailLabCard,
    UserDetailChallengeItem,
    LabDetailMetricsResponse,
    LabCohortUser,
    MatrixResponse,
    MatrixRow,
    MatrixCell
)


async def get_monitor_overview() -> MonitorOverviewStats:
    """
    Compiles high-level administrative telemetry: active counts, completions,
    failure rates, and chart aggregations.
    """
    supabase = get_supabase_client()
    now = datetime.now(timezone.utc)
    active_delta = timedelta(minutes=settings.ACTIVE_WINDOW_MINUTES)
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc).isoformat()

    # 1. Total users
    users_count_res = supabase.table("profiles").select("id", count="exact").eq("role", "user").execute()
    total_users = users_count_res.count or 0

    # 2. Active now
    active_res = supabase.table("profiles").select("id", count="exact").eq("role", "user").gte(
        "last_seen_at", (now - active_delta).isoformat()
    ).execute()
    active_now = active_res.count or 0

    # 3. Users currently in a lab
    in_lab_res = supabase.table("profiles").select("id", count="exact").eq("role", "user").not_.is_(
        "current_room_id", "null"
    ).gte("last_seen_at", (now - active_delta).isoformat()).execute()
    users_in_lab = in_lab_res.count or 0

    # 4. Labs completed today
    completed_today_res = supabase.table("lab_progress").select("id", count="exact").eq(
        "status", "completed"
    ).gte("completed_at", today_start).execute()
    labs_completed_today = completed_today_res.count or 0

    # 5. Average completion % across published labs
    avg_pct = 0.0
    summary_res = supabase.table("admin_user_summary").select("completion_percent").execute()
    if summary_res.data:
        percentages = [float(r.get("completion_percent", 0.0)) for r in summary_res.data]
        if percentages:
            avg_pct = round(sum(percentages) / len(percentages), 1)

    # 6. Total submissions and failure rate
    subs_res = supabase.table("submissions").select("is_correct").execute()
    total_submissions = len(subs_res.data or [])
    wrong_count = sum(1 for s in (subs_res.data or []) if not s["is_correct"])
    wrong_rate = round((wrong_count / total_submissions * 100), 1) if total_submissions > 0 else 0.0

    # 7. Status distribution across all user lab_progress
    dist_res = supabase.table("lab_progress").select("status").execute()
    status_counts = {"completed": 0, "in_progress": 0, "not_started": 0}
    for row in (dist_res.data or []):
        st = row.get("status")
        if st in status_counts:
            status_counts[st] += 1

    # 8. Completion rate per lab for bar chart
    lab_stats_res = supabase.table("admin_lab_stats").select(
        "room_id, title, completion_rate_percent, total_users_engaged, completed_count"
    ).order("display_order").execute()
    completion_rate_per_lab = lab_stats_res.data or []

    # 9. Completions per day over past 7 days
    completions_per_day = []
    for day_offset in range(6, -1, -1):
        d = now - timedelta(days=day_offset)
        d_str = d.strftime("%b %d")
        d_start = datetime(d.year, d.month, d.day, tzinfo=timezone.utc).isoformat()
        d_end = (datetime(d.year, d.month, d.day, tzinfo=timezone.utc) + timedelta(days=1)).isoformat()

        day_res = supabase.table("lab_progress").select("id", count="exact").eq(
            "status", "completed"
        ).gte("completed_at", d_start).lt("completed_at", d_end).execute()

        completions_per_day.append({
            "day": d_str,
            "count": day_res.count or 0
        })

    return MonitorOverviewStats(
        total_users=total_users,
        active_now=active_now,
        users_in_lab=users_in_lab,
        labs_completed_today=labs_completed_today,
        average_completion_percent=avg_pct,
        total_submissions=total_submissions,
        wrong_attempt_rate_percent=wrong_rate,
        status_distribution=status_counts,
        completions_per_day=completions_per_day,
        completion_rate_per_lab=completion_rate_per_lab
    )


async def get_live_users_and_events(
    since: Optional[datetime] = None,
    lab_id: Optional[UUID] = None,
    team_id: Optional[UUID] = None,
    event_type: Optional[str] = None,
) -> tuple[List[LiveActiveUserItem], List[LiveEventItem]]:
    """
    Gathers real-time online competitor grid and latest event stream for admin/live.html.
    """
    supabase = get_supabase_client()
    now = datetime.now(timezone.utc)
    active_delta = timedelta(minutes=settings.ACTIVE_WINDOW_MINUTES)

    # Query active users
    users_query = supabase.table("profiles").select(
        "id, username, display_name, current_room_id, current_challenge_id, last_seen_at, teams(name), rooms(title), challenges(title)"
    ).eq("role", "user").gte("last_seen_at", (now - active_delta).isoformat())
    if lab_id:
        users_query = users_query.eq("current_room_id", str(lab_id))
    if team_id:
        users_query = users_query.eq("team_id", str(team_id))
    users_res = users_query.order("last_seen_at", desc=True).execute()

    active_user_items: List[LiveActiveUserItem] = []
    for u in (users_res.data or []):
        room_title = (u.get("rooms") or {}).get("title")
        challenge_title = (u.get("challenges") or {}).get("title")
        team_name = (u.get("teams") or {}).get("name")

        active_user_items.append(LiveActiveUserItem(
            user_id=u["id"],
            username=u["username"],
            display_name=u["display_name"],
            team_name=team_name,
            current_room_id=u.get("current_room_id"),
            current_room_title=room_title,
            current_challenge_id=u.get("current_challenge_id"),
            current_challenge_title=challenge_title,
            last_seen_at=u["last_seen_at"],
            last_event_type=None
        ))

    # Query live activity feed
    events_query = supabase.table("admin_live_activity").select("*").limit(50)
    if since:
        events_query = events_query.gt("created_at", since.isoformat())
    if lab_id:
        events_query = events_query.eq("room_id", str(lab_id))
    if team_id:
        events_query = events_query.eq("team_id", str(team_id))
    if event_type:
        events_query = events_query.eq("event_type", event_type)

    events_res = events_query.order("created_at", desc=True).execute()
    event_items = [
        LiveEventItem(
            event_id=e["event_id"],
            event_type=e["event_type"],
            created_at=e["created_at"],
            user_id=e["user_id"],
            username=e["username"],
            display_name=e["display_name"],
            team_id=e.get("team_id"),
            team_name=e.get("team_name"),
            room_id=e.get("room_id"),
            room_title=e.get("room_title"),
            room_slug=e.get("room_slug"),
            challenge_id=e.get("challenge_id"),
            challenge_title=e.get("challenge_title"),
            metadata=e.get("metadata") or {}
        )
        for e in (events_res.data or [])
    ]

    return active_user_items, event_items


async def get_user_progress_directory(
    page: int = 1,
    page_size: int = 25,
    q: Optional[str] = None,
    team_id: Optional[UUID] = None,
    status_filter: Optional[str] = None,
    online_only: bool = False,
    sort_by: str = "registered_at",
    order_dir: str = "desc"
) -> UserProgressListResponse:
    """
    Powers the admin/progress.html directory with search, sorting, and pagination.
    """
    supabase = get_supabase_client()
    offset = (page - 1) * page_size

    query = supabase.table("admin_user_summary").select("*", count="exact")

    if q:
        clean_q = q.strip()
        query = query.or_(f"username.ilike.%{clean_q}%,display_name.ilike.%{clean_q}%")

    if team_id:
        query = query.eq("team_id", str(team_id))

    if online_only:
        query = query.eq("is_online", True)

    descending = (order_dir.lower() == "desc")
    res = query.order(sort_by, desc=descending).range(offset, offset + page_size - 1).execute()

    total = res.count or 0
    users = [
        UserProgressSummaryItem(
            user_id=r["user_id"],
            username=r["username"],
            display_name=r["display_name"],
            avatar_url=r.get("avatar_url"),
            role=r["role"],
            is_banned=r["is_banned"],
            team_id=r.get("team_id"),
            team_name=r.get("team_name"),
            last_seen_at=r["last_seen_at"],
            is_online=r.get("is_online", False),
            current_room_title=r.get("current_room_title"),
            current_challenge_title=r.get("current_challenge_title"),
            labs_completed=r.get("labs_completed", 0),
            labs_in_progress=r.get("labs_in_progress", 0),
            labs_not_started=r.get("labs_not_started", 0),
            total_labs=r.get("total_labs", 0),
            completion_percent=float(r.get("completion_percent", 0.0)),
            total_points=r.get("total_points", 0),
            registered_at=r["registered_at"]
        )
        for r in (res.data or [])
    ]

    return UserProgressListResponse(total=total, page=page, page_size=page_size, users=users)


async def get_team_progress_directory(page: int = 1, page_size: int = 50) -> AdminTeamProgressListResponse:
    """Return ranked teams with aggregated active and completed lab titles."""
    supabase = get_supabase_client()
    offset = (page - 1) * page_size
    standings = supabase.table("team_leaderboard").select("*", count="exact").order("rank").range(offset, offset + page_size - 1).execute()
    rows = standings.data or []
    team_ids = [row["team_id"] for row in rows]
    try:
        team_settings = supabase.table("teams").select("id, max_members").in_("id", team_ids).execute() if team_ids else None
    except Exception:
        team_settings = None
    capacity_by_team = {str(row["id"]): int(row.get("max_members", 4)) for row in (team_settings.data or [])} if team_settings and team_settings.data else {}
    profiles = supabase.table("profiles").select("id, team_id, role, last_seen_at, current_room_id, rooms(title)").in_("team_id", team_ids).eq("role", "user").execute() if team_ids else None
    member_rows = profiles.data or [] if profiles else []
    member_ids = [row["id"] for row in member_rows]
    progress_result = supabase.table("lab_progress").select("user_id, room_id, status, rooms(title)").in_("user_id", member_ids).execute() if member_ids else None
    progress_rows = progress_result.data or [] if progress_result else []

    progress_by_team: Dict[str, Dict[str, set[str]]] = {}
    profile_to_team = {str(profile["id"]): str(profile["team_id"]) for profile in member_rows}
    for progress in progress_rows:
        team_key = profile_to_team.get(str(progress["user_id"]))
        if not team_key:
            continue
        groups = progress_by_team.setdefault(team_key, {"current": set(), "completed": set()})
        title = (progress.get("rooms") or {}).get("title")
        if title and progress.get("status") == "completed":
            groups["completed"].add(title)
        elif title and progress.get("status") == "in_progress":
            groups["current"].add(title)

    profiles_by_team: Dict[str, List[Dict[str, Any]]] = {}
    for member in member_rows:
        profiles_by_team.setdefault(str(member["team_id"]), []).append(member)

    now = datetime.now(timezone.utc)
    active_before = now - timedelta(minutes=settings.ACTIVE_WINDOW_MINUTES)
    teams = []
    for row in rows:
        team_id = str(row["team_id"])
        members = profiles_by_team.get(team_id, [])
        activity = progress_by_team.get(team_id, {"current": set(), "completed": set()})
        live_lab_names = {
            (member.get("rooms") or {}).get("title")
            for member in members
            if member.get("current_room_id")
            and member.get("last_seen_at")
            and datetime.fromisoformat(member["last_seen_at"].replace("Z", "+00:00")) >= active_before
            and (member.get("rooms") or {}).get("title")
        }
        teams.append(AdminTeamProgressListItem(
            team_id=row["team_id"],
            team_name=row["team_name"],
            rank=row["rank"],
            score=row["score"],
            team_score=row["score"],
            solves_count=row["solves_count"],
            member_count=row.get("member_count", len(members)),
            max_members=capacity_by_team.get(team_id, 4),
            members_online=sum(1 for member in members if member.get("last_seen_at") and datetime.fromisoformat(member["last_seen_at"].replace("Z", "+00:00")) >= active_before),
            current_labs=sorted(live_lab_names),
            completed_labs=sorted(activity["completed"]),
        ))
    return AdminTeamProgressListResponse(total=standings.count or 0, page=page, page_size=page_size, teams=teams)


async def get_team_detail_audit(team_id: str) -> AdminTeamDetailResponse:
    """Return team roster activity and per-lab aggregate completion status."""
    supabase = get_supabase_client()
    team_result = select_team_compatible(supabase, team_id, "id, name, max_members")
    if not team_result.data:
        raise ValueError(f"Team {team_id} not found")
    team = team_result.data[0]
    leaderboard = supabase.table("team_leaderboard").select("rank, score").eq("team_id", team_id).limit(1).execute()
    rank_row = leaderboard.data[0] if leaderboard.data else {}
    members_result = supabase.table("profiles").select(
        "id, username, display_name, role, last_seen_at, current_room_id, current_challenge_id, rooms(title), challenges(title)"
    ).eq("team_id", team_id).eq("role", "user").execute()
    members_raw = members_result.data or []
    now = datetime.now(timezone.utc)
    active_cutoff = now - timedelta(minutes=settings.ACTIVE_WINDOW_MINUTES)
    members = [AdminTeamProgressMember(
        user_id=row["id"],
        username=row["username"],
        display_name=row["display_name"],
        is_online=bool(row.get("last_seen_at") and datetime.fromisoformat(row["last_seen_at"].replace("Z", "+00:00")) >= active_cutoff),
        current_room_id=row.get("current_room_id"),
        current_room_title=(row.get("rooms") or {}).get("title"),
        current_challenge_title=(row.get("challenges") or {}).get("title"),
    ) for row in members_raw]

    rooms_result = supabase.table("rooms").select("id, title").eq("is_published", True).order("display_order").execute()
    rooms = rooms_result.data or []
    user_ids = [row["id"] for row in members_raw]
    progress_result = supabase.table("lab_progress").select("user_id, room_id, status, solved_count, total_count, points_earned").in_("user_id", user_ids).execute() if user_ids else None
    progress_rows = progress_result.data or [] if progress_result else []
    challenge_counts_result = supabase.table("challenges").select("room_id").eq("is_published", True).execute()
    challenge_totals: Dict[str, int] = {}
    published_challenges_by_room: Dict[str, set[str]] = {}
    for challenge in challenge_counts_result.data or []:
        key = str(challenge["room_id"])
        challenge_totals[key] = challenge_totals.get(key, 0) + 1
        published_challenges_by_room.setdefault(key, set()).add(challenge["id"])

    solve_result = supabase.table("solves").select(
        "user_id, challenge_id, challenges!inner(room_id)"
    ).in_("user_id", user_ids).execute() if user_ids else None
    solved_by_user_room: Dict[tuple[str, str], set[str]] = {}
    for solve in (solve_result.data or []) if solve_result else []:
        room_id = str((solve.get("challenges") or {}).get("room_id", ""))
        solved_by_user_room.setdefault((str(solve["user_id"]), room_id), set()).add(str(solve["challenge_id"]))

    labs: List[AdminTeamLabProgress] = []
    for room in rooms:
        room_id = str(room["id"])
        rows_for_room = [row for row in progress_rows if str(row["room_id"]) == room_id]
        required_challenges = published_challenges_by_room.get(room_id, set())
        solved = sum(len(solved_by_user_room.get((str(member_id), room_id), set())) for member_id in user_ids)
        total = challenge_totals.get(room_id, 0) * len(members_raw)
        complete = bool(members_raw) and bool(required_challenges) and all(
            required_challenges.issubset(solved_by_user_room.get((str(member_id), room_id), set()))
            for member_id in user_ids
        )
        has_activity = bool(rows_for_room) or solved > 0 or any(
            row.get("current_room_id") == room["id"] for row in members_raw
        )
        status_value = "completed" if complete else "in_progress" if has_activity else "not_started"
        labs.append(AdminTeamLabProgress(
            room_id=room["id"],
            title=room["title"],
            status=status_value,
            solved_count=solved,
            total_count=total,
            points_earned=sum(int(row.get("points_earned", 0)) for row in rows_for_room),
        ))
    current_lab_names = sorted({
        (member.get("rooms") or {}).get("title")
        for member in members_raw
        if member.get("current_room_id")
        and member.get("last_seen_at")
        and datetime.fromisoformat(member["last_seen_at"].replace("Z", "+00:00")) >= active_cutoff
        and (member.get("rooms") or {}).get("title")
    })
    completed_lab_names = sorted({lab.title for lab in labs if lab.status == "completed"})
    return AdminTeamDetailResponse(
        team_id=team["id"],
        team_name=team["name"],
        rank=rank_row.get("rank"),
        score=rank_row.get("score", 0),
        member_count=len(members),
        max_members=team.get("max_members", 4),
        current_labs=current_lab_names,
        completed_labs=completed_lab_names,
        members=members,
        labs=labs,
    )


async def get_user_detail_audit(user_id: str) -> UserDetailResponse:
    """
    Compiles deep-dive telemetry on a single competitor for admin/user.html.
    """
    supabase = get_supabase_client()

    # Query summary record
    sum_res = supabase.table("admin_user_summary").select("*").eq("user_id", user_id).limit(1).execute()
    if not sum_res.data:
        raise ValueError(f"User {user_id} not found")

    user_summary = sum_res.data[0]

    # Query leaderboard rank
    lb_res = supabase.table("user_leaderboard").select("rank").eq("user_id", user_id).limit(1).execute()
    rank = lb_res.data[0].get("rank") if lb_res.data else None

    # Query published rooms
    rooms_res = supabase.table("rooms").select("*").eq("is_published", True).order("display_order").execute()
    rooms = rooms_res.data or []

    # Query user lab progress
    prog_res = supabase.table("lab_progress").select("*").eq("user_id", user_id).execute()
    prog_by_room = {p["room_id"]: p for p in (prog_res.data or [])}

    # Query all published challenges
    ch_res = supabase.table("challenges").select(
        "id, room_id, title, category, points, difficulty, display_order"
    ).eq("is_published", True).order("display_order").execute()
    ch_by_room: Dict[str, List[Dict[str, Any]]] = {}
    all_challenge_ids = []
    for c in (ch_res.data or []):
        r_id = c["room_id"]
        if r_id not in ch_by_room:
            ch_by_room[r_id] = []
        ch_by_room[r_id].append(c)
        all_challenge_ids.append(c["id"])

    # Query user solves
    solves_res = supabase.table("solves").select("challenge_id, created_at").eq("user_id", user_id).execute()
    solves_map = {s["challenge_id"]: s["created_at"] for s in (solves_res.data or [])}

    # Query submission attempt counts
    attempts_res = supabase.table("submissions").select("challenge_id").eq("user_id", user_id).execute()
    attempts_count: Dict[str, int] = {}
    for sub in (attempts_res.data or []):
        cid = sub["challenge_id"]
        attempts_count[cid] = attempts_count.get(cid, 0) + 1

    # Query hint unlocks
    hints_res = supabase.table("hint_unlocks").select("hint_id, hints(challenge_id)").eq("user_id", user_id).execute()
    hints_count: Dict[str, int] = {}
    for h in (hints_res.data or []):
        cid = (h.get("hints") or {}).get("challenge_id")
        if cid:
            hints_count[cid] = hints_count.get(cid, 0) + 1

    # Assemble lab cards
    lab_cards: List[UserDetailLabCard] = []
    unsolved_challenges_remaining = 0

    for r in rooms:
        r_id = r["id"]
        prog = prog_by_room.get(r_id, {})
        room_challenges = ch_by_room.get(r_id, [])

        ch_items: List[UserDetailChallengeItem] = []
        for c in room_challenges:
            c_id = c["id"]
            is_solved = (c_id in solves_map)
            if not is_solved:
                unsolved_challenges_remaining += 1

            ch_items.append(UserDetailChallengeItem(
                challenge_id=c_id,
                title=c["title"],
                category=c["category"],
                points=c["points"],
                is_solved=is_solved,
                attempts_count=attempts_count.get(c_id, 0),
                hints_used_count=hints_count.get(c_id, 0),
                solved_at=solves_map.get(c_id)
            ))

        started = prog.get("started_at")
        completed = prog.get("completed_at")
        duration = None
        if started and completed:
            d_start = datetime.fromisoformat(started.replace("Z", "+00:00"))
            d_end = datetime.fromisoformat(completed.replace("Z", "+00:00"))
            duration = int((d_end - d_start).total_seconds())

        lab_cards.append(UserDetailLabCard(
            room_id=r_id,
            title=r["title"],
            slug=r["slug"],
            difficulty=r["difficulty"],
            status=prog.get("status", "not_started"),
            solved_count=prog.get("solved_count", 0),
            total_count=len(room_challenges),
            points_earned=prog.get("points_earned", 0),
            started_at=started,
            completed_at=completed,
            duration_seconds=duration,
            challenges=ch_items
        ))

    # Recent user events
    events_res = supabase.table("admin_live_activity").select("*").eq("user_id", user_id).limit(10).execute()
    recent_activity = [
        LiveEventItem(
            event_id=e["event_id"],
            event_type=e["event_type"],
            created_at=e["created_at"],
            user_id=e["user_id"],
            username=e["username"],
            display_name=e["display_name"],
            team_id=e.get("team_id"),
            team_name=e.get("team_name"),
            room_id=e.get("room_id"),
            room_title=e.get("room_title"),
            room_slug=e.get("room_slug"),
            challenge_id=e.get("challenge_id"),
            challenge_title=e.get("challenge_title"),
            metadata=e.get("metadata") or {}
        )
        for e in (events_res.data or [])
    ]

    summary_model = UserProgressSummaryItem(
        user_id=user_summary["user_id"],
        username=user_summary["username"],
        display_name=user_summary["display_name"],
        avatar_url=user_summary.get("avatar_url"),
        role=user_summary["role"],
        is_banned=user_summary["is_banned"],
        team_id=user_summary.get("team_id"),
        team_name=user_summary.get("team_name"),
        last_seen_at=user_summary["last_seen_at"],
        is_online=user_summary.get("is_online", False),
        current_room_title=user_summary.get("current_room_title"),
        current_challenge_title=user_summary.get("current_challenge_title"),
        labs_completed=user_summary.get("labs_completed", 0),
        labs_in_progress=user_summary.get("labs_in_progress", 0),
        labs_not_started=user_summary.get("labs_not_started", 0),
        total_labs=user_summary.get("total_labs", 0),
        completion_percent=float(user_summary.get("completion_percent", 0.0)),
        total_points=user_summary.get("total_points", 0),
        registered_at=user_summary["registered_at"]
    )

    return UserDetailResponse(
        user=summary_model,
        rank=rank,
        labs=lab_cards,
        recent_activity=recent_activity,
        unsolved_challenges_remaining=unsolved_challenges_remaining
    )


async def get_lab_detail_metrics(room_id: str) -> LabDetailMetricsResponse:
    """
    Compiles 3 cohorts (Completed, In progress, Not started) and hardest challenges for admin/lab.html.
    """
    supabase = get_supabase_client()

    room_res = supabase.table("rooms").select("*").eq("id", room_id).limit(1).execute()
    if not room_res.data:
        raise ValueError(f"Lab {room_id} not found")
    room = room_res.data[0]

    # Query room stats view
    stats_res = supabase.table("admin_lab_stats").select("*").eq("room_id", room_id).limit(1).execute()
    stats = stats_res.data[0] if stats_res.data else {}

    # Query all progress for this room
    prog_res = supabase.table("lab_progress").select(
        "user_id, status, solved_count, total_count, started_at, completed_at, last_activity_at, profiles(username, display_name, teams(name))"
    ).eq("room_id", room_id).execute()

    completed_users: List[LabCohortUser] = []
    in_progress_users: List[LabCohortUser] = []
    engaged_user_ids = set()

    for p in (prog_res.data or []):
        uid = p["user_id"]
        engaged_user_ids.add(uid)
        prof = p.get("profiles") or {}
        tm = (prof.get("teams") or {}).get("name")

        duration = None
        if p.get("started_at") and p.get("completed_at"):
            d_start = datetime.fromisoformat(p["started_at"].replace("Z", "+00:00"))
            d_end = datetime.fromisoformat(p["completed_at"].replace("Z", "+00:00"))
            duration = int((d_end - d_start).total_seconds())

        cohort_item = LabCohortUser(
            user_id=uid,
            username=prof.get("username", "Unknown"),
            display_name=prof.get("display_name", "Operative"),
            team_name=tm,
            solved_count=p.get("solved_count", 0),
            total_count=p.get("total_count", 0),
            completed_at=p.get("completed_at"),
            duration_seconds=duration,
            last_activity_at=p.get("last_activity_at")
        )

        if p["status"] == "completed":
            completed_users.append(cohort_item)
        elif p["status"] == "in_progress":
            in_progress_users.append(cohort_item)

    # Sort completed users by fastest duration
    completed_users.sort(key=lambda x: (x.duration_seconds is None, x.duration_seconds))

    # Not started cohort (users who have no record for this room)
    all_users_res = supabase.table("profiles").select(
        "id, username, display_name, teams(name)"
    ).eq("role", "user").execute()

    not_started_users: List[LabCohortUser] = []
    for u in (all_users_res.data or []):
        if u["id"] not in engaged_user_ids:
            not_started_users.append(LabCohortUser(
                user_id=u["id"],
                username=u["username"],
                display_name=u["display_name"],
                team_name=(u.get("teams") or {}).get("name"),
                solved_count=0,
                total_count=stats.get("total_challenges", 0)
            ))

    # Query hardest challenges (lowest solves, highest wrong attempts)
    ch_res = supabase.table("challenges").select("id, title, category, points").eq("room_id", room_id).execute()
    challenges = ch_res.data or []
    ch_metrics = []

    for c in challenges:
        cid = c["id"]
        s_cnt_res = supabase.table("solves").select("id", count="exact").eq("challenge_id", cid).execute()
        solves = s_cnt_res.count or 0

        w_cnt_res = supabase.table("submissions").select("id", count="exact").eq("challenge_id", cid).eq("is_correct", False).execute()
        wrong_attempts = w_cnt_res.count or 0

        ch_metrics.append({
            "challenge_id": cid,
            "title": c["title"],
            "category": c["category"],
            "points": c["points"],
            "solves_count": solves,
            "wrong_attempts_count": wrong_attempts
        })

    ch_metrics.sort(key=lambda x: (x["solves_count"], -x["wrong_attempts_count"]))

    return LabDetailMetricsResponse(
        room_id=room["id"],
        title=room["title"],
        slug=room["slug"],
        difficulty=room["difficulty"],
        total_challenges=stats.get("total_challenges", 0),
        total_points=stats.get("total_points", 0),
        completion_rate_percent=float(stats.get("completion_rate_percent", 0.0)),
        avg_completion_time_seconds=stats.get("avg_completion_time_seconds", 0),
        completed_users=completed_users,
        in_progress_users=in_progress_users,
        not_started_users=not_started_users,
        hardest_challenges=ch_metrics
    )


async def get_matrix_heatmap(mode: str = "users") -> MatrixResponse:
    """
    Computes cross-tabulation heatmap data for admin/matrix.html.
    """
    supabase = get_supabase_client()

    # Query published labs
    rooms_res = supabase.table("rooms").select(
        "id, title, slug, display_order"
    ).eq("is_published", True).order("display_order").execute()
    rooms = rooms_res.data or []

    # Get challenge counts per room
    ch_res = supabase.table("challenges").select("room_id").eq("is_published", True).execute()
    room_ch_counts = {}
    for c in (ch_res.data or []):
        rid = c["room_id"]
        room_ch_counts[rid] = room_ch_counts.get(rid, 0) + 1

    rows: List[MatrixRow] = []

    if mode == "teams":
        teams_res = supabase.table("teams").select("id, name, captain_id").order("name").execute()
        teams = teams_res.data or []

        # Query team solves
        for t in teams:
            t_id = t["id"]
            cells: Dict[str, MatrixCell] = {}

            for r in rooms:
                r_id = r["id"]
                tot = room_ch_counts.get(r_id, 0)

                # Count distinct challenges in this room solved by team
                t_solves_res = supabase.table("solves").select(
                    "challenge_id, points_awarded, challenges!inner(room_id)"
                ).eq("team_id", t_id).eq("challenges.room_id", r_id).execute()

                solved_distinct = len({s["challenge_id"] for s in (t_solves_res.data or [])})
                pts = sum(s.get("points_awarded", 0) for s in (t_solves_res.data or []))

                st = "not_started"
                if solved_distinct >= tot and tot > 0:
                    st = "completed"
                elif solved_distinct > 0:
                    st = "in_progress"

                cells[r_id] = MatrixCell(
                    status=st,
                    solved_count=solved_distinct,
                    total_count=tot,
                    points_earned=pts
                )

            rows.append(MatrixRow(id=t_id, name=t["name"], subtext="Squad", cells=cells))

    else:
        # Default: Users mode
        users_res = supabase.table("profiles").select(
            "id, username, display_name, teams(name)"
        ).eq("role", "user").order("username").execute()
        users = users_res.data or []

        # Query lab progress records
        prog_res = supabase.table("lab_progress").select("*").execute()
        user_prog_map: Dict[str, Dict[str, Dict[str, Any]]] = {}
        for p in (prog_res.data or []):
            uid = p["user_id"]
            rid = p["room_id"]
            if uid not in user_prog_map:
                user_prog_map[uid] = {}
            user_prog_map[uid][rid] = p

        for u in users:
            u_id = u["id"]
            tm = (u.get("teams") or {}).get("name")
            cells = {}

            for r in rooms:
                r_id = r["id"]
                tot = room_ch_counts.get(r_id, 0)
                prog = user_prog_map.get(u_id, {}).get(r_id, {})

                slv = prog.get("solved_count", 0)
                st = prog.get("status", "not_started")
                if st == "completed" and tot > slv:
                    st = "in_progress"

                cells[r_id] = MatrixCell(
                    status=st,
                    solved_count=slv,
                    total_count=tot,
                    points_earned=prog.get("points_earned", 0)
                )

            rows.append(MatrixRow(
                id=u_id,
                name=u["username"],
                subtext=tm or "Solo",
                cells=cells
            ))

    return MatrixResponse(mode=mode, rooms=rooms, rows=rows)


def stream_users_csv(users: List[UserProgressSummaryItem]):
    """
    Generates sanitized CSV lines protecting against formula injection.
    """
    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow([
        "Username", "Display Name", "Squad", "Status",
        "Labs Completed", "Labs In Progress", "Labs Not Started",
        "Completion %", "Total Points", "Registered At"
    ])
    yield output.getvalue()
    output.seek(0)
    output.truncate(0)

    for u in users:
        writer.writerow([
            sanitize_csv_cell(u.username),
            sanitize_csv_cell(u.display_name),
            sanitize_csv_cell(u.team_name or "Solo"),
            sanitize_csv_cell("Online" if u.is_online else "Offline"),
            sanitize_csv_cell(u.labs_completed),
            sanitize_csv_cell(u.labs_in_progress),
            sanitize_csv_cell(u.labs_not_started),
            sanitize_csv_cell(u.completion_percent),
            sanitize_csv_cell(u.total_points),
            sanitize_csv_cell(u.registered_at.isoformat())
        ])
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)


def stream_matrix_csv(matrix: MatrixResponse):
    """
    Generates sanitized matrix heatmap CSV lines.
    """
    output = io.StringIO()
    writer = csv.writer(output)

    header = ["Entity Name", "Affiliation"]
    for r in matrix.rooms:
        header.append(f"{r['title']} Status")
        header.append(f"{r['title']} Solved")

    writer.writerow(header)
    yield output.getvalue()
    output.seek(0)
    output.truncate(0)

    for row in matrix.rows:
        line = [
            sanitize_csv_cell(row.name),
            sanitize_csv_cell(row.subtext or "")
        ]
        for r in matrix.rooms:
            cell = row.cells.get(r["id"])
            if cell:
                line.append(sanitize_csv_cell(cell.status))
                line.append(sanitize_csv_cell(f"{cell.solved_count}/{cell.total_count}"))
            else:
                line.append("not_started")
                line.append("0/0")

        writer.writerow(line)
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)
