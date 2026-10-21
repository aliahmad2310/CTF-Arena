from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.core.security import verify_supabase_jwt
from app.models.admin import AdminUserCreateRequest
from app.routers.auth import login_with_username
from app.models.user import UsernameLoginRequest


def test_username_login_returns_supabase_session_without_email():
    profile = {"id": "c1c2c3c4-0000-4000-a000-000000000001", "is_banned": False}
    session = MagicMock(
        access_token="access",
        refresh_token="refresh",
        expires_in=3600,
        token_type="bearer",
    )
    auth_response = MagicMock(session=session)
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [profile]
    mock_supabase.auth.admin.get_user_by_id.return_value.user.email = "operator@users.ctf-arena.invalid"

    with patch("app.routers.auth.get_supabase_client", return_value=mock_supabase), patch(
        "app.routers.auth.create_client"
    ) as create_client:
        create_client.return_value.auth.sign_in_with_password.return_value = auth_response
        result = pytest.run(asyncio_run(login_with_username(MagicMock(), UsernameLoginRequest(username="operator", password="correct horse"))))

    assert result.access_token == "access"
    assert result.refresh_token == "refresh"
    create_client.return_value.auth.sign_in_with_password.assert_called_once_with({
        "email": "operator@users.ctf-arena.invalid",
        "password": "correct horse",
    })


def asyncio_run(coro):
    import asyncio
    return asyncio.run(coro)


def test_username_login_rejects_unknown_username():
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
    with patch("app.routers.auth.get_supabase_client", return_value=mock_supabase):
        with pytest.raises(HTTPException) as exc:
            asyncio_run(login_with_username(MagicMock(), UsernameLoginRequest(username="missing", password="password123")))
    assert exc.value.status_code == 401


def test_admin_account_creation_request_has_no_email_field():
    request = AdminUserCreateRequest(username="new_user", password="password123")
    assert request.username == "new_user"
    assert "email" not in request.model_fields


def test_jwt_rejects_invalid_issuer_and_audience():
    payload = {
        "sub": "c1c2c3c4-0000-4000-a000-000000000001",
        "aud": "wrong-audience",
        "iss": "https://wrong-project.example/auth/v1",
        "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()),
    }
    token = jwt.encode(payload, settings.SUPABASE_JWT_SECRET, algorithm="HS256")
    with pytest.raises(HTTPException) as exc:
        verify_supabase_jwt(token)
    assert exc.value.status_code == 401