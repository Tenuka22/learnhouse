"""
Router tests for src/routers/question_sets/question_sets.py

Drives every question-set endpoint through an httpx AsyncClient against the
in-memory SQLite DB, exercising the router + service. Mirrors
test_media_router.py / test_media_authz.py's structure since question sets
reuse the exact same Folder/RBAC/ResourceAuthor machinery as media.
"""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from fastapi import FastAPI

from src.core.events.database import get_db_session
from src.db.users import AnonymousUser
from src.security.auth import get_current_user
from src.routers.question_sets.question_sets import router


def _build_app(db, user):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1/question_sets")
    app.dependency_overrides[get_db_session] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    return app


def _client_for(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.fixture
def app(db, admin_user):
    app = _build_app(db, admin_user)
    yield app
    app.dependency_overrides.clear()


@pytest.fixture
async def client(app):
    async with _client_for(app) as c:
        yield c
@pytest.fixture
def _bypass_rbac_and_webhooks():
    """Resource-level RBAC on create + the folder placement it triggers are
    stubbed; org-role-permission gating (the real target of the authz tests
    below) runs for real, exactly like test_media_router.py."""
    with patch(
        "src.services.question_sets.question_sets.check_resource_access",
        new_callable=AsyncMock,
    ), patch(
        "src.services.folders.folders.check_resource_access", new_callable=AsyncMock
    ), patch(
        "src.services.folders.folders.dispatch_webhooks", new_callable=AsyncMock
    ):
        yield


async def _make_question_set(client, org, title="Set", public=True, folder_uuid=None):
    payload = {"org_id": org.id, "title": title, "public": public}
    if folder_uuid:
        payload["folder_uuid"] = folder_uuid
    res = await client.post("/api/v1/question_sets/", json=payload)
    assert res.status_code == 200, res.text
    return res.json()


class TestQuestionSetsRouter:
    pytestmark = pytest.mark.usefixtures("_bypass_rbac_and_webhooks")
    async def test_create_at_root(self, client, org):
        body = await _make_question_set(client, org, "Chapter 1 Quiz")
        assert body["question_set_uuid"].startswith("question_set_")
        assert body["title"] == "Chapter 1 Quiz"
        assert body["items"] == []

    async def test_create_into_folder(self, client, org, folder):
        body = await _make_question_set(client, org, "Into folder", folder_uuid=folder.folder_uuid)
        assert body["question_set_uuid"].startswith("question_set_")

    async def test_get_question_set(self, client, org):
        created = await _make_question_set(client, org, "Gettable")
        res = await client.get(f"/api/v1/question_sets/{created['question_set_uuid']}")
        assert res.status_code == 200, res.text
        assert res.json()["title"] == "Gettable"

    async def test_list_for_org(self, client, org):
        await _make_question_set(client, org, "L1")
        await _make_question_set(client, org, "L2")
        res = await client.get(f"/api/v1/question_sets/org/{org.id}/page/1/limit/10")
        assert res.status_code == 200, res.text
        titles = {q["title"] for q in res.json()}
        assert {"L1", "L2"} <= titles

    async def test_update_question_set(self, client, org):
        created = await _make_question_set(client, org, "Before")
        res = await client.put(
            f"/api/v1/question_sets/{created['question_set_uuid']}",
            json={"title": "After", "public": False},
        )
        assert res.status_code == 200, res.text
        assert res.json()["title"] == "After"
        assert res.json()["public"] is False

    async def test_delete_question_set(self, client, org):
        created = await _make_question_set(client, org, "Doomed")
        res = await client.request(
            "DELETE", f"/api/v1/question_sets/{created['question_set_uuid']}"
        )
        assert res.status_code == 200, res.text
        gone = await client.get(f"/api/v1/question_sets/{created['question_set_uuid']}")
        assert gone.status_code == 404

    async def test_add_update_reorder_delete_questions(self, client, org):
        created = await _make_question_set(client, org, "Quiz")
        uuid = created["question_set_uuid"]

        res1 = await client.post(
            f"/api/v1/question_sets/{uuid}/questions",
            json={
                "question_text": "2+2=?",
                "response_type": "single",
                "options": {"choices": [
                    {"id": "a", "text": "4", "correct": True},
                    {"id": "b", "text": "5", "correct": False},
                ]},
            },
        )
        assert res1.status_code == 200, res1.text
        item1 = res1.json()["items"][0]
        assert item1["question_text"] == "2+2=?"
        assert item1["position"] == 0

        res2 = await client.post(
            f"/api/v1/question_sets/{uuid}/questions",
            json={
                "question_text": "Pick primes",
                "response_type": "multiple",
                "options": {"choices": [
                    {"id": "a", "text": "2", "correct": True},
                    {"id": "b", "text": "4", "correct": False},
                    {"id": "c", "text": "3", "correct": True},
                ]},
            },
        )
        assert res2.status_code == 200, res2.text
        body = res2.json()
        assert len(body["items"]) == 2
        item2_id = body["items"][1]["id"]
        assert body["items"][1]["position"] == 1

        # Invalid response_type rejected
        bad = await client.post(
            f"/api/v1/question_sets/{uuid}/questions",
            json={"question_text": "Bad", "response_type": "quadruple", "options": {}},
        )
        assert bad.status_code == 400

        # Update
        upd = await client.put(
            f"/api/v1/question_sets/{uuid}/questions/{item2_id}",
            json={"question_text": "Pick all primes"},
        )
        assert upd.status_code == 200, upd.text
        assert any(i["question_text"] == "Pick all primes" for i in upd.json()["items"])

        # Reorder: swap the two items
        item1_id = body["items"][0]["id"]
        reordered = await client.put(
            f"/api/v1/question_sets/{uuid}/questions/reorder",
            json={"item_ids": [item2_id, item1_id]},
        )
        assert reordered.status_code == 200, reordered.text
        positions = {i["id"]: i["position"] for i in reordered.json()["items"]}
        assert positions[item2_id] == 0
        assert positions[item1_id] == 1

        # Delete
        deleted = await client.request(
            "DELETE", f"/api/v1/question_sets/{uuid}/questions/{item1_id}"
        )
        assert deleted.status_code == 200, deleted.text
        assert len(deleted.json()["items"]) == 1


class TestQuestionSetsCreateOrgScoping:
    """Mirrors TestMediaCreateOrgScoping: the `question_set_x` RBAC placeholder
    has no org of its own, so create must pin to the caller-supplied org_id."""

    pytestmark = pytest.mark.usefixtures("_bypass_rbac_and_webhooks")

    async def test_member_can_create_in_their_own_org(self, client, org):
        res = await client.post(
            "/api/v1/question_sets/",
            json={"org_id": org.id, "title": "Mine", "public": True},
        )
        assert res.status_code == 200, res.text
        assert res.json()["org_id"] == org.id

    async def test_member_cannot_plant_question_set_in_another_org(self, client, other_org):
        res = await client.post(
            "/api/v1/question_sets/",
            json={"org_id": other_org.id, "title": "Planted", "public": True},
        )
        assert res.status_code == 403, res.text

    async def test_member_without_the_create_right_is_denied(self, db, org, regular_user):
        app = _build_app(db, regular_user)
        try:
            async with _client_for(app) as c:
                res = await c.post(
                    "/api/v1/question_sets/",
                    json={"org_id": org.id, "title": "NoRight", "public": True},
                )
        finally:
            app.dependency_overrides.clear()
        assert res.status_code == 403, res.text

    async def test_anonymous_cannot_create(self, db, org):
        app = _build_app(db, AnonymousUser())
        try:
            async with _client_for(app) as c:
                res = await c.post(
                    "/api/v1/question_sets/",
                    json={"org_id": org.id, "title": "Anon", "public": True},
                )
        finally:
            app.dependency_overrides.clear()
        assert res.status_code == 403, res.text


class TestQuestionSetsPublicVisibility:
    """Real (unstubbed) resource-level RBAC: public sets readable by anyone,
    private ones are not."""

    async def test_public_question_set_readable_anonymously(self, db, org, admin_user):
        app = _build_app(db, admin_user)
        try:
            async with _client_for(app) as c:
                with patch(
                    "src.services.question_sets.question_sets.check_resource_access",
                    new_callable=AsyncMock,
                ), patch(
                    "src.services.folders.folders.check_resource_access", new_callable=AsyncMock
                ), patch(
                    "src.services.folders.folders.dispatch_webhooks", new_callable=AsyncMock
                ):
                    created = await _make_question_set(c, org, "Public set", public=True)
        finally:
            app.dependency_overrides.clear()

        anon_app = FastAPI()
        anon_app.include_router(router, prefix="/api/v1/question_sets")
        anon_app.dependency_overrides[get_db_session] = lambda: db
        anon_app.dependency_overrides[get_current_user] = lambda: AnonymousUser()
        try:
            async with _client_for(anon_app) as c:
                res = await c.get(f"/api/v1/question_sets/{created['question_set_uuid']}")
        finally:
            anon_app.dependency_overrides.clear()
        assert res.status_code == 200, res.text

    async def test_private_question_set_not_readable_anonymously(self, db, org, admin_user):
        app = _build_app(db, admin_user)
        try:
            async with _client_for(app) as c:
                with patch(
                    "src.services.question_sets.question_sets.check_resource_access",
                    new_callable=AsyncMock,
                ), patch(
                    "src.services.folders.folders.check_resource_access", new_callable=AsyncMock
                ), patch(
                    "src.services.folders.folders.dispatch_webhooks", new_callable=AsyncMock
                ):
                    created = await _make_question_set(c, org, "Private set", public=False)
        finally:
            app.dependency_overrides.clear()

        anon_app = FastAPI()
        anon_app.include_router(router, prefix="/api/v1/question_sets")
        anon_app.dependency_overrides[get_db_session] = lambda: db
        anon_app.dependency_overrides[get_current_user] = lambda: AnonymousUser()
        try:
            async with _client_for(anon_app) as c:
                res = await c.get(f"/api/v1/question_sets/{created['question_set_uuid']}")
        finally:
            anon_app.dependency_overrides.clear()
        assert res.status_code == 403, res.text
