"""Create retrieval-ready chunks from the loaded document JSONL snapshot.

Run:
    python3 scripts/chunk_documents.py
    python3 scripts/chunk_documents.py --input doc/processed/documents.jsonl
"""

from __future__ import annotations

import argparse
import hashlib
import json
import tempfile
from collections.abc import Sequence
from pathlib import Path
from typing import IO, TypeAlias

from langchain_core.documents import Document
from langchain_text_splitters import (
    MarkdownHeaderTextSplitter,
    RecursiveCharacterTextSplitter,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / "doc" / "processed" / "documents.jsonl"
DEFAULT_OUTPUT = PROJECT_ROOT / "doc" / "processed" / "chunks.jsonl"

MARKDOWN_HEADERS = [("#", "h1"), ("##", "h2"), ("###", "h3"), ("####", "h4")]
CODE_EXTENSIONS = {
    ".py",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".java",
    ".go",
    ".rs",
    ".cpp",
    ".c",
    ".h",
}
CODE_SEPARATORS = [
    "\nclass ",
    "\ndef ",
    "\nasync def ",
    "\nfunction ",
    "\nexport ",
    "\nconst ",
    "\n\n",
    "\n",
    " ",
    "",
]
TEXT_SEPARATORS = ["\n# ", "\n## ", "\n### ", "\n\n", "\n", ". ", "! ", "? ", " ", ""]

JsonObject: TypeAlias = dict[str, object]
ChunkRecord: TypeAlias = dict[str, object]


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def metadata_from(item: JsonObject) -> JsonObject:
    metadata = item.get("metadata")
    return dict(metadata) if isinstance(metadata, dict) else {}


def text_splitter(
    extension: str,
    chunk_size: int,
    chunk_overlap: int,
) -> RecursiveCharacterTextSplitter:
    separators = CODE_SEPARATORS if extension in CODE_EXTENSIONS else TEXT_SEPARATORS
    return RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=separators,
        add_start_index=True,
    )


def markdown_chunks(
    content: str,
    metadata: JsonObject,
    chunk_size: int,
    chunk_overlap: int,
) -> list[Document]:
    sections = MarkdownHeaderTextSplitter(
        headers_to_split_on=MARKDOWN_HEADERS,
        strip_headers=False,
    ).split_text(content)
    if not sections:
        sections = [Document(page_content=content, metadata=metadata)]
    splitter = text_splitter(".md", chunk_size, chunk_overlap)
    for section in sections:
        section.metadata = {**metadata, **section.metadata}
    return splitter.split_documents(sections)


def chunk_document(
    item: JsonObject,
    chunk_size: int,
    chunk_overlap: int,
) -> list[Document]:
    content = str(item.get("page_content") or "").strip()
    if not content:
        return []

    metadata = metadata_from(item)
    extension = str(metadata.get("file_extension") or "").lower()
    if extension in {".md", ".rst"}:
        return markdown_chunks(content, metadata, chunk_size, chunk_overlap)
    document = Document(page_content=content, metadata=metadata)
    return text_splitter(extension, chunk_size, chunk_overlap).split_documents([document])


def parse_source_record(line: str, line_number: int) -> JsonObject:
    try:
        item = json.loads(line)
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid JSON at line {line_number}: {error.msg}") from error
    if not isinstance(item, dict):
        raise TypeError(f"JSON record at line {line_number} must be an object")
    return item


def keep_chunk(text: str, source_content: str, extension: str) -> bool:
    if not text:
        return False
    return len(text) >= 40 or (len(source_content) < 40 and extension != ".pdf")


def chunk_record(
    chunk: Document,
    source_identity: str,
    line_number: int,
    chunk_index: int,
    digest: str,
    chunk_size: int,
    chunk_overlap: int,
) -> ChunkRecord:
    text = chunk.page_content.strip()
    metadata = dict(chunk.metadata)
    identity = str(metadata.get("file_hash") or metadata.get("source") or source_identity)
    document_index = metadata.get("document_index", line_number)
    chunk_id = hashlib.sha256(f"{identity}:{document_index}:{chunk_index}:{digest}".encode()).hexdigest()[:24]
    metadata.update(
        {
            "chunk_id": chunk_id,
            "chunk_index": chunk_index,
            "chunk_chars": len(text),
            "content_hash": digest,
            "chunk_size_chars": chunk_size,
            "chunk_overlap_chars": chunk_overlap,
        }
    )
    return {"page_content": text, "metadata": metadata}


def records_for_source(
    item: JsonObject,
    line_number: int,
    chunk_size: int,
    chunk_overlap: int,
    seen_content: set[str],
) -> list[ChunkRecord]:
    content = str(item.get("page_content") or "").strip()
    if not content:
        return []
    metadata = metadata_from(item)
    extension = str(metadata.get("file_extension") or "").lower()
    records: list[ChunkRecord] = []
    for chunk_index, chunk in enumerate(chunk_document(item, chunk_size, chunk_overlap)):
        text = chunk.page_content.strip()
        if not keep_chunk(text, content, extension):
            continue
        digest = content_hash(text)
        if len(text) >= 40 and digest in seen_content:
            continue
        seen_content.add(digest)
        records.append(
            chunk_record(
                chunk,
                str(line_number),
                line_number,
                chunk_index,
                digest,
                chunk_size,
                chunk_overlap,
            )
        )
    return records


def make_chunk_records(
    input_path: Path,
    chunk_size: int,
    chunk_overlap: int,
) -> tuple[list[ChunkRecord], int]:
    records: list[ChunkRecord] = []
    seen_content: set[str] = set()
    source_documents = 0

    with input_path.open(encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, start=1):
            if not line.strip():
                continue
            item = parse_source_record(line, line_number)
            if not str(item.get("page_content") or "").strip():
                continue
            source_documents += 1
            records.extend(
                records_for_source(
                    item,
                    line_number,
                    chunk_size,
                    chunk_overlap,
                    seen_content,
                )
            )
    return records, source_documents


def write_records(records: list[ChunkRecord], stream: IO[str]) -> None:
    stream.writelines(json.dumps(record, ensure_ascii=False) + "\n" for record in records)


def write_jsonl(records: list[ChunkRecord], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=output.parent,
            prefix=f".{output.name}.",
            delete=False,
        ) as stream:
            temporary_path = Path(stream.name)
            write_records(records, stream.file)
        temporary_path.replace(output)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--chunk-size", type=int, default=3000)
    parser.add_argument("--chunk-overlap", type=int, default=400)
    args = parser.parse_args(argv)
    if args.chunk_size <= 0 or not 0 <= args.chunk_overlap < args.chunk_size:
        parser.error("chunk overlap must be non-negative and smaller than chunk size")
    return args


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    input_path = args.input.resolve()
    output_path = args.output.resolve()
    if not input_path.is_file():
        raise FileNotFoundError(f"Input JSONL does not exist: {input_path}")

    records, source_documents = make_chunk_records(
        input_path,
        args.chunk_size,
        args.chunk_overlap,
    )
    write_jsonl(records, output_path)
    print(f"Source documents: {source_documents}")
    print(f"Unique chunks: {len(records)}")
    print(f"Chunk size: {args.chunk_size} characters")
    print(f"Chunk overlap: {args.chunk_overlap} characters")
    print(f"Output: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
