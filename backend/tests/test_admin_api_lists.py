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
async def test_admin_users_query_uses_explicit_team_relationship_and_returns_array():
    supabase = FakeSupabase({"profiles": [{"id": "user-1", "teams": {"name": "Blue"}}]})

    with patch("app.routers.admin.get_supabase_client", return_value=supabase):
        users = await list_admin_users(page=2, page_size=25, q="neo", admin={"role": "admin"})

    assert users == {
        "items": [{"id": "user-1", "teams": {"name": "Blue"}}],
        "total": 1,
        "page": 2,
        "page_size": 25,
    }
    assert any(
        call[0] == "select" and "teams!profiles_team_id_fkey(name)" in call[1]
        for call in supabase.calls
    )
    assert ("range", 25, 49) in supabase.calls
    assert any(call[0] == "or" for call in supabase.calls)


@pytest.mark.asyncio
async def test_admin_teams_query_excludes_invite_code_and_scopes_member_query():
    team_id = "team-1"
    team = {
        "id": team_id,
        "name": "Blue Team",
        "profiles": {"username": "captain"},
    }
    member = {"id": "user-1", "username": "captain", "team_id": team_id}
    supabase = FakeSupabase({"teams": [team], "profiles": [member]})

    with patch("app.routers.admin.get_supabase_client", return_value=supabase):
        teams = await list_admin_teams(page=1, page_size=25, q="Blue", admin={"role": "admin"})

    assert teams["items"][0]["members"] == [{"id": "user-1", "username": "captain"}]
    assert "invite_code" not in teams["items"][0]
    assert teams["total"] == 1
    assert ("range", 0, 24) in supabase.calls
    assert any(call[0] == "ilike" for call in supabase.calls)
    member_filter = next(call for call in supabase.calls if call[0] == "in")
    assert member_filter == ("in", "team_id", [team_id])
    team_select = next(call for call in supabase.calls if call[0] == "select")
    assert "invite_code" not in team_select[1]