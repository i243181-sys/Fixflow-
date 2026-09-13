from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts import ingest_documents as ingestion


def test_discover_files_filters_extensions_exclusions_size_and_symlinks(
    tmp_path: Path,
) -> None:
    included = tmp_path / "guide.md"
    included.write_text("guide", encoding="utf-8")
    excluded = tmp_path / "skip.txt"
    excluded.write_text("skip", encoding="utf-8")
    (tmp_path / "image.png").write_bytes(b"image")
    symlink = tmp_path / "linked.md"
    symlink.symlink_to(included)

    files = ingestion.discover_files(tmp_path, {"skip.txt"}, max_size_mb=1)

    assert files == [included]


def test_discover_files_rejects_nonpositive_size(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="greater than zero"):
        ingestion.discover_files(tmp_path, max_size_mb=0)


def test_organize_files_supports_an_external_source_root(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    source_root = tmp_path / "external"
    source_file = source_root / "nested" / "guide.md"
    source_file.parent.mkdir(parents=True)
    source_file.write_text("# Guide", encoding="utf-8")
    organized_root = tmp_path / "organized"
    monkeypatch.setattr(ingestion, "ORGANIZED_DIR", organized_root)

    organized = ingestion.organize_files([source_file], source_root)

    expected = organized_root / "guides" / "nested" / "guide.md"
    assert organized == [expected]
    assert expected.read_text(encoding="utf-8") == "# Guide"


def test_load_file_and_jsonl_output(tmp_path: Path) -> None:
    source = tmp_path / "notes.md"
    source.write_text("# Notes\nUseful context", encoding="utf-8")

    documents, status = ingestion.load_file(source, tmp_path)

    assert status == "loaded"
    assert documents[0].metadata["relative_path"] == "notes.md"
    output = tmp_path / "documents.jsonl"
    ingestion.write_jsonl(documents, output)
    ingestion.write_jsonl(documents, output, append=True)
    records = [json.loads(line) for line in output.read_text(encoding="utf-8").splitlines()]
    assert len(records) == 2
    assert records[0]["metadata"]["file_hash"] == records[1]["metadata"]["file_hash"]
