import type { Diagnosis, MockKnowledgeSource } from "./types";

const now = Date.now();
const ago = (ms: number) => new Date(now - ms).toISOString();

export const ASYNCIO_DIAGNOSIS: Diagnosis = {
  status: "likely-cause-found",
  confidence: 92,
  detected: ["Python", "FastAPI", "asyncio"],
  rootCause:
    "You are calling an async function (or touching the event loop) from synchronous code that runs outside of asyncio's context — most commonly a sync endpoint or a background thread calling `asyncio.get_event_loop()` after the loop that created the task has already closed. In FastAPI, `def` endpoints run in a threadpool with no attached event loop, so any coroutine scheduled from there has nothing to run on.",
  whyThisHappens:
    "asyncio keeps a per-thread reference to the running event loop. Code executed inside `async def` can fetch it with `asyncio.get_running_loop()`. Synchronous endpoints and threads spawned outside the loop have no such reference, so `get_event_loop()` either returns a stale loop or raises `RuntimeError: no running event loop`. This bites especially on Linux where uvicorn's default loop setup differs from other platforms and `get_event_loop()` no longer auto-creates a loop (deprecated since Python 3.10, removed in 3.12).",
  recommendedFix: [
    {
      title: "Make the endpoint async",
      detail:
        "Change `def endpoint(...)` to `async def endpoint(...)` so it runs on the event loop and can await coroutines directly.",
    },
    {
      title: "Await the coroutine instead of scheduling it",
      detail:
        "Replace `asyncio.get_event_loop().run_until_complete(fetch())` with `result = await fetch()` inside the async endpoint.",
    },
    {
      title: "Use run_in_executor for blocking work",
      detail:
        "If you must call blocking/sync libraries, wrap them with `await asyncio.get_running_loop().run_in_executor(None, blocking_fn)` instead of the reverse.",
    },
    {
      title: "Never create loops in threads",
      detail:
        "In worker threads that need async code, use `asyncio.run(...)` or create a dedicated loop with `asyncio.new_event_loop()` — don't rely on the main thread's loop.",
    },
  ],
  codeFix: {
    file: "app/api/routes/tasks.py",
    lines: "L14–L31",
    language: "python",
    before: `from fastapi import APIRouter
import asyncio

router = APIRouter()

# sync endpoint → runs in threadpool, no event loop
@router.get("/report")
def get_report(user_id: str):
    loop = asyncio.get_event_loop()          # RuntimeError
    result = loop.run_until_complete(build_report(user_id))
    return result`,
    after: `from fastapi import APIRouter
import asyncio

router = APIRouter()

# async endpoint → runs on the event loop
@router.get("/report")
async def get_report(user_id: str):
    result = await build_report(user_id)
    return result`,
  },
  alternatives: [
    {
      title: "Run the task in a background worker",
      summary:
        "Offload the async job to a task queue (e.g. an asyncio task started from a lifespan hook or arq/celery) and poll for results.",
      tradeoff:
        "Adds infrastructure and eventual consistency; not worth it for sub-second report generation.",
    },
    {
      title: "Use asyncio.run in a dedicated thread",
      summary:
        "Keep the sync endpoint but spawn a thread that calls `asyncio.run(build_report(user_id))` and join on the result.",
      tradeoff:
        "Works but spins up a new event loop per request — wasteful and harder to reason about under load.",
    },
    {
      title: "Convert build_report to sync",
      summary:
        "If the function only uses async for I/O that has a sync equivalent, make it a plain function and drop asyncio entirely.",
      tradeoff:
        "Loses concurrency if the report aggregates many parallel I/O calls.",
    },
  ],
  sources: [
    {
      id: "src1",
      type: "docs",
      title: "asyncio — Event Loop",
      publisher: "Official Python Documentation",
      url: "https://docs.python.org/3/library/asyncio-eventloop.html",
      relevance: 96,
      excerpt:
        "Get the running event loop in the current OS thread… This function can only be called from a coroutine or a callback. If there is no running event loop, a RuntimeError is raised.",
      used: true,
    },
    {
      id: "src2",
      type: "github",
      title: "RuntimeError: no running event loop when calling async func from sync route #4183",
      publisher: "fastapi/fastapi",
      url: "https://github.com/fastapi/fastapi/issues/4183",
      relevance: 93,
      excerpt:
        "When the path operation function is declared with `def` instead of `async def`, it runs in an external threadpool… `asyncio.get_event_loop()` then fails because that thread has no loop.",
      used: true,
    },
    {
      id: "src3",
      type: "community",
      title: "Why does `asyncio.get_event_loop()` raise in a FastAPI sync endpoint?",
      publisher: "Stack Overflow-style discussion",
      url: "https://stackoverflow.com/q/69576262",
      relevance: 89,
      excerpt:
        "Top answer: declare the route as `async def` and await the coroutine directly; `run_until_complete` inside a running app is an anti-pattern since the loop is already managed by uvicorn.",
      used: true,
    },
    {
      id: "src4",
      type: "code",
      title: "Example: migrating sync endpoints to async (uvicorn docs sample)",
      publisher: "awesome-fastapi-examples",
      url: "https://github.com/async-examples/fastapi-async-migration",
      relevance: 85,
      excerpt:
        "# Before: def get_report(): loop.run_until_complete(...) → # After: async def get_report(): return await build_report(...)",
      used: true,
    },
    {
      id: "src5",
      type: "docs",
      title: "Coroutines and Tasks — running in threads",
      publisher: "Official Python Documentation",
      url: "https://docs.python.org/3/library/asyncio-task.html",
      relevance: 78,
      excerpt:
        "asyncio.run() … should be used as a main entry point, and is intended to be called only once. Loops are thread-local; do not share a loop across threads.",
      used: false,
    },
    {
      id: "src6",
      type: "github",
      title: "Deprecate implicit event loop creation in get_event_loop() — CPython #83710",
      publisher: "python/cpython",
      url: "https://github.com/python/cpython/issues/83710",
      relevance: 74,
      excerpt:
        "Since 3.10 `get_event_loop()` no longer creates an event loop when none is running; code relying on the implicit behavior raises RuntimeError in 3.12+.",
      used: false,
    },
  ],
  rag: {
    query: "RuntimeError: no running event loop fastapi sync endpoint asyncio",
    expansions: [
      "fastapi async def vs def threadpool event loop",
      "asyncio.get_event_loop() RuntimeError python 3.12",
      "run_until_complete inside running uvicorn application",
    ],
    retrieved: 24,
    reranked: 5,
    sourcesUsed: 4,
    topChunks: [
      { doc: "asyncio-eventloop.html", score: 0.94 },
      { doc: "fastapi/issues/4183", score: 0.91 },
      { doc: "so/q/69576262", score: 0.88 },
      { doc: "fastapi-async-migration/README.md", score: 0.84 },
      { doc: "asyncio-task.html", score: 0.79 },
    ],
  },
};
import type { DebugSession, SavedSolution } from "./types";
import type { SourceType } from "./types";

export const MOCK_SESSIONS: DebugSession[] = [
  {
    id: "s1",
    title: "FastAPI RuntimeError",
    technology: ["Python", "FastAPI"],
    createdAt: ago(1000 * 60 * 42),
    status: "resolved",
    confidence: 92,
    errorMessage: "RuntimeError: no running event loop",
  },
  {
    id: "s2",
    title: "PostgreSQL connection timeout",
    technology: ["PostgreSQL", "Python"],
    createdAt: ago(1000 * 60 * 60 * 5),
    status: "resolved",
    confidence: 88,
    errorMessage:
      "sqlalchemy.exc.OperationalError: (psycopg2.OperationalError) connection timed out",
  },
  {
    id: "s3",
    title: "Docker port conflict",
    technology: ["Docker"],
    createdAt: ago(1000 * 60 * 60 * 26),
    status: "resolved",
    confidence: 97,
    errorMessage:
      "Error starting userland proxy: listen tcp4 0.0.0.0:5432: bind: address already in use",
  },
  {
    id: "s4",
    title: "React hydration mismatch",
    technology: ["React", "Next.js"],
    createdAt: ago(1000 * 60 * 60 * 50),
    status: "unresolved",
    confidence: null,
    errorMessage:
      "Hydration failed because the server rendered HTML didn't match the client.",
  },
  {
    id: "s5",
    title: "LangChain import error",
    technology: ["LangChain", "Python"],
    createdAt: ago(1000 * 60 * 60 * 74),
    status: "resolved",
    confidence: 84,
    errorMessage: "ModuleNotFoundError: No module named 'langchain_community'",
  },
  {
    id: "s6",
    title: "CORS blocked in dev",
    technology: ["FastAPI", "JavaScript"],
    createdAt: ago(1000 * 60 * 60 * 96),
    status: "in-progress",
    confidence: 76,
    errorMessage:
      "Access to fetch at 'http://localhost:8000' from origin 'http://localhost:3000' has been blocked by CORS policy",
  },
];

export const MOCK_KNOWLEDGE: MockKnowledgeSource[] = [
  { name: "FastAPI Docs", kind: "docs", status: "indexed", chunks: 4820, updated: ago(1000 * 60 * 60 * 3), detail: "https://fastapi.tiangolo.com" },
  { name: "Python Docs", kind: "docs", status: "indexed", chunks: 12480, updated: ago(1000 * 60 * 60 * 20), detail: "https://docs.python.org/3" },
  { name: "PostgreSQL Docs", kind: "docs", status: "indexed", chunks: 8210, updated: ago(1000 * 60 * 60 * 27), detail: "https://www.postgresql.org/docs/current/" },
  { name: "Docker Docs", kind: "docs", status: "indexed", chunks: 5390, updated: ago(1000 * 60 * 60 * 40), detail: "https://docs.docker.com" },
  { name: "Next.js Docs", kind: "docs", status: "indexing", chunks: 2100, updated: ago(1000 * 60 * 8), detail: "https://nextjs.org/docs" },
  { name: "fastapi/fastapi", kind: "github", status: "indexed", chunks: 9640, updated: ago(1000 * 60 * 60 * 6), detail: "issues + discussions, last sync 2h ago" },
  { name: "python/cpython", kind: "github", status: "queued", chunks: 0, updated: ago(1000 * 60 * 60 * 12), detail: "large repo — queued behind fastapi/fastapi" },
  { name: "Community Q&A corpus", kind: "community", status: "indexed", chunks: 31700, updated: ago(1000 * 60 * 60 * 30), detail: "Stack Overflow-style dumps, top 40 tags" },
  { name: "pyproject.toml notes.md", kind: "upload", status: "indexed", chunks: 42, updated: ago(1000 * 60 * 60 * 50), detail: "uploaded by you" },
  { name: "team-runbook.pdf", kind: "upload", status: "error", chunks: 0, updated: ago(1000 * 60 * 60 * 55), detail: "unsupported format — convert to .md or .txt" },
];
export const MOCK_SAVED: SavedSolution[] = [
  {
    id: "sv1",
    problem: "Docker: bind address already in use on port 5432",
    rootCause:
      "A local PostgreSQL service was already bound to 5432, so the container's port mapping collided.",
    technology: ["Docker", "PostgreSQL"],
    fixSummary:
      'Change mapping to "5433:5432" in docker-compose.yml and point the app at 5433.',
    sources: [
      { title: "Docker Docs — published ports", type: "docs" as SourceType },
      { title: "Issue #8812 — port already in use", type: "github" as SourceType },
    ],
    savedAt: ago(1000 * 60 * 60 * 25),
  },
  {
    id: "sv2",
    problem: "Next.js 15 hydration mismatch with Date.now()",
    rootCause:
      "Server render used a timestamp generated at request time; the client re-rendered with a different value.",
    technology: ["React", "Next.js"],
    fixSummary:
      "Move time-dependent rendering into a client component guarded by useEffect, or use a stable seed.",
    sources: [
      { title: "Next.js Docs — hydration errors", type: "docs" as SourceType },
      { title: "Discussion #61234", type: "github" as SourceType },
    ],
    savedAt: ago(1000 * 60 * 60 * 51),
  },
  {
    id: "sv3",
    problem: "SQLAlchemy connection timeout under load",
    rootCause:
      "Pool_size was too small and pool_timeout too low; connections were exhausted by concurrent requests.",
    technology: ["PostgreSQL", "Python"],
    fixSummary:
      "Raise pool_size to 20, enable pool_pre_ping, and add pool_recycle=1800.",
    sources: [
      { title: "SQLAlchemy — connection pooling", type: "docs" as SourceType },
      { title: "PostgreSQL Docs — max_connections", type: "docs" as SourceType },
    ],
    savedAt: ago(1000 * 60 * 60 * 74),
  },
];

export const FOLLOWUP_SUGGESTIONS = [
  "Why does this happen only on Linux?",
  "Can I solve this without changing the event loop?",
  "Explain this fix simply.",
];

export const MOCK_CHAT_REPLIES: Record<
  string,
  { text: string; sources: { title: string; type: SourceType }[] }
> = {
  default: {
    text: "Based on the retrieved evidence: the Python docs state that event loops are thread-local and can only be fetched from a coroutine or callback, and the FastAPI issue thread confirms that `def` routes execute in an external threadpool with no loop attached. On Linux, uvicorn typically binds uvloop, which makes the missing-loop failure surface earlier and more explicitly than on other platforms.",
    sources: [
      { title: "asyncio — Event Loop", type: "docs" },
      { title: "fastapi/fastapi #4183", type: "github" },
    ],
  },
};
