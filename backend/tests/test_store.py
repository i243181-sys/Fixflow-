from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.schemas.models import DebugRequest, SaveRequest, SourceReference
from backend.services import store


def test_chat_skips_malformed_chunk_records(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    chunk_file = tmp_path / "chunks.jsonl"
    valid_record = {
        "page_content": "The asyncio event loop schedules coroutine callbacks.",
        "metadata": {"filename": "asyncio.md"},
    }
    chunk_file.write_text(
        "not-json\n" + json.dumps(valid_record) + "\n[]\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(store, "CHUNKS_FILE", chunk_file)
    diagnosis = store.diagnose(DebugRequest(error="event loop failure"))

    reply = store.chat(diagnosis.sessionId, "How does the event loop schedule work?")

    assert "asyncio.md" in reply.text
    assert [source.title for source in reply.sources] == ["asyncio.md"]


def test_save_solution_preserves_validated_fields() -> None:
    request = SaveRequest(
        problem="Connection failure",
        rootCause="Pool exhausted",
        technology=["Python"],
        fixSummary="Increase the pool size",
        sources=[SourceReference(title="Pooling guide", type="docs")],
    )

    saved = store.save_solution(request)

    assert saved.problem == request.problem
    assert store.saved() == [saved]
