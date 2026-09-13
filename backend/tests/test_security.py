from __future__ import annotations

import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.api.routes import ingest_upload, python_executable
from backend.main import configured_origins
from backend.services import store


@pytest.mark.parametrize(
    "origin",
    ["*", "file:///tmp", "https://user:secret@example.com", "https://example.com/path"],
)
def test_configured_origins_rejects_unsafe_values(origin: str) -> None:
    with pytest.raises(ValueError):
        configured_origins(origin)


def test_configured_origins_normalizes_and_deduplicates() -> None:
    assert configured_origins("https://example.com/, https://example.com") == ["https://example.com"]


def test_python_executable_rejects_control_characters(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FIXFLOW_PYTHON", "python3\nmalicious")
    with pytest.raises(ValueError):
        python_executable()


def test_python_executable_preserves_virtual_environment_symlink(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    executable = tmp_path / "venv-python"
    executable.symlink_to(sys.executable)
    monkeypatch.setenv("FIXFLOW_PYTHON", str(executable))

    assert python_executable() == str(executable)


def test_source_hash_reservation_is_atomic() -> None:
    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(store.reserve_source_hash, ["same-hash"] * 20))
    assert results.count(True) == 1


def test_remote_source_and_request_validation(client: TestClient) -> None:
    invalid_url = client.post(
        "/api/documents",
        data={"kind": "github", "value": "file:///etc/passwd"},
    )
    assert invalid_url.status_code == 422

    credentials = client.post(
        "/api/documents",
        data={"kind": "github", "value": "https://user:secret@example.com/repo"},
    )
    assert credentials.status_code == 422

    oversized_url = client.post(
        "/api/documents",
        data={"kind": "github", "value": f"https://example.com/{'x' * 2048}"},
    )
    assert oversized_url.status_code == 422

    oversized = client.post("/api/debug", json={"error": "x" * 200_001})
    assert oversized.status_code == 422
    assert oversized.json()["error"]["code"] == "VALIDATION_ERROR"


def test_uploaded_file_uses_private_permissions(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    upload_root = tmp_path / "uploads"
    monkeypatch.setattr(store, "UPLOAD_DIR", upload_root)
    monkeypatch.setattr("backend.api.routes.ingest_upload", lambda *_: None)

    response = client.post(
        "/api/documents",
        files={"file": ("private.md", b"private content", "text/markdown")},
        data={"kind": "upload"},
    )

    assert response.status_code == 200
    stored_file = next(upload_root.glob("*/private.md"))
    assert stored_file.stat().st_mode & 0o077 == 0


def test_unavailable_ingestion_runtime_releases_document_hash(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    def unavailable_runtime() -> str:
        raise ValueError("unavailable")

    digest = "retryable-hash"
    assert store.reserve_source_hash(digest)
    monkeypatch.setattr("backend.api.routes.python_executable", unavailable_runtime)

    ingest_upload("missing-source", tmp_path, digest)

    assert store.reserve_source_hash(digest)
