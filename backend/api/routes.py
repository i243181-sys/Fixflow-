from __future__ import annotations

import hashlib
import logging
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from threading import Lock
from typing import Annotated, cast
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile

from backend.schemas.models import (
    ChatMessage,
    ChatRequest,
    DebugRequest,
    Diagnosis,
    KnowledgeKind,
    KnowledgeSource,
    SavedSolution,
    SaveRequest,
    SessionSummary,
)
from backend.services import store

router = APIRouter()
logger = logging.getLogger(__name__)
MAX_UPLOAD_BYTES = 50 * 1024 * 1024
ALLOWED_EXTENSIONS = {".md", ".txt", ".rst", ".pdf", ".docx", ".csv", ".html", ".htm"}
MAX_FILENAME_LENGTH = 255
MAX_REMOTE_URL_LENGTH = 2_048
_ingestion_lock = Lock()


def safe_filename(name: str) -> str:
    basename = Path(name).name
    extension = Path(basename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Unsupported document type")
    stem = re.sub(r"[^a-zA-Z0-9._-]", "-", basename[: -len(extension)])
    stem = stem[: MAX_FILENAME_LENGTH - len(extension)]
    if not stem or stem in {".", ".."}:
        raise HTTPException(status_code=415, detail="Unsupported document type")
    return f"{stem}{extension}"


def file_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def validated_remote_url(value: str) -> str:
    candidate = value.strip()
    if len(candidate) > MAX_REMOTE_URL_LENGTH:
        raise HTTPException(status_code=422, detail="Source URL is too long")
    parsed = urlsplit(candidate)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise HTTPException(
            status_code=422,
            detail="Provide a valid HTTP(S) source URL without credentials",
        )
    return candidate


def python_executable() -> str:
    configured = os.getenv("FIXFLOW_PYTHON", sys.executable).strip()
    if not configured or any(character in configured for character in ("\0", "\r", "\n")):
        raise ValueError("FIXFLOW_PYTHON is invalid")
    if Path(configured).name != configured:
        executable = Path(configured).expanduser().absolute()
        if not executable.is_file() or not os.access(executable, os.X_OK):
            raise ValueError("FIXFLOW_PYTHON does not identify an executable file")
        return str(executable)
    resolved = shutil.which(configured)
    if resolved is None:
        raise ValueError("FIXFLOW_PYTHON is not executable")
    return resolved


def ingest_upload(source_id: str, upload_dir: Path, digest: str) -> None:
    try:
        python = python_executable()
    except (OSError, ValueError):
        logger.exception("The configured ingestion runtime is unavailable")
        store.release_source_hash(digest)
        store.update_source(
            source_id,
            status="error",
            detail="stored, but the ingestion runtime is unavailable",
        )
        return
    ingest_command = [
        python,
        str(Path(__file__).resolve().parents[2] / "scripts" / "ingest_documents.py"),
        "--source",
        str(upload_dir),
        "--load",
        "--append",
        "--output",
        str(store.INDEX_FILE),
    ]
    chunk_command = [
        python,
        str(Path(__file__).resolve().parents[2] / "scripts" / "chunk_documents.py"),
        "--input",
        str(store.INDEX_FILE),
        "--output",
        str(store.CHUNKS_FILE),
    ]
    try:
        with _ingestion_lock:
            run_ingestion(ingest_command, chunk_command)
            chunks = count_chunks()
        store.update_source(
            source_id,
            status="indexed",
            chunks=chunks,
            detail="ingested and chunked for embeddings",
        )
    except (subprocess.SubprocessError, OSError):
        logger.exception("Document ingestion failed for source %s", source_id)
        store.release_source_hash(digest)
        store.update_source(source_id, status="error", detail="stored, but document loading failed")


def run_ingestion(ingest_command: list[str], chunk_command: list[str]) -> None:
    for command in (ingest_command, chunk_command):
        subprocess.run(
            command,
            cwd=store.ROOT,
            check=True,
            capture_output=True,
            text=True,
            timeout=300,
        )


def count_chunks() -> int:
    with store.CHUNKS_FILE.open(encoding="utf-8") as chunk_file:
        return sum(1 for line in chunk_file if line.strip())


@router.post("/debug", response_model=Diagnosis)
def debug(payload: DebugRequest) -> Diagnosis:
    if not any((payload.error, payload.code, payload.context)):
        raise HTTPException(status_code=422, detail="Provide an error, code, or context")
    return store.diagnose(payload)


@router.post("/chat", response_model=ChatMessage)
def chat(payload: ChatRequest) -> ChatMessage:
    try:
        return store.chat(payload.session_id, payload.question.strip())
    except store.SessionNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.get("/sessions", response_model=list[SessionSummary])
def sessions() -> list[SessionSummary]:
    return store.sessions()


@router.get("/sessions/{session_id}", response_model=Diagnosis)
def session(session_id: str) -> Diagnosis:
    result = store.get_session(session_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return result


@router.get("/sources", response_model=list[KnowledgeSource])
def sources() -> list[KnowledgeSource]:
    return store.sources()


@router.get("/saved", response_model=list[SavedSolution])
def saved() -> list[SavedSolution]:
    return store.saved()


@router.post("/saved", response_model=SavedSolution)
def save(payload: SaveRequest) -> SavedSolution:
    return store.save_solution(payload)


@router.post("/documents", response_model=KnowledgeSource)
async def documents(
    background_tasks: BackgroundTasks,
    kind: Annotated[str, Form()] = "upload",
    value: Annotated[str, Form()] = "",
    content: Annotated[str | None, Form()] = None,
    file: Annotated[UploadFile | None, File()] = None,
) -> KnowledgeSource:
    if kind not in {"docs", "github", "upload"}:
        raise HTTPException(status_code=422, detail="Unsupported source kind")
    if kind == "github":
        remote_url = validated_remote_url(value)
        source_kind = cast(KnowledgeKind, kind)
        return store.add_source(
            remote_url,
            source_kind,
            0,
            "remote URL queued for future indexing",
            status="queued",
        )

    name = value or "pasted-document.md"
    if file is not None:
        name = safe_filename(file.filename or "uploaded-document.md")
        try:
            data = await file.read(MAX_UPLOAD_BYTES + 1)
        finally:
            await file.close()
    elif content:
        data = content.encode("utf-8")
        name = safe_filename(name if Path(name).suffix else f"{name}.md")
    else:
        raise HTTPException(status_code=400, detail="Provide document content or a file")

    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Document exceeds the 50 MB limit")
    if not data:
        raise HTTPException(status_code=422, detail="Document cannot be empty")

    digest = file_hash(data)
    if not store.reserve_source_hash(digest):
        raise HTTPException(status_code=409, detail="This document is already indexed")

    upload_dir = store.UPLOAD_DIR / str(uuid4())
    try:
        upload_dir.mkdir(parents=True, mode=0o700, exist_ok=False)
        destination = upload_dir / name
        with destination.open("xb") as output:
            os.chmod(destination, 0o600)
            output.write(data)
        source_kind = cast(KnowledgeKind, kind)
        source = store.add_source(
            name,
            source_kind,
            0,
            f"stored for ingestion; hash {digest}",
            status="indexing",
        )
    except OSError:
        store.release_source_hash(digest)
        shutil.rmtree(upload_dir, ignore_errors=True)
        raise
    background_tasks.add_task(ingest_upload, source.id, upload_dir, digest)
    return source
