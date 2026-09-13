from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts import chunk_documents as chunking


def write_source_records(path: Path, records: list[dict[str, object]]) -> None:
    path.write_text(
        "".join(json.dumps(record) + "\n" for record in records),
        encoding="utf-8",
    )


def test_make_chunk_records_is_stable_and_deduplicates_content(tmp_path: Path) -> None:
    input_path = tmp_path / "documents.jsonl"
    content = "# Heading\n" + "Reliable retrieval content. " * 20
    record: chunking.JsonObject = {
        "page_content": content,
        "metadata": {
            "file_extension": ".md",
            "file_hash": "stable-source",
            "document_index": 0,
        },
    }
    write_source_records(input_path, [record, record])

    first, source_count = chunking.make_chunk_records(input_path, 160, 20)
    second, _ = chunking.make_chunk_records(input_path, 160, 20)

    assert source_count == 2
    assert first == second
    metadata = [item["metadata"] for item in first]
    assert all(isinstance(item, dict) for item in metadata)
    hashes = [item["content_hash"] for item in metadata if isinstance(item, dict)]
    assert len(hashes) == len(set(hashes))


def test_short_pdf_chunks_are_discarded_but_short_text_is_kept() -> None:
    short_pdf: chunking.JsonObject = {
        "page_content": "short",
        "metadata": {"file_extension": ".pdf"},
    }
    short_text: chunking.JsonObject = {
        "page_content": "short",
        "metadata": {"file_extension": ".txt"},
    }

    assert chunking.records_for_source(short_pdf, 1, 100, 10, set()) == []
    assert len(chunking.records_for_source(short_text, 1, 100, 10, set())) == 1


def test_malformed_source_record_reports_its_line() -> None:
    with pytest.raises(ValueError, match="line 7"):
        chunking.parse_source_record("not-json", 7)
    with pytest.raises(TypeError, match="line 8"):
        chunking.parse_source_record("[]", 8)


def test_main_writes_chunk_output(tmp_path: Path) -> None:
    input_path = tmp_path / "documents.jsonl"
    output_path = tmp_path / "chunks.jsonl"
    write_source_records(
        input_path,
        [
            {
                "page_content": "A useful document with enough content to become a retrieval chunk.",
                "metadata": {"file_extension": ".txt", "file_hash": "source"},
            }
        ],
    )

    result = chunking.main(
        [
            "--input",
            str(input_path),
            "--output",
            str(output_path),
            "--chunk-size",
            "100",
            "--chunk-overlap",
            "10",
        ]
    )

    assert result == 0
    assert json.loads(output_path.read_text(encoding="utf-8"))["metadata"]["chunk_id"]
