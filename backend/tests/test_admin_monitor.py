import pytest
from uuid import uuid4
from datetime import datetime, timezone

from app.services.alert_service import sanitize_csv_cell
from app.models.monitor import (
    UserProgressSummaryItem,
    MatrixResponse,
    MatrixRow,
    MatrixCell
)
from app.services.monitor_service import stream_users_csv, stream_matrix_csv


def test_sanitize_csv_cell_formula_injection():
    """
    Verifies that dangerous formula initiation characters (=, +, -, @, tab, newline)
    are strictly escaped with a leading single quote to prevent DDE / CSV injection attacks.
    """
    assert sanitize_csv_cell("=1+1") == "'=1+1"
    assert sanitize_csv_cell("+cmd|'/c calc'!A1") == "'+cmd|'/c calc'!A1"
    assert sanitize_csv_cell("-5+2") == "'-5+2"
    assert sanitize_csv_cell("@SUM(A1:A10)") == "'@SUM(A1:A10)"
    assert sanitize_csv_cell("\tsneaky_tab") == "'\tsneaky_tab"
    assert sanitize_csv_cell("\rreturn_val") == "'\rreturn_val"

    # Benign strings must remain untouched
    assert sanitize_csv_cell("admin") == "admin"
    assert sanitize_csv_cell("hacker_01") == "hacker_01"
    assert sanitize_csv_cell(100) == "100"
    assert sanitize_csv_cell(None) == ""


def test_stream_users_csv_generation():
    """
    Verifies that the CSV stream generator produces valid CSV header and formatted rows
    with injection sanitization applied.
    """
    test_user = UserProgressSummaryItem(
        user_id=uuid4(),
        username="=malicious_user",
        display_name="Neo",
        role="user",
        is_banned=False,
        team_id=uuid4(),
        team_name="+RootSquad",
        registered_at=datetime.now(timezone.utc),
        last_seen_at=datetime.now(timezone.utc),
        is_online=True,
        labs_completed=2,
        labs_in_progress=1,
        labs_not_started=0,
        total_labs=3,
        completion_percent=66.67,
        total_points=800,
        current_room_title=None,
        current_challenge_title=None
    )

    csv_chunks = list(stream_users_csv([test_user]))
    assert len(csv_chunks) == 2

    header = csv_chunks[0]
    assert "Username,Display Name,Squad,Status" in header

    row = csv_chunks[1]
    assert "'=malicious_user" in row
    assert "'+RootSquad" in row
    assert "Online" in row
    assert "800" in row


def test_stream_matrix_csv_generation():
    """
    Verifies that the matrix CSV generator accurately exports rooms, entity cells, and statuses.
    """
    room_id = str(uuid4())
    matrix = MatrixResponse(
        mode="teams",
        rooms=[{"id": room_id, "title": "Web Exploitation", "slug": "web-exp"}],
        rows=[
            MatrixRow(
                id=uuid4(),
                name="@danger_team",
                subtext="Squad of 3",
                cells={
                    room_id: MatrixCell(
                        status="completed",
                        solved_count=3,
                        total_count=3,
                        points_earned=500
                    )
                }
            )
        ]
    )

    csv_chunks = list(stream_matrix_csv(matrix))
    assert len(csv_chunks) == 2

    header = csv_chunks[0]
    assert "Entity Name,Affiliation,Web Exploitation Status,Web Exploitation Solved" in header

    row = csv_chunks[1]
    assert "'@danger_team" in row
    assert "completed" in row
    assert "3/3" in row
