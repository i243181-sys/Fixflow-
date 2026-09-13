"""Persistent debug sessions and lexical retrieval (no embedding generation)."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import ChatEntry, DebugSession, DocumentChunk, KnowledgeSource
from backend.db.models import SavedSolution as SavedRecord
from backend.schemas.models import (
    ChatMessage,
    CodeFix,
    DebugRequest,
    Diagnosis,
    FixStep,
    RagDetails,
    SavedSolution,
    SaveRequest,
    SessionSummary,
    SourceReference,
)

_SEARCH_TERM_PATTERN = re.compile(r"[a-zA-Z0-9_]{3,}")


class SessionNotFoundError(LookupError):
    """Raised when a chat references an unknown debug session."""


def now() -> datetime:
    return datetime.now(UTC)


async def diagnose(db: AsyncSession, payload: DebugRequest) -> Diagnosis:
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
        sources=[],
        rag=RagDetails(
            query=error,
            expansions=[],
            retrieved=0,
            reranked=0,
            sourcesUsed=0,
            topChunks=[],
        ),
    )
    db.add(DebugSession(id=UUID(session_id), diagnosis=diagnosis.model_dump(mode="json")))
    await db.commit()
    return diagnosis


async def chat(db: AsyncSession, session_id: UUID, question: str) -> ChatMessage:
    if await db.get(DebugSession, session_id) is None:
        raise SessionNotFoundError("Session not found")
    terms = sorted(set(_SEARCH_TERM_PATTERN.findall(question.lower())))[:100]
    matches = []
    if terms:
        query = func.to_tsquery("simple", " | ".join(terms))
        matches = list(
            (
                await db.execute(
                    select(DocumentChunk.content, KnowledgeSource.name)
                    .join(KnowledgeSource, KnowledgeSource.id == DocumentChunk.source_id)
                    .where(DocumentChunk.search_text.op("@@")(query))
                    .order_by(func.ts_rank(DocumentChunk.search_text, query).desc(), DocumentChunk.id)
                    .limit(3)
                )
            ).all()
        )
    sources = []
    if matches:
        excerpts = [f"{name}: {' '.join(content.split())[:500]}" for content, name in matches]
        text = "Retrieved from the loaded documentation:\n\n" + "\n\n".join(excerpts)
        sources = [SourceReference(title=name, type="docs") for name in dict.fromkeys(name for _, name in matches)]
    else:
        text = (
            "I could not find a close match in the loaded chunks. Try naming the error, library, or function involved."
        )
    reply = ChatMessage(id=str(uuid4()), role="fixflow", text=text, sources=sources)
    user = ChatMessage(id=str(uuid4()), role="user", text=question)
    db.add_all([ChatEntry(session_id=session_id, payload=message.model_dump(mode="json")) for message in (user, reply)])
    await db.commit()
    return reply


async def sessions(db: AsyncSession) -> list[SessionSummary]:
    records = await db.scalars(select(DebugSession).order_by(DebugSession.created_at.desc()))
    result = []
    for record in records:
        diagnosis = Diagnosis.model_validate(record.diagnosis)
        result.append(
            SessionSummary(
                id=str(record.id),
                title="FixFlow debug session",
                technology=diagnosis.detected,
                createdAt=record.created_at,
                status="resolved" if diagnosis.status == "likely-cause-found" else "in-progress",
                confidence=diagnosis.confidence,
                errorMessage=diagnosis.rootCause,
            )
        )
    return result


async def get_session(db: AsyncSession, session_id: UUID) -> Diagnosis | None:
    record = await db.get(DebugSession, session_id)
    return Diagnosis.model_validate(record.diagnosis) if record else None


async def saved(db: AsyncSession) -> list[SavedSolution]:
    records = await db.scalars(select(SavedRecord).order_by(SavedRecord.created_at.desc()))
    return [SavedSolution.model_validate(record.payload) for record in records]


async def save_solution(db: AsyncSession, payload: SaveRequest) -> SavedSolution:
    solution = SavedSolution(id=str(uuid4()), **payload.model_dump(), savedAt=now())
    db.add(SavedRecord(id=UUID(solution.id), payload=solution.model_dump(mode="json")))
    await db.commit()
    return solution
