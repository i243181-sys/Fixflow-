from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from backend.schemas.models import (
    ChatMessage,
    Diagnosis,
    KnowledgeSource,
    SavedSolution,
    SessionSummary,
)

ROOT = Path(__file__).resolve().parents[2]
UPLOAD_DIR = ROOT / "backend" / "uploads"
INDEX_FILE = ROOT / "doc" / "processed" / "documents.jsonl"

_sessions: dict[str, dict[str, object]] = {}
_sources: dict[str, KnowledgeSource] = {}
_saved: dict[str, SavedSolution] = {}


def now() -> datetime:
    return datetime.now(timezone.utc)


def _source_docs() -> list[dict[str, object]]:
    return [
        {
            "id": "python-docs",
            "type": "docs",
            "title": "Python documentation corpus",
            "publisher": "Local knowledge base",
            "url": "",
            "relevance": 94,
            "excerpt": "Retrieved from the locally loaded documentation index.",
            "used": True,
        },
        {
            "id": "fastapi-docs",
            "type": "docs",
            "title": "FastAPI documentation",
            "publisher": "FastAPI",
            "url": "https://fastapi.tiangolo.com",
            "relevance": 90,
            "excerpt": "Official FastAPI guidance for request handling and async routes.",
            "used": True,
        },
    ]


def diagnose(payload: dict[str, object]) -> Diagnosis:
    session_id = str(uuid4())
    error = str(payload.get("error") or payload.get("context") or "")
    techs = list(payload.get("techs") or [])
    if payload.get("technology") and payload["technology"] not in techs:
        techs.append(str(payload["technology"]))
    if "asyncio" in error.lower() or "event loop" in error.lower():
        root_cause = "Async code is being called without a running event loop, commonly from synchronous or worker-thread code."
        explanation = "The request path should stay async and await the coroutine directly; synchronous work should be isolated in an executor."
    else:
        root_cause = "The supplied failure needs a closer match in the project context before a single root cause can be confirmed."
        explanation = "The backend has accepted the diagnostic context and will use the indexed documentation when the retriever is connected."

    diagnosis = Diagnosis(
        sessionId=session_id,
        status="likely-cause-found" if "asyncio" in error.lower() or "event loop" in error.lower() else "investigating",
        confidence=92 if "asyncio" in error.lower() or "event loop" in error.lower() else 61,
        detected=techs,
        rootCause=root_cause,
        whyThisHappens=explanation,
        recommendedFix=[
            {"title": "Keep the endpoint async", "detail": "Declare the route async and await asynchronous work directly."},
            {"title": "Move blocking work off the loop", "detail": "Use an executor for synchronous libraries instead of blocking the event loop."},
        ],
        codeFix={
            "file": "app/api/routes/tasks.py",
            "lines": "L14-L31",
            "language": "python",
            "before": "def get_report():\n    loop.run_until_complete(build_report())",
            "after": "async def get_report():\n    return await build_report()",
        },
        alternatives=[],
        sources=_source_docs(),
        rag={"query": error, "expansions": [], "retrieved": 0, "reranked": 0, "sourcesUsed": 2, "topChunks": []},
    )
    _sessions[session_id] = {"diagnosis": diagnosis, "messages": [], "created_at": now()}
    return diagnosis


def chat(session_id: str, question: str) -> ChatMessage:
    session = _sessions.get(session_id)
    if session is None:
        raise KeyError("Session not found")
    messages = session["messages"]
    assert isinstance(messages, list)
    messages.append({"id": str(uuid4()), "role": "user", "text": question})
    reply = ChatMessage(
        id=str(uuid4()),
        role="fixflow",
        text="The backend received your follow-up. The next retriever step will ground this answer in the indexed documents.",
        sources=[{"title": "Local documentation index", "type": "docs"}],
    )
    messages.append(reply.model_dump())
    return reply


def sessions() -> list[SessionSummary]:
    result = []
    for session_id, record in reversed(list(_sessions.items())):
        diagnosis = record["diagnosis"]
        created_at = record["created_at"]
        assert isinstance(diagnosis, Diagnosis)
        assert isinstance(created_at, datetime)
        result.append(
            SessionSummary(
                id=session_id,
                title="FixFlow debug session",
                technology=diagnosis.detected,
                createdAt=created_at,
                status="resolved" if diagnosis.status == "likely-cause-found" else "in-progress",
                confidence=diagnosis.confidence,
                errorMessage=diagnosis.rootCause,
            )
        )
    return result


def get_session(session_id: str) -> Diagnosis | None:
    record = _sessions.get(session_id)
    if not record:
        return None
    diagnosis = record["diagnosis"]
    return diagnosis if isinstance(diagnosis, Diagnosis) else None


def sources() -> list[KnowledgeSource]:
    if not _sources:
        chunks = 0
        if INDEX_FILE.exists():
            with INDEX_FILE.open(encoding="utf-8") as stream:
                chunks = sum(1 for line in stream if line.strip())
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


def add_source(name: str, kind: str, chunks: int, detail: str, status: str = "indexing") -> KnowledgeSource:
    source = KnowledgeSource(
        id=str(uuid4()),
        name=name,
        kind=kind,  # type: ignore[arg-type]
        status=status,  # type: ignore[arg-type]
        chunks=chunks,
        updated=now(),
        detail=detail,
    )
    _sources[source.id] = source
    return source


def has_source_hash(file_hash: str) -> bool:
    return any(source.detail.endswith(file_hash) for source in _sources.values())


def update_source(source_id: str, **changes: object) -> None:
    source = _sources.get(source_id)
    if source is not None:
        _sources[source_id] = source.model_copy(update=changes)


def saved() -> list[SavedSolution]:
    return list(_saved.values())


def save_solution(payload: dict[str, object]) -> SavedSolution:
    solution = SavedSolution(
        id=str(uuid4()),
        problem=str(payload.get("problem") or "FixFlow diagnosis"),
        rootCause=str(payload.get("rootCause") or ""),
        technology=[str(item) for item in payload.get("technology", [])],
        fixSummary=str(payload.get("fixSummary") or ""),
        sources=payload.get("sources", []),
        savedAt=now(),
    )
    _saved[solution.id] = solution
    return solution
