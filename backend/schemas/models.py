from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


SourceType = Literal["docs", "github", "community", "code"]
KnowledgeKind = Literal["docs", "github", "community", "upload"]


class DebugRequest(BaseModel):
    error: str | None = None
    code: str | None = None
    context: str | None = None
    repo_url: str | None = None
    technology: str | None = None
    techs: list[str] = Field(default_factory=list)


class SourceDoc(BaseModel):
    id: str
    type: SourceType
    title: str
    publisher: str
    url: str
    relevance: int
    excerpt: str
    used: bool = True


class FixStep(BaseModel):
    title: str
    detail: str


class CodeFix(BaseModel):
    file: str
    lines: str
    language: Literal["python", "typescript", "javascript", "bash", "sql"]
    before: str
    after: str


class Diagnosis(BaseModel):
    sessionId: str
    status: Literal["likely-cause-found", "investigating", "no-cause"]
    confidence: int
    detected: list[str]
    rootCause: str
    whyThisHappens: str
    recommendedFix: list[FixStep]
    codeFix: CodeFix
    alternatives: list[dict[str, str]]
    sources: list[SourceDoc]
    rag: dict[str, object]


class ChatRequest(BaseModel):
    session_id: str
    question: str = Field(min_length=1, max_length=4000)


class ChatMessage(BaseModel):
    id: str
    role: Literal["user", "fixflow"]
    text: str
    sources: list[dict[str, str]] = Field(default_factory=list)


class SessionSummary(BaseModel):
    id: str
    title: str
    technology: list[str]
    createdAt: datetime
    status: Literal["resolved", "unresolved", "in-progress"]
    confidence: int | None
    errorMessage: str


class KnowledgeSource(BaseModel):
    id: str
    name: str
    kind: KnowledgeKind
    status: Literal["indexed", "indexing", "queued", "error"]
    chunks: int
    updated: datetime
    detail: str


class SavedSolution(BaseModel):
    id: str
    problem: str
    rootCause: str
    technology: list[str]
    fixSummary: str
    sources: list[dict[str, str]]
    savedAt: datetime


class SaveRequest(BaseModel):
    problem: str
    rootCause: str
    technology: list[str] = Field(default_factory=list)
    fixSummary: str
    sources: list[dict[str, str]] = Field(default_factory=list)
