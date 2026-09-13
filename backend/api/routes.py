from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import KnowledgeSource as SourceRecord
from backend.db.session import get_session
from backend.repositories.sources import list_sources
from backend.schemas.models import (
    ChatMessage,
    ChatRequest,
    DebugRequest,
    Diagnosis,
    KnowledgeSource,
    SavedSolution,
    SaveRequest,
    SessionSummary,
)
from backend.services import store
from backend.services.uploads import discard_upload, safe_filename, save_upload, validated_remote_url

router = APIRouter()
Database = Annotated[AsyncSession, Depends(get_session)]


@router.post("/debug", response_model=Diagnosis)
async def debug(payload: DebugRequest, db: Database) -> Diagnosis:
    if not any((payload.error, payload.code, payload.context)):
        raise HTTPException(422, "Provide an error, code, or context")
    return await store.diagnose(db, payload)


@router.post("/chat", response_model=ChatMessage)
async def chat(payload: ChatRequest, db: Database) -> ChatMessage:
    try:
        session_id = UUID(payload.session_id)
    except ValueError as error:
        raise HTTPException(404, "Session not found") from error
    try:
        return await store.chat(db, session_id, payload.question.strip())
    except store.SessionNotFoundError as error:
        raise HTTPException(404, str(error)) from error


@router.get("/sessions", response_model=list[SessionSummary])
async def sessions(db: Database) -> list[SessionSummary]:
    return await store.sessions(db)


@router.get("/sessions/{session_id}", response_model=Diagnosis)
async def session(session_id: UUID, db: Database) -> Diagnosis:
    result = await store.get_session(db, session_id)
    if result is None:
        raise HTTPException(404, "Session not found")
    return result


@router.get("/sources", response_model=list[KnowledgeSource])
async def sources(db: Database) -> list[KnowledgeSource]:
    return await list_sources(db)


@router.get("/sources/{source_id}", response_model=KnowledgeSource)
@router.get("/sources/{source_id}/status", response_model=KnowledgeSource)
async def source(source_id: UUID, db: Database) -> KnowledgeSource:
    result = await list_sources(db, source_id)
    if not result:
        raise HTTPException(404, "Source not found")
    return result[0]


@router.get("/saved", response_model=list[SavedSolution])
async def saved(db: Database) -> list[SavedSolution]:
    return await store.saved(db)


@router.post("/saved", response_model=SavedSolution)
async def save(payload: SaveRequest, db: Database) -> SavedSolution:
    return await store.save_solution(db, payload)


@router.post("/documents", response_model=KnowledgeSource, status_code=202)
async def documents(
    db: Database,
    kind: Annotated[str, Form()] = "upload",
    value: Annotated[str, Form()] = "",
    content: Annotated[str | None, Form()] = None,
    file: Annotated[UploadFile | None, File()] = None,
) -> KnowledgeSource:
    if kind not in {"docs", "github", "upload"}:
        raise HTTPException(422, "Unsupported source kind")
    path = None
    remote_url = None
    status = "uploaded"
    error_message = None
    if kind == "github":
        remote_url = validated_remote_url(value)
        name = remote_url[:255]
        digest = hashlib.sha256(remote_url.encode()).hexdigest()
        status = "failed"
        error_message = "Remote URL ingestion is not configured; upload a file or paste documentation."
    else:
        if file is None and not content:
            raise HTTPException(400, "Provide document content or a file")
        name = file.filename or "uploaded-document.md" if file else value or "pasted-document.md"
        name = safe_filename(name if Path(name).suffix else f"{name}.md")
        path, digest = await save_upload(name, file, content)
    try:
        result = await db.scalar(
            insert(SourceRecord)
            .values(
                id=uuid4(),
                name=name,
                source_type=kind,
                file_hash=digest,
                path=str(path) if path else None,
                url=remote_url,
                status=status,
                error_message=error_message,
            )
            .on_conflict_do_nothing(index_elements=["file_hash"])
            .returning(SourceRecord.id)
        )
        if result is None:
            if path:
                discard_upload(path)
                path = None
            record = (await db.scalars(select(SourceRecord).where(SourceRecord.file_hash == digest))).one()
            result = record.id
            if record.status == "failed" and record.path:
                record.status = "uploaded"
                record.error_message = None
        await db.commit()
    except BaseException:
        await db.rollback()
        if path:
            discard_upload(path)
        raise
    return await source(result, db)
