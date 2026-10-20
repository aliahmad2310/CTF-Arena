from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any
from app.db.client import get_supabase_client
from app.core.config import settings
from app.models.monitor import AlertItem


def sanitize_csv_cell(value: Any) -> str:
    """
    Guards against CSV formula injection attacks by prepending a single quote
    to cells starting with dangerous trigger characters (=, +, -, @, tab, return).
    """
    if value is None:
        return ""
    str_val = str(value)
    if str_val and str_val[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{str_val}"
    return str_val


async def detect_monitoring_alerts() -> List[AlertItem]:
    """
    Evaluates system heuristics to identify stuck competitors, inactive registrants,
    and suspicious automated brute-force anomalies.
    """
    supabase = get_supabase_client()
    alerts: List[AlertItem] = []
    now = datetime.now(timezone.utc)
    stuck_delta = timedelta(minutes=settings.STUCK_THRESHOLD_MINUTES)
    burst_delta = timedelta(seconds=60)

    try:
        # 1. Stuck Competitors Heuristic:
        # Competitors currently in a lab with multiple wrong flag attempts but 0 solves
        active_window_delta = timedelta(minutes=settings.ACTIVE_WINDOW_MINUTES * 2)
        active_users_res = supabase.table("profiles").select(
            "id, username, current_room_id, last_seen_at, rooms(title)"
        ).not_.is_("current_room_id", "null").gte(
            "last_seen_at", (now - active_window_delta).isoformat()
        ).execute()

        for u in (active_users_res.data or []):
            user_id = u["id"]
            room_id = u["current_room_id"]
            room_title = (u.get("rooms") or {}).get("title", "Active Lab")

            # Check wrong attempts in that room in stuck window
            window_start = (now - stuck_delta).isoformat()
            sub_res = supabase.table("submissions").select(
                "id", count="exact"
            ).eq("user_id", user_id).eq("is_correct", False).gte("created_at", window_start).execute()

            wrong_count = sub_res.count or 0
            if wrong_count >= 3:
                # Check if user had any solve in that window
                solves_res = supabase.table("solves").select(
                    "id", count="exact"
                ).eq("user_id", user_id).gte("created_at", window_start).execute()

                if (solves_res.count or 0) == 0:
                    alerts.append(AlertItem(
                        alert_type="stuck",
                        severity="warning",
                        title=f"Competitor potentially stuck in {room_title}",
                        description=f"User '{u['username']}' has {wrong_count} failed submissions in {room_title} over the last {settings.STUCK_THRESHOLD_MINUTES} minutes without a solve.",
                        user_id=user_id,
                        username=u["username"],
                        room_title=room_title,
                        timestamp=now
                    ))

        # 2. Suspicious Brute-Force Heuristic:
        # Burst of > 5 submissions within 60 seconds
        recent_subs_res = supabase.table("submissions").select(
            "user_id, challenge_id, created_at, profiles(username), challenges(title)"
        ).gte("created_at", (now - burst_delta).isoformat()).execute()

        user_attempt_counts: Dict[str, List[Dict[str, Any]]] = {}
        for sub in (recent_subs_res.data or []):
            u_id = sub["user_id"]
            if u_id not in user_attempt_counts:
                user_attempt_counts[u_id] = []
            user_attempt_counts[u_id].append(sub)

        for u_id, attempts in user_attempt_counts.items():
            if len(attempts) >= 5:
                uname = (attempts[0].get("profiles") or {}).get("username", "Unknown")
                ch_title = (attempts[0].get("challenges") or {}).get("title", "Target Challenge")
                alerts.append(AlertItem(
                    alert_type="suspicious",
                    severity="danger",
                    title="Rapid submission burst detected",
                    description=f"Competitor '{uname}' submitted {len(attempts)} attempts in 60s against '{ch_title}'. Potential automated fuzzing or brute-force tool in use.",
                    user_id=u_id,
                    username=uname,
                    room_title=ch_title,
                    timestamp=now
                ))

        # 3. Inactive Registrants:
        # Registered > 24 hours ago, zero solves, zero lab engagement
        cutoff_24h = (now - timedelta(hours=24)).isoformat()
        inactive_res = supabase.table("profiles").select(
            "id, username, created_at"
        ).eq("role", "user").lte("created_at", cutoff_24h).limit(10).execute()

        for u in (inactive_res.data or []):
            u_id = u["id"]
            # Check if any progress exists
            lp_res = supabase.table("lab_progress").select("id", count="exact").eq("user_id", u_id).execute()
            if (lp_res.count or 0) == 0:
                alerts.append(AlertItem(
                    alert_type="inactive",
                    severity="info",
                    title="Registered user with zero activity",
                    description=f"Competitor '{u['username']}' registered over 24 hours ago but has never launched a lab or submitted a flag.",
                    user_id=u_id,
                    username=u["username"],
                    room_title=None,
                    timestamp=now
                ))

    except Exception as exc:
        print(f"Error evaluating monitoring alerts: {exc}")

    return alerts
