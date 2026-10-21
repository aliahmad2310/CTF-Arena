from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.routers.admin import list_admin_teams, list_admin_users


class FakeQuery:
    def __init__(self, result, calls):
        self.result = result
        self.calls = calls
        self.count = len(result)

    def select(self, columns, **kwargs):
        self.calls.append(("select", columns, kwargs))
        return self

    def order(self, column, **kwargs):
        self.calls.append(("order", column, kwargs))
        return self

    def or_(self, expression):
        self.calls.append(("or", expression))
        return self

    def ilike(self, column, expression):
        self.calls.append(("ilike", column, expression))
        return self

    def is_(self, column, value):
        self.calls.append(("is", column, value))
        return self

    def range(self, start, end):
        self.calls.append(("range", start, end))
        return self

    def in_(self, column, values):
        self.calls.append(("in", column, values))
        return self

    def execute(self):
        return SimpleNamespace(data=self.result, count=self.count)


class FakeSupabase:
    def __init__(self, results):
        self.results = results
        self.calls = []

    def table(self, name):
        self.calls.append(("table", name))
        return FakeQuery(self.results[name], self.calls)


@pytest.mark.asyncio
async def test_admin_users_query_returns_page_and_resolves_team_names_separately():
    supabase = FakeSupabase({
        "profiles": [{"id": "user-1", "team_id": "team-1"}],
        "teams": [{"id": "team-1", "name": "Blue"}],
    })

    with patch("app.routers.admin.get_supabase_client", return_value=supabase):
        users = await list_admin_users(page=2, page_size=25, q="neo", admin={"role": "admin"})

    assert users == {
        "items": [{"id": "user-1", "team_id": "team-1", "teams": {"name": "Blue"}}],
        "total": 1,
        "page": 2,
        "page_size": 25,
    }
    assert all("teams!" not in call[1] for call in supabase.calls if call[0] == "select")
    assert any(call[:2] == ("table", "teams") for call in supabase.calls)
    assert ("range", 25, 49) in supabase.calls
    assert any(call[0] == "or" for call in supabase.calls)


@pytest.mark.asyncio
async def test_admin_teams_query_excludes_invite_code_and_scopes_member_query():
    team_id = "team-1"
    team = {
        "id": team_id,
        "name": "Blue Team",
        "captain_id": "user-1",
    }
    member = {"id": "user-1", "username": "captain", "team_id": team_id}
    supabase = FakeSupabase({"teams": [team], "profiles": [member]})

    with patch("app.routers.admin.get_supabase_client", return_value=supabase):
        teams = await list_admin_teams(page=1, page_size=25, q="Blue", admin={"role": "admin"})

    assert teams["items"][0]["members"] == [{"id": "user-1", "username": "captain"}]
    assert teams["items"][0]["profiles"] == {"username": "captain"}
    assert "invite_code" not in teams["items"][0]
    assert teams["total"] == 1
    assert ("range", 0, 24) in supabase.calls
    assert any(call[0] == "ilike" for call in supabase.calls)
    member_filter = next(call for call in supabase.calls if call[0] == "in")
    assert member_filter == ("in", "team_id", [team_id])
    select_calls = [call for call in supabase.calls if call[0] == "select"]
    assert all("profiles!" not in call[1] and "invite_code" not in call[1] for call in select_calls)


@pytest.mark.asyncio
async def test_admin_user_list_returns_actionable_service_error_when_database_fails():
    with patch("app.routers.admin.get_supabase_client", side_effect=RuntimeError("database unavailable")):
        with pytest.raises(Exception) as exc_info:
            await list_admin_users(page=1, page_size=25, admin={"role": "admin"})

    assert getattr(exc_info.value, "status_code", None) == 503
    assert "user directory could not be loaded" in exc_info.value.detail.lower()