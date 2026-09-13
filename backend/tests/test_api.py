from __future__ import annotations

import asyncio
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy import select

from backend.config import get_settings
from backend.db.models import DocumentChunk
from backend.db.session import close_database, get_session_factory
from backend.main import app
from backend.services.ingestion import ingest_source

pytestmark = pytest.mark.anyio


async def test_health(client: httpx.AsyncClient) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "fixflow-api",
        "api": "ok",
        "database": "connected",
        "pgvector": "available",
    }


async def test_upload_ingestion_status_and_persistence(client: httpx.AsyncClient) -> None:
    response = await client.post(
        "/api/documents",
        files={
            "file": ("notes.md", b"# Notes\nThe asyncio event loop schedules coroutine callbacks.", "text/markdown"),
        },
    )
    assert response.status_code == 202
    source_id = response.json()["source_id"]
    assert response.json()["id"] == source_id
    assert response.json()["status"] == "uploaded"
    await ingest_source(UUID(source_id))
    await close_database()
    detail = (await client.get(f"/api/sources/{source_id}")).json()
    assert detail["status"] == "ready_for_embedding"
    assert detail["document_count"] == detail["chunk_count"] == 1
    assert (await client.get(f"/api/sources/{source_id}/status")).json() == detail
    assert (await client.get("/api/sources")).json() == [detail]
    async with get_session_factory()() as session:
        assert (await session.scalars(select(DocumentChunk))).one().embedding is None


async def test_deduplicate_concurrent_uploads(client: httpx.AsyncClient) -> None:
    responses = await asyncio.gather(
        *(
            client.post(
                "/api/documents",
                files={
                    "file": (f"notes-{index}.md", b"# Same document", "text/markdown"),
                },
            )
            for index in range(6)
        )
    )
    assert all(response.status_code == 202 for response in responses)
    assert len({response.json()["source_id"] for response in responses}) == 1
    assert len((await client.get("/api/sources")).json()) == 1
    assert len(list(get_settings().upload_dir.glob("*/*.md"))) == 1


async def test_debug_chat_and_saved_sessions_persist(client: httpx.AsyncClient) -> None:
    upload = await client.post(
        "/api/documents",
        data={
            "kind": "docs",
            "value": "asyncio.md",
            "content": "The asyncio event loop schedules coroutine callbacks.",
        },
    )
    await ingest_source(UUID(upload.json()["source_id"]))
    diagnosis = (await client.post("/api/debug", json={"error": "RuntimeError: no running event loop"})).json()
    assert diagnosis["sources"] == []
    reply = await client.post(
        "/api/chat",
        json={
            "session_id": diagnosis["sessionId"],
            "question": "How does the asyncio event loop work?",
        },
    )
    assert reply.status_code == 200
    assert "asyncio.md" in reply.json()["text"]
    saved = await client.post(
        "/api/saved",
        json={
            "problem": "Failure",
            "rootCause": "Cause",
            "technology": ["Python"],
            "fixSummary": "Fix",
            "sources": [],
        },
    )
    assert saved.status_code == 200
    await close_database()
    assert (await client.get(f"/api/sessions/{diagnosis['sessionId']}")).json() == diagnosis
    assert len((await client.get("/api/sessions")).json()) == 1
    assert (await client.get("/api/saved")).json() == [saved.json()]


async def test_invalid_requests_use_safe_errors(client: httpx.AsyncClient) -> None:
    assert (await client.post("/api/debug", json={})).status_code == 422
    assert (await client.post("/api/chat", json={"session_id": "missing", "question": "hello"})).status_code == 404
    assert (await client.post("/api/chat", json={"session_id": "x", "question": " "})).status_code == 422
    assert (await client.get(f"/api/sources/{uuid4()}")).status_code == 404
    assert (await client.get("/api/sources/not-uuid")).status_code == 422


async def test_upload_validation(client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    assert (await client.post("/api/documents", files={"file": ("payload.exe", b"bad")})).status_code == 415
    assert (await client.post("/api/documents", files={"file": ("empty.md", b"")})).status_code == 422
    assert (await client.post("/api/documents", data={"kind": "bad"})).status_code == 422
    assert (await client.post("/api/documents")).status_code == 400
    monkeypatch.setattr("backend.services.uploads.MAX_UPLOAD_BYTES", 10)
    assert (await client.post("/api/documents", files={"file": ("notes.md", b"x" * 11)})).status_code == 413


async def test_filename_permissions_and_long_names(client: httpx.AsyncClient) -> None:
    response = await client.post("/api/documents", files={"file": ("../../private.md", b"private content")})
    assert response.status_code == 202
    assert response.json()["name"] == "private.md"
    stored = next(get_settings().upload_dir.glob("*/private.md"))
    assert stored.stat().st_mode & 0o077 == 0
    assert stored.parent.stat().st_mode & 0o077 == 0
    response = await client.post("/api/documents", files={"file": (f"{'a' * 300}.md", b"long filename")})
    assert response.status_code == 202
    assert len(response.json()["name"]) == 255


async def test_url_registration_is_honest(client: httpx.AsyncClient) -> None:
    for value in ("file:///etc/passwd", "https://user:secret@example.com", "https://[", "https://x/" + "x" * 2048):
        assert (await client.post("/api/documents", data={"kind": "github", "value": value})).status_code == 422
    response = await client.post("/api/documents", data={"kind": "github", "value": "https://example.com"})
    assert response.status_code == 202
    assert response.json()["status"] == "failed"
    assert "not configured" in response.json()["error_message"]


async def test_cors(client: httpx.AsyncClient) -> None:
    response = await client.options(
        "/api/sources",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "access-control-allow-credentials" not in response.headers


async def test_lifespan_recovers_pending_job(client: httpx.AsyncClient) -> None:
    response = await client.post("/api/documents", files={"file": ("queued.md", b"# Queued for restart")})
    source_id = response.json()["source_id"]
    await close_database()
    async with app.router.lifespan_context(app):
        for _ in range(60):
            detail = (await client.get(f"/api/sources/{source_id}")).json()
            if detail["status"] == "ready_for_embedding":
                break
            await asyncio.sleep(0.1)
        assert detail["status"] == "ready_for_embedding"


async def test_health_unavailable_has_no_secrets(client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def unavailable() -> None:
        raise OSError("private-database-password")

    monkeypatch.setattr("backend.main.get_engine", unavailable)
    response = await client.get("/health")
    assert response.status_code == 503
    assert response.json()["database"] == "unavailable"
    assert "private" not in response.text
