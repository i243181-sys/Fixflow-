from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from threading import RLock
from typing import TypeAlias
from uuid import uuid4

from backend.schemas.models import (
    ChatMessage,
    CodeFix,
    DebugRequest,
    Diagnosis,
    FixStep,
    KnowledgeKind,
    KnowledgeSource,
    RagDetails,
    SavedSolution,
    SaveRequest,
    SessionSummary,
    SourceDoc,
    SourceReference,
    SourceStatus,
)

ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
_configured_data_dir = Path(os.getenv("FIXFLOW_DATA_DIR", str(ROOT / "doc"))).expanduser()
DATA_DIR = (
    _configured_data_dir
    if _configured_data_dir.is_absolute()
    else (BACKEND_DIR / _configured_data_dir).resolve()
)
UPLOAD_DIR = ROOT / "backend" / "uploads"
INDEX_FILE = DATA_DIR / "processed" / "documents.jsonl"
CHUNKS_FILE = DATA_DIR / "processed" / "chunks.jsonl"

logger = logging.getLogger(__name__)
Chunk: TypeAlias = dict[str, object]


@dataclass(slots=True)
class SessionRecord:
    diagnosis: Diagnosis
    created_at: datetime
    messages: list[ChatMessage] = field(default_factory=list)


class SessionNotFoundError(LookupError):
    """Raised when a chat references an unknown debug session."""


_state_lock = RLock()
_chunk_lock = RLock()
_sessions: dict[str, SessionRecord] = {}
_sources: dict[str, KnowledgeSource] = {}
_saved: dict[str, SavedSolution] = {}
_source_hashes: set[str] = set()
_chunk_cache: list[Chunk] = []
_chunk_cache_mtime: float | None = None
_SEARCH_TERM_PATTERN = re.compile(r"[a-zA-Z0-9_]{3,}")


def now() -> datetime:
    return datetime.now(UTC)


def _source_docs() -> list[SourceDoc]:
    return [
        SourceDoc(
            id="python-docs",
            type="docs",
            title="Python documentation corpus",
            publisher="Local knowledge base",
            url="",
            relevance=94,
            excerpt="Retrieved from the locally loaded documentation index.",
        ),
        SourceDoc(
            id="fastapi-docs",
            type="docs",
            title="FastAPI documentation",
            publisher="FastAPI",
            url="https://fastapi.tiangolo.com",
            relevance=90,
            excerpt="Official FastAPI guidance for request handling and async routes.",
        ),
    ]


def _read_chunks() -> tuple[list[Chunk], float | None]:
    try:
        modified = CHUNKS_FILE.stat().st_mtime
    except FileNotFoundError:
        return [], None

    chunks: list[Chunk] = []
    try:
        with CHUNKS_FILE.open(encoding="utf-8") as stream:
            for line_number, line in enumerate(stream, start=1):
                if not line.strip():
                    continue
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    logger.warning("Skipping malformed chunk record at line %s", line_number)
                    continue
                if isinstance(item, dict):
                    chunks.append(item)
                else:
                    logger.warning("Skipping non-object chunk record at line %s", line_number)
    except OSError:
        logger.exception("Could not read the chunk index")
        return [], None
    return chunks, modified


def _cached_chunks() -> list[Chunk]:
    global _chunk_cache, _chunk_cache_mtime
    try:
        modified = CHUNKS_FILE.stat().st_mtime
    except FileNotFoundError:
        return []
    with _chunk_lock:
        if _chunk_cache_mtime != modified:
            _chunk_cache, _chunk_cache_mtime = _read_chunks()
        return list(_chunk_cache)


def _retrieve_chunks(question: str, limit: int = 3) -> list[Chunk]:
    terms = set(_SEARCH_TERM_PATTERN.findall(question.lower()))
    scored: list[tuple[int, Chunk]] = []
    for chunk in _cached_chunks():
        text = str(chunk.get("page_content") or "")
        words = set(_SEARCH_TERM_PATTERN.findall(text.lower()))
        score = len(terms & words)
        if score:
            scored.append((score, chunk))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [chunk for _, chunk in scored[:limit]]


def diagnose(payload: DebugRequest) -> Diagnosis:
    session_id = str(uuid4())
    error = payload.error or payload.context or ""
    techs = list(payload.techs)
    if payload.technology and payload.technology not in techs:
        techs.append(payload.technology)
    if "asyncio" in error.lower() or "event loop" in error.lower():
        root_cause = (
            "Async code is being called without a running event loop, commonly from synchronous or worker-thread code."
        )
        explanation = (
            "The request path should stay async and await the coroutine directly; "
            "synchronous work should be isolated in an executor."
        )
    else:
        root_cause = (
            "The supplied failure needs a closer match in the project context "
            "before a single root cause can be confirmed."
        )
        explanation = (
            "The backend has accepted the diagnostic context and will use the indexed "
            "documentation when the retriever is connected."
        )

    diagnosis = Diagnosis(
        sessionId=session_id,
        status="likely-cause-found" if "asyncio" in error.lower() or "event loop" in error.lower() else "investigating",
        confidence=92 if "asyncio" in error.lower() or "event loop" in error.lower() else 61,
        detected=techs,
        rootCause=root_cause,
        whyThisHappens=explanation,
        recommendedFix=[
            FixStep(
                title="Keep the endpoint async",
                detail="Declare the route async and await asynchronous work directly.",
            ),
            FixStep(
                title="Move blocking work off the loop",
                detail="Use an executor for synchronous libraries instead of blocking the event loop.",
            ),
        ],
        codeFix=CodeFix(
            file="app/api/routes/tasks.py",
            lines="L14-L31",
            language="python",
            before="def get_report():\n    loop.run_until_complete(build_report())",
            after="async def get_report():\n    return await build_report()",
        ),
        alternatives=[],
        sources=_source_docs(),
        rag=RagDetails(
            query=error,
            expansions=[],
            retrieved=0,
            reranked=0,
            sourcesUsed=2,
            topChunks=[],
        ),
    )
    with _state_lock:
        _sessions[session_id] = SessionRecord(diagnosis=diagnosis, created_at=now())
    return diagnosis


def chat(session_id: str, question: str) -> ChatMessage:
    with _state_lock:
        session = _sessions.get(session_id)
        if session is None:
            raise SessionNotFoundError("Session not found")
        session.messages.append(ChatMessage(id=str(uuid4()), role="user", text=question))
    matches = _retrieve_chunks(question)
    if matches:
        excerpts = []
        source_names = []
        for match in matches:
            metadata = match.get("metadata") or {}
            if not isinstance(metadata, dict):
                metadata = {}
            source_names.append(str(metadata.get("filename") or "documentation"))
            excerpt = " ".join(str(match.get("page_content") or "").split())[:500]
            excerpts.append(f"{metadata.get('filename', 'Documentation')}: {excerpt}")
        reply_text = "Retrieved from the loaded documentation:\n\n" + "\n\n".join(excerpts)
        reply_sources = [SourceReference(title=name, type="docs") for name in dict.fromkeys(source_names)]
    else:
        reply_text = (
            "I could not find a close match in the loaded chunks. Try naming the error, library, or function involved."
        )
        reply_sources = []

    reply = ChatMessage(
        id=str(uuid4()),
        role="fixflow",
        text=reply_text,
        sources=reply_sources,
    )
    with _state_lock:
        session.messages.append(reply)
    return reply


def sessions() -> list[SessionSummary]:
    result: list[SessionSummary] = []
    with _state_lock:
        records = list(_sessions.items())
    for session_id, record in reversed(records):
        diagnosis = record.diagnosis
        result.append(
            SessionSummary(
                id=session_id,
                title="FixFlow debug session",
                technology=diagnosis.detected,
                createdAt=record.created_at,
                status="resolved" if diagnosis.status == "likely-cause-found" else "in-progress",
                confidence=diagnosis.confidence,
                errorMessage=diagnosis.rootCause,
            )
        )
    return result


def get_session(session_id: str) -> Diagnosis | None:
    with _state_lock:
        record = _sessions.get(session_id)
        return record.diagnosis if record else None


def sources() -> list[KnowledgeSource]:
    with _state_lock:
        if _sources:
            return list(_sources.values())
    chunks = 0
    try:
        if INDEX_FILE.exists():
            with INDEX_FILE.open(encoding="utf-8") as stream:
                chunks = sum(1 for line in stream if line.strip())
    except OSError:
        logger.exception("Could not inspect the document index")
    with _state_lock:
        if not _sources:
            _sources["local-index"] = KnowledgeSource(
                id="local-index",
                name="Local documentation index",
                kind="docs",
                status="indexed" if chunks else "queued",
                chunks=chunks,
                updated=now(),
                detail=f"{chunks} loaded document records",
            )
        return list(_sources.values())


def add_source(
    name: str,
    kind: KnowledgeKind,
    chunks: int,
    detail: str,
    status: SourceStatus = "indexing",
) -> KnowledgeSource:
    source = KnowledgeSource(
        id=str(uuid4()),
        name=name,
        kind=kind,
        status=status,
        chunks=chunks,
        updated=now(),
        detail=detail,
    )
    with _state_lock:
        _sources[source.id] = source
    return source


def reserve_source_hash(content_hash: str) -> bool:
    with _state_lock:
        if content_hash in _source_hashes:
            return False
        _source_hashes.add(content_hash)
        return True


def release_source_hash(content_hash: str) -> None:
    with _state_lock:
        _source_hashes.discard(content_hash)


def update_source(
    source_id: str,
    *,
    status: SourceStatus,
    detail: str,
    chunks: int | None = None,
) -> None:
    with _state_lock:
        source = _sources.get(source_id)
        if source is None:
            return
        update: dict[str, object] = {"status": status, "detail": detail, "updated": now()}
        if chunks is not None:
            update["chunks"] = chunks
        _sources[source_id] = KnowledgeSource.model_validate({**source.model_dump(), **update})


def saved() -> list[SavedSolution]:
    with _state_lock:
        return list(_saved.values())


def save_solution(payload: SaveRequest) -> SavedSolution:
    solution = SavedSolution(
        id=str(uuid4()),
        problem=payload.problem,
        rootCause=payload.rootCause,
        technology=payload.technology,
        fixSummary=payload.fixSummary,
        sources=payload.sources,
        savedAt=now(),
    )
    with _state_lock:
        _saved[solution.id] = solution
    return solution


def reset() -> None:
    global _chunk_cache_mtime
    with _state_lock:
        _sessions.clear()
        _sources.clear()
        _saved.clear()
        _source_hashes.clear()
    with _chunk_lock:
        _chunk_cache.clear()
        _chunk_cache_mtime = None
