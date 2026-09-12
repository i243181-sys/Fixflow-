from __future__ import annotations

import hashlib
import os
import re
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile

from backend.schemas.models import (
    ChatMessage,
    ChatRequest,
    DebugRequest,
    Diagnosis,
    KnowledgeSource,
    SaveRequest,
    SavedSolution,
    SessionSummary,
)
from backend.services import store

router = APIRouter()
MAX_UPLOAD_BYTES = 50 * 1024 * 1024
ALLOWED_EXTENSIONS = {".md", ".txt", ".rst", ".pdf", ".docx", ".csv", ".html", ".htm"}


def safe_filename(name: str) -> str:
    cleaned = Path(name).name
    cleaned = re.sub(r"[^a-zA-Z0-9._-]", "-", cleaned)
    if not cleaned or Path(cleaned).suffix.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Unsupported document type")
    return cleaned


def file_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def ingest_upload(source_id: str, upload_dir: Path) -> None:
    python = os.getenv("FIXFLOW_PYTHON", sys.executable)
    ingest_command = [
        python,
        str(Path(__file__).resolve().parents[2] / "scripts" / "ingest_documents.py"),
        "--source", str(upload_dir), "--load", "--append", "--output", str(store.INDEX_FILE),
    ]
    chunk_command = [
        python,
        str(Path(__file__).resolve().parents[2] / "scripts" / "chunk_documents.py"),
        "--input", str(store.INDEX_FILE), "--output", str(store.CHUNKS_FILE),
    ]
    try:
        subprocess.run(ingest_command, cwd=store.ROOT, check=True, capture_output=True, text=True, timeout=300)
        subprocess.run(chunk_command, cwd=store.ROOT, check=True, capture_output=True, text=True, timeout=300)
        with store.CHUNKS_FILE.open(encoding="utf-8") as chunk_file:
            chunks = sum(1 for line in chunk_file if line.strip())
        store.update_source(source_id, status="indexed", chunks=chunks, detail="ingested and chunked for embeddings")
    except (subprocess.SubprocessError, OSError):
        store.update_source(source_id, status="error", detail="stored, but document loading failed")


@router.post("/debug", response_model=Diagnosis)
def debug(payload: DebugRequest) -> Diagnosis:
    if not any((payload.error, payload.code, payload.context)):
        raise HTTPException(status_code=422, detail="Provide an error, code, or context")
    return store.diagnose(payload.model_dump())


@router.post("/chat", response_model=ChatMessage)
def chat(payload: ChatRequest) -> ChatMessage:
    try:
        return store.chat(payload.session_id, payload.question.strip())
    except KeyError as error:
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
    return store.save_solution(payload.model_dump())


@router.post("/documents", response_model=KnowledgeSource)
async def documents(
    background_tasks: BackgroundTasks,
    kind: str = Form("upload"),
    value: str = Form(""),
    content: str | None = Form(None),
    file: UploadFile | None = File(None),
) -> KnowledgeSource:
    if kind not in {"docs", "github", "upload"}:
        raise HTTPException(status_code=422, detail="Unsupported source kind")
    if kind == "github":
        return store.add_source(value, kind, 0, "remote URL queued for future indexing", status="queued")

    name = value or "pasted-document.md"
    if file is not None:
        name = safe_filename(file.filename or "uploaded-document.md")
        data = await file.read(MAX_UPLOAD_BYTES + 1)
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
    if store.has_source_hash(digest):
        raise HTTPException(status_code=409, detail="This document is already indexed")

    upload_dir = store.UPLOAD_DIR / str(uuid4())
    upload_dir.mkdir(parents=True, exist_ok=True)
    destination = upload_dir / name
    destination.write_bytes(data)
    source = store.add_source(name, kind, 0, f"stored for ingestion; hash {digest}", status="indexing")
    background_tasks.add_task(ingest_upload, source.id, upload_dir)
    return source
