"""Create retrieval-ready chunks from the loaded document JSONL snapshot.

Run:
    python3 scripts/chunk_documents.py
    python3 scripts/chunk_documents.py --input doc/processed/documents.jsonl
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from langchain_core.documents import Document
from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / "doc" / "processed" / "documents.jsonl"
DEFAULT_OUTPUT = PROJECT_ROOT / "doc" / "processed" / "chunks.jsonl"

MARKDOWN_HEADERS = [("#", "h1"), ("##", "h2"), ("###", "h3"), ("####", "h4")]
CODE_EXTENSIONS = {".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".go", ".rs", ".cpp", ".c", ".h"}
CODE_SEPARATORS = ["\nclass ", "\ndef ", "\nasync def ", "\nfunction ", "\nexport ", "\nconst ", "\n\n", "\n", " ", ""]
TEXT_SEPARATORS = ["\n# ", "\n## ", "\n### ", "\n\n", "\n", ". ", "! ", "? ", " ", ""]


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def chunk_document(item: dict[str, Any], chunk_size: int, chunk_overlap: int) -> list[Document]:
    content = str(item.get("page_content") or "").strip()
    if not content:
        return []

    metadata = dict(item.get("metadata") or {})
    extension = str(metadata.get("file_extension") or "").lower()
    document = Document(page_content=content, metadata=metadata)

    if extension in {".md", ".rst"}:
        header_splitter = MarkdownHeaderTextSplitter(
            headers_to_split_on=MARKDOWN_HEADERS,
            strip_headers=False,
        )
        sections = header_splitter.split_text(content)
        sections = sections or [document]
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=TEXT_SEPARATORS,
            add_start_index=True,
        )
        chunks: list[Document] = []
        for section in sections:
            section.metadata = {**metadata, **section.metadata}
            chunks.extend(splitter.split_documents([section]))
        return chunks

    separators = CODE_SEPARATORS if extension in CODE_EXTENSIONS else TEXT_SEPARATORS
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=separators,
        add_start_index=True,
    )
    return splitter.split_documents([document])


def make_chunk_records(input_path: Path, chunk_size: int, chunk_overlap: int) -> tuple[list[dict[str, Any]], int]:
    records: list[dict[str, Any]] = []
    seen_content: set[str] = set()
    source_documents = 0

    with input_path.open(encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, start=1):
            item = json.loads(line)
            content = str(item.get("page_content") or "").strip()
            if not content:
                continue

            source_documents += 1
            chunks = chunk_document(item, chunk_size, chunk_overlap)
            extension = str((item.get("metadata") or {}).get("file_extension") or "").lower()
            for chunk_index, chunk in enumerate(chunks):
                text = chunk.page_content.strip()
                if not text:
                    continue
                if len(text) < 40 and (len(content) >= 40 or extension == ".pdf"):
                    continue
                digest = content_hash(text)
                if len(text) >= 40 and digest in seen_content:
                    continue
                seen_content.add(digest)
                metadata = dict(chunk.metadata)
                source_identity = str(metadata.get("file_hash") or metadata.get("source") or line_number)
                chunk_id = hashlib.sha256(
                    f"{source_identity}:{metadata.get('document_index', line_number)}:{chunk_index}:{digest}".encode()
                ).hexdigest()[:24]
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
                records.append({"page_content": text, "metadata": metadata})

    return records, source_documents


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--chunk-size", type=int, default=3000)
    parser.add_argument("--chunk-overlap", type=int, default=400)
    args = parser.parse_args()

    if args.chunk_size <= 0 or args.chunk_overlap < 0 or args.chunk_overlap >= args.chunk_size:
        parser.error("chunk overlap must be non-negative and smaller than chunk size")
    if not args.input.is_file():
        raise FileNotFoundError(f"Input JSONL does not exist: {args.input}")

    records, source_documents = make_chunk_records(args.input, args.chunk_size, args.chunk_overlap)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as stream:
        for record in records:
            stream.write(json.dumps(record, ensure_ascii=False) + "\n")

    print(f"Source documents: {source_documents}")
    print(f"Unique chunks: {len(records)}")
    print(f"Chunk size: {args.chunk_size} characters")
    print(f"Chunk overlap: {args.chunk_overlap} characters")
    print(f"Output: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
