from unittest.mock import patch, MagicMock
import pytest
from app.models.admin import AdminRoomCreateRequest, AdminRoomUpdateRequest
from app.models.challenge import FlagSubmitRequest
from app.routers.rooms import submit_room_flag
from app.core.security import compute_flag_hash


def test_admin_room_models_support_points_and_flag():
    req = AdminRoomCreateRequest(
        title="SQL Injection Lab",
        slug="sql-injection-lab",
        difficulty="Easy",
        points=250,
        flag="CTF{sql_master_flag_123}"
    )
    assert req.points == 250
    assert req.flag == "CTF{sql_master_flag_123}"

    update_req = AdminRoomUpdateRequest(
        points=300,
        flag="CTF{new_flag_456}"
    )
    assert update_req.points == 300
    assert update_req.flag == "CTF{new_flag_456}"


@pytest.mark.asyncio
async def test_submit_room_flag_validation():
    # Verify that an unpublished lab raises 404 for normal user
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
        "id": "11111111-1111-1111-1111-111111111111",
        "slug": "test-lab",
        "title": "Test Lab",
        "is_published": False
    }]

    from starlette.requests import Request
    from fastapi import HTTPException

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/rooms/test-lab/submit",
        "headers": [],
        "client": ("127.0.0.1", 12345)
    }
    mock_request = Request(scope)
    current_user = {"id": "22222222-2222-2222-2222-222222222222", "role": "user"}

    with patch("app.routers.rooms.get_supabase_client", return_value=mock_supabase):
        with pytest.raises(HTTPException) as exc_info:
            await submit_room_flag(
                request=mock_request,
                slug="test-lab",
                payload=FlagSubmitRequest(flag="CTF{guess}"),
                current_user=current_user
            )
        assert "not currently published" in str(exc_info.value.detail).lower()
