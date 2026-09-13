from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, field_validator

SourceType = Literal["docs", "github", "community", "code"]
KnowledgeKind = Literal["docs", "github", "community", "upload"]
SourceStatus = Literal["uploaded", "processing", "chunked", "ready_for_embedding", "indexed", "failed"]
ShortText = Annotated[str, Field(max_length=200)]


class DebugRequest(BaseModel):
    error: str | None = Field(default=None, max_length=200_000)
    code: str | None = Field(default=None, max_length=500_000)
    context: str | None = Field(default=None, max_length=200_000)
    repo_url: str | None = Field(default=None, max_length=2_048)
    technology: ShortText | None = None
    techs: list[ShortText] = Field(default_factory=list, max_length=30)

    @field_validator("repo_url")
    @classmethod
    def validate_repo_url(cls, value: str | None) -> str | None:
        if not value:
            return value
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("Repository URL must use HTTP or HTTPS")
        if parsed.username or parsed.password:
            raise ValueError("Repository URL must not contain credentials")
        return value


class SourceDoc(BaseModel):
    id: str
    type: SourceType
    title: str
    publisher: str
    url: str
    relevance: int = Field(ge=0, le=100)
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


class AlternativeFix(BaseModel):
    title: str
    tradeoff: str
    summary: str


class RagChunk(BaseModel):
    doc: str
    score: float


class RagDetails(BaseModel):
    query: str
    expansions: list[str]
    retrieved: int = Field(ge=0)
    reranked: int = Field(ge=0)
    sourcesUsed: int = Field(ge=0)
    topChunks: list[RagChunk]


class SourceReference(BaseModel):
    title: str = Field(max_length=500)
    type: SourceType


class Diagnosis(BaseModel):
    sessionId: str
    status: Literal["likely-cause-found", "investigating", "no-cause"]
    confidence: int = Field(ge=0, le=100)
    detected: list[str]
    rootCause: str
    whyThisHappens: str
    recommendedFix: list[FixStep]
    codeFix: CodeFix
    alternatives: list[AlternativeFix]
    sources: list[SourceDoc]
    rag: RagDetails


class ChatRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=100)
    question: str = Field(min_length=1, max_length=4000)

    @field_validator("question")
    @classmethod
    def validate_question(cls, value: str) -> str:
        question = value.strip()
        if not question:
            raise ValueError("Question cannot be blank")
        return question


class ChatMessage(BaseModel):
    id: str
    role: Literal["user", "fixflow"]
    text: str
    sources: list[SourceReference] = Field(default_factory=list)


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
    source_id: str
    name: str
    kind: KnowledgeKind
    source_type: KnowledgeKind
    status: SourceStatus
    chunks: int = Field(ge=0)
    chunk_count: int = Field(ge=0)
    documents: int = Field(ge=0)
    document_count: int = Field(ge=0)
    technology: str | None = None
    version: str | None = None
    url: str | None = None
    error_message: str | None = None
    created_at: datetime
    updated: datetime
    detail: str


class SavedSolution(BaseModel):
    id: str
    problem: str
    rootCause: str
    technology: list[str]
    fixSummary: str
    sources: list[SourceReference]
    savedAt: datetime


class SaveRequest(BaseModel):
    problem: str = Field(min_length=1, max_length=20_000)
    rootCause: str = Field(max_length=50_000)
    technology: list[ShortText] = Field(default_factory=list, max_length=30)
    fixSummary: str = Field(max_length=50_000)
    sources: list[SourceReference] = Field(default_factory=list, max_length=100)
