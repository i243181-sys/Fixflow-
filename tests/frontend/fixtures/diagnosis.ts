import type { Diagnosis } from "@/lib/types";

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
