from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services import store


@pytest.fixture(autouse=True)
def reset_store() -> Iterator[None]:
    store._sessions.clear()
    store._sources.clear()
    store._saved.clear()
    yield
    store._sessions.clear()
    store._sources.clear()
    store._saved.clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_debug_chat_and_session(client: TestClient) -> None:
    response = client.post("/api/debug", json={"error": "RuntimeError: no running event loop"})
    assert response.status_code == 200
    diagnosis = response.json()
    assert diagnosis["sessionId"]
    assert diagnosis["sources"]

    chat = client.post(
        "/api/chat",
        json={"session_id": diagnosis["sessionId"], "question": "What should I change?"},
    )
    assert chat.status_code == 200
    assert chat.json()["role"] == "fixflow"

    session = client.get(f"/api/sessions/{diagnosis['sessionId']}")
    assert session.status_code == 200
    assert session.json()["sessionId"] == diagnosis["sessionId"]


def test_invalid_requests_use_safe_errors(client: TestClient) -> None:
    empty = client.post("/api/debug", json={})
    assert empty.status_code == 422
    assert empty.json()["error"]["code"] == "HTTP_ERROR"

    missing_chat = client.post(
        "/api/chat", json={"session_id": "missing", "question": "hello"}
    )
    assert missing_chat.status_code == 404
    assert missing_chat.json()["error"]["code"] == "HTTP_ERROR"

    invalid_chat = client.post("/api/chat", json={"session_id": "x", "question": ""})
    assert invalid_chat.status_code == 422
    assert invalid_chat.json()["error"]["code"] == "VALIDATION_ERROR"


def test_upload_validation_and_success(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    unsupported = client.post(
        "/api/documents",
        files={"file": ("payload.exe", b"bad", "application/octet-stream")},
        data={"kind": "upload"},
    )
    assert unsupported.status_code == 415

    empty = client.post(
        "/api/documents",
        files={"file": ("empty.md", b"", "text/markdown")},
        data={"kind": "upload"},
    )
    assert empty.status_code == 422

    monkeypatch.setattr("backend.api.routes.ingest_upload", lambda *_: None)
    uploaded = client.post(
        "/api/documents",
        files={"file": ("notes.md", b"# Notes\nUseful context", "text/markdown")},
        data={"kind": "upload"},
    )
    assert uploaded.status_code == 200
    assert uploaded.json()["status"] == "indexing"

    duplicate = client.post(
        "/api/documents",
        files={"file": ("notes.md", b"# Notes\nUseful context", "text/markdown")},
        data={"kind": "upload"},
    )
    assert duplicate.status_code == 409


def test_cors(client: TestClient) -> None:
    response = client.options(
        "/api/sessions",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
