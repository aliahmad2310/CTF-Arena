from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.models.site_content import AdminSiteContentUpdateRequest
from app.routers.site_content import get_site_content, update_site_content


class FakeSiteContentQuery:
    def __init__(self, database):
        self.database = database
        self.pending_upsert = None

    def select(self, _columns):
        return self

    def eq(self, _column, _value):
        return self

    def limit(self, _count):
        return self

    def upsert(self, row):
        self.pending_upsert = row
        return self

    def execute(self):
        if self.pending_upsert is not None:
            self.database.row = dict(self.pending_upsert)
        row = self.database.row
        return SimpleNamespace(data=[row] if row else [])


class FakeSiteContentDatabase:
    def __init__(self, row=None):
        self.row = row

    def table(self, _table_name):
        return FakeSiteContentQuery(self)


@pytest.mark.asyncio
async def test_public_site_content_returns_empty_defaults_when_uninitialized():
    database = FakeSiteContentDatabase()

    with patch("app.routers.site_content.get_supabase_client", return_value=database):
        response = await get_site_content()

    assert response.content == {}


@pytest.mark.asyncio
async def test_admin_site_content_update_merges_fields_and_records_admin():
    database = FakeSiteContentDatabase({
        "id": 1,
        "content": {"hero_heading": "Existing heading", "features_heading": "Existing section"},
    })
    admin_id = uuid4()
    payload = AdminSiteContentUpdateRequest(hero_heading="New heading")

    with patch("app.routers.site_content.get_supabase_client", return_value=database):
        response = await update_site_content(payload=payload, admin={"id": admin_id})

    assert response.content == {
        "hero_heading": "New heading",
        "features_heading": "Existing section",
    }
    assert database.row["updated_by"] == str(admin_id)
    assert database.row["updated_at"]


@pytest.mark.asyncio
async def test_admin_site_content_rejects_empty_update():
    with pytest.raises(HTTPException) as exc_info:
        await update_site_content(
            payload=AdminSiteContentUpdateRequest(),
            admin={"id": uuid4()},
        )

    assert exc_info.value.status_code == 422


def test_site_content_update_rejects_unknown_fields():
    with pytest.raises(ValidationError):
        AdminSiteContentUpdateRequest(unknown_text="not an editable homepage field")
