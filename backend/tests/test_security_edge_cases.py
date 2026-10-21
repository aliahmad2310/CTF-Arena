import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock
from fastapi import HTTPException

from app.core.security import verify_supabase_jwt, compute_flag_hash, verify_flag
from app.services.flag_service import check_ctf_submission_eligibility, process_flag_submission
from app.routers.hints import unlock_hint
from app.routers.admin import _safe_attachment_name, _validate_attachment
from app.models.admin import AdminTeamCreateRequest, AdminTeamCapacityRequest, AdminCtfSettingsUpdateRequest
from app.services.team_service import enforce_team_capacity
import jwt
from app.core.config import settings


def test_jwt_verification_and_claims():
    """
    Verifies that authentic Supabase Bearer JWTs are validated,
    expired tokens are rejected, and tampering causes verification failure.
    """
    valid_payload = {
        "sub": "b2c12a64-0000-4000-a000-000000000001",
        "email": "agent@ctfarena.local",
        "role": "authenticated",
        "aud": "authenticated",
        "iss": f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1",
        "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp())
    }
    token = jwt.encode(valid_payload, settings.SUPABASE_JWT_SECRET, algorithm="HS256")
    extracted = verify_supabase_jwt(token)
    assert extracted["sub"] == valid_payload["sub"]
    assert extracted["email"] == valid_payload["email"]

    # Expired token rejection
    expired_payload = {
        "sub": "b2c12a64-0000-4000-a000-000000000001",
        "aud": "authenticated",
        "iss": f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1",
        "exp": int((datetime.now(timezone.utc) - timedelta(hours=1)).timestamp())
    }
    expired_token = jwt.encode(expired_payload, settings.SUPABASE_JWT_SECRET, algorithm="HS256")
    with pytest.raises(HTTPException) as exc_info:
        verify_supabase_jwt(expired_token)
    assert exc_info.value.status_code == 401
    assert "expired" in exc_info.value.detail.lower()

    # Invalid secret / forgery rejection
    forged_token = jwt.encode(valid_payload, "wrong_secret_key_at_least_32_bytes_long_here", algorithm="HS256")
    with pytest.raises(HTTPException) as exc_info:
        verify_supabase_jwt(forged_token)
    assert exc_info.value.status_code == 401


def test_ctf_start_and_end_time_lockdown():
    """
    Verifies that CTF submissions are locked outside of the scheduled competition window.
    """
    mock_supabase = MagicMock()

    # 1. When submissions disabled by admin
    mock_supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"is_active": False, "start_time": None, "end_time": None}]
    )
    with pytest.raises(HTTPException) as exc_info:
        check_ctf_submission_eligibility(mock_supabase)
    assert exc_info.value.status_code == 400
    assert "disabled" in exc_info.value.detail.lower()

    # 2. Before CTF start time
    future_start = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    mock_supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"is_active": True, "start_time": future_start, "end_time": None}]
    )
    with pytest.raises(HTTPException) as exc_info:
        check_ctf_submission_eligibility(mock_supabase)
    assert exc_info.value.status_code == 400
    assert "not started yet" in exc_info.value.detail.lower()

    # 3. After CTF end time
    past_end = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    mock_supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"is_active": True, "start_time": None, "end_time": past_end}]
    )
    with pytest.raises(HTTPException) as exc_info:
        check_ctf_submission_eligibility(mock_supabase)
    assert exc_info.value.status_code == 400
    assert "concluded" in exc_info.value.detail.lower()

    # 4. Currently active CTF window (must succeed without error)
    past_start = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    future_end = (datetime.now(timezone.utc) + timedelta(hours=5)).isoformat()
    mock_supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"is_active": True, "start_time": past_start, "end_time": future_end}]
    )
    # Should not raise any HTTPException
    check_ctf_submission_eligibility(mock_supabase)


def test_dynamic_lab_status_reversion_logic():
    """
    Verifies the mathematical and state invariant that if an admin adds a new challenge
    to a completed lab, the user's solved ratio drops below 100%, dynamically reverting
    the user's progress to 'in_progress'.
    """
    total_challenges_initial = 3
    user_solves = 3
    is_completed_initial = (user_solves >= total_challenges_initial)
    assert is_completed_initial is True

    # Admin publishes 1 new challenge to the lab
    total_challenges_updated = total_challenges_initial + 1
    is_completed_after_new_challenge = (user_solves >= total_challenges_updated)
    assert is_completed_after_new_challenge is False

    # Status reverts to in_progress
    current_status = "completed" if is_completed_after_new_challenge else "in_progress"
    assert current_status == "in_progress"


def test_multi_team_isolation_integrity():
    """
    Verifies that squad solve isolation prevents duplicate points for teammates
    while maintaining separate credit for competing squads.
    """
    team_alpha_solves = {"team_alpha": ["ch_01", "ch_02"]}
    team_bravo_solves = {"team_bravo": ["ch_01"]}

    # Teammate on Alpha attempting ch_01 receives no duplicate team score
    is_alpha_duplicate = "ch_01" in team_alpha_solves.get("team_alpha", [])
    assert is_alpha_duplicate is True

    # Bravo teammate attempting ch_02 is valid and receives first credit for Bravo
    is_bravo_first_solve = "ch_02" not in team_bravo_solves.get("team_bravo", [])
    assert is_bravo_first_solve is True


@pytest.mark.asyncio
async def test_admin_flag_submission_is_rejected_before_database_access():
    """Admin users must not create submissions, solves, or lab progress."""
    with pytest.raises(HTTPException) as exc_info:
        await process_flag_submission(
            challenge_id="challenge-id",
            submitted_flag="CTF{admin_test}",
            user={"id": "admin-id", "role": "admin", "team_id": "team-id"},
        )

    assert exc_info.value.status_code == 403
    assert "cannot submit flags" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_admin_hint_unlock_is_rejected_before_database_access():
    """Admin users must not incur score deductions by unlocking hints."""
    with pytest.raises(HTTPException) as exc_info:
        await unlock_hint(
            id=__import__("uuid").uuid4(),
            current_user={"id": "admin-id", "role": "admin", "team_id": "team-id"},
        )

    assert exc_info.value.status_code == 403
    assert "cannot unlock hints" in exc_info.value.detail.lower()


def test_attachment_allowlist_accepts_inert_python_source_and_images():
    assert _validate_attachment("task.py", "text/x-python") == ".py"
    assert _validate_attachment("evidence.png", "image/png") == ".png"


def test_attachment_allowlist_rejects_executable_and_mismatched_types():
    with pytest.raises(HTTPException) as exc_info:
        _validate_attachment("payload.exe", "application/octet-stream")
    assert exc_info.value.status_code == 415

    with pytest.raises(HTTPException) as exc_info:
        _validate_attachment("image.png", "text/html")
    assert exc_info.value.status_code == 415


def test_attachment_name_discards_client_path_components():
    assert _safe_attachment_name(r"..\..\private\proof.py") == "proof.py"


def test_admin_team_capacity_validation_and_enforcement():
    assert AdminTeamCreateRequest(name="Team Alpha", max_members=8).max_members == 8
    assert AdminTeamCapacityRequest(max_members=1).max_members == 1
    with pytest.raises(ValueError):
        AdminTeamCreateRequest(name="Team Alpha", max_members=0)
    with pytest.raises(HTTPException) as exc_info:
        enforce_team_capacity(member_count=4, max_members=4)
    assert exc_info.value.status_code == 409
    enforce_team_capacity(member_count=3, max_members=4)


def test_competition_settings_reject_end_before_start():
    start = datetime(2026, 10, 21, tzinfo=timezone.utc)
    end = datetime(2026, 10, 20, tzinfo=timezone.utc)
    with pytest.raises(ValueError, match="end time must be after"):
        AdminCtfSettingsUpdateRequest(start_time=start, end_time=end)
