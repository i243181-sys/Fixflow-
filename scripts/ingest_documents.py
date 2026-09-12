"""Organize and load the FixFlow documentation corpus.

Examples:
    python3 scripts/ingest_documents.py --organize
    python3 scripts/ingest_documents.py --organize --load
    python3 scripts/ingest_documents.py --load --output doc/processed/documents.jsonl

Install the optional loader dependencies first:
    python3 -m pip install -r requirements-ingestion.txt
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from collections import Counter
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = PROJECT_ROOT / "doc"
ORGANIZED_DIR = SOURCE_DIR / "data"
DEFAULT_OUTPUT = SOURCE_DIR / "processed" / "documents.jsonl"

TEXT_EXTENSIONS = {
    ".txt",
    ".md",
    ".rst",
    ".py",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".java",
    ".cpp",
    ".c",
    ".h",
    ".cs",
    ".go",
    ".rs",
    ".php",
    ".rb",
    ".css",
    ".scss",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".cfg",
    ".conf",
    ".sh",
    ".bash",
    ".dockerfile",
    ".sql",
    ".log",
}
SUPPORTED_EXTENSIONS = TEXT_EXTENSIONS | {".pdf", ".html", ".htm", ".csv", ".docx"}

# These are alternate renderings of the same Python documentation. The text
# export is smaller, cleaner, and avoids indexing thousands of navigation assets.
IGNORED_DIRECTORY_NAMES = {
    "data",
    "processed",
    "python-3.14-docs-html",
    "python-3.14-docs-texinfo",
}


def file_hash(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def relative_source(file_path: Path) -> str:
    try:
        return file_path.relative_to(SOURCE_DIR).as_posix()
    except ValueError:
        return file_path.as_posix()


def category_for(file_path: Path) -> str:
    relative = file_path.relative_to(SOURCE_DIR)
    if relative.parts and relative.parts[0] == "python-3.14-docs-text":
        return "python"
    if file_path.suffix.lower() in {".md", ".rst"}:
        return "guides"
    if file_path.suffix.lower() == ".pdf":
        return "pdf"
    if file_path.suffix.lower() in TEXT_EXTENSIONS:
        return "text"
    return "other"


def should_include(file_path: Path) -> bool:
    if not file_path.is_file():
        return False
    try:
        relative_parts = file_path.relative_to(SOURCE_DIR).parts
    except ValueError:
        relative_parts = file_path.parts
    if any(part in IGNORED_DIRECTORY_NAMES for part in relative_parts):
        return False
    return file_path.suffix.lower() in SUPPORTED_EXTENSIONS


def discover_files(root: Path, excluded_names: set[str] | None = None, max_size_mb: float | None = None) -> list[Path]:
    excluded_names = excluded_names or set()

    def allowed(path: Path) -> bool:
        if path.name in excluded_names or path.relative_to(root).as_posix() in excluded_names:
            return False
        if max_size_mb is not None and path.stat().st_size > max_size_mb * 1024 * 1024:
            return False
        return True

    if root == ORGANIZED_DIR:
        return sorted(
            path
            for path in root.rglob("*")
            if path.is_file()
            and path.suffix.lower() in SUPPORTED_EXTENSIONS
            and allowed(path)
        )
    return sorted(path for path in root.rglob("*") if should_include(path) and allowed(path))


def organize_files(files: list[Path], replace: bool = False) -> list[Path]:
    ORGANIZED_DIR.mkdir(parents=True, exist_ok=True)
    organized: list[Path] = []

    for source in files:
        relative_parent = source.relative_to(SOURCE_DIR).parent
        target_dir = ORGANIZED_DIR / category_for(source) / relative_parent
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / source.name
        if target.exists() and not replace:
            organized.append(target)
            continue
        shutil.copy2(source, target)
        organized.append(target)

    return organized


def loader_for(file_path: Path) -> Any:
    from langchain_community.document_loaders import (
        BSHTMLLoader,
        CSVLoader,
        Docx2txtLoader,
        PyPDFLoader,
        TextLoader,
    )

    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        return PyPDFLoader(str(file_path))
    if suffix in {".html", ".htm"}:
        return BSHTMLLoader(str(file_path), open_encoding="utf-8")
    if suffix in TEXT_EXTENSIONS:
        return TextLoader(str(file_path), encoding="utf-8", autodetect_encoding=True)
    if suffix == ".csv":
        return CSVLoader(file_path=str(file_path), encoding="utf-8")
    if suffix == ".docx":
        return Docx2txtLoader(str(file_path))
    return None


def load_file(file_path: Path) -> tuple[list[Any], str]:
    loader = loader_for(file_path)
    if loader is None:
        return [], "unsupported"

    try:
        source_hash = file_hash(file_path)
        loaded = loader.load()
        documents = []
        for index, document in enumerate(loaded):
            if not document.page_content or not document.page_content.strip():
                continue
            document.metadata.update(
                {
                    "source": str(file_path),
                    "relative_path": relative_source(file_path),
                    "filename": file_path.name,
                    "file_extension": file_path.suffix.lower(),
                    "file_size_bytes": file_path.stat().st_size,
                    "document_index": index,
                    "file_hash": source_hash,
                }
            )
            documents.append(document)
        return documents, "loaded"
    except Exception as error:  # Loader failures should not stop the corpus run.
        print(f"  FAILED {relative_source(file_path)}: {error}")
        return [], "failed"


def json_safe(value: Any) -> Any:
    try:
        json.dumps(value)
        return value
    except TypeError:
        return str(value)


def write_jsonl(documents: list[Any], output: Path, append: bool = False) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("a" if append else "w", encoding="utf-8") as stream:
        for document in documents:
            stream.write(
                json.dumps(
                    {
                        "page_content": document.page_content,
                        "metadata": {key: json_safe(value) for key, value in document.metadata.items()},
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )


def run(
    source_dir: Path,
    output: Path,
    organize: bool,
    load: bool,
    replace: bool,
    excluded_names: set[str],
    max_size_mb: float | None,
    append: bool,
) -> int:
    if not source_dir.is_dir():
        raise NotADirectoryError(f"Documentation directory does not exist: {source_dir}")

    source_files = discover_files(source_dir, excluded_names, max_size_mb)
    files = organize_files(source_files, replace=replace) if organize else source_files

    print(f"Source directory: {source_dir}")
    print(f"Supported files discovered: {len(source_files)}")
    if organize:
        print(f"Organized copies: {ORGANIZED_DIR}")

    if not load:
        print("Organization complete. Run with --load to create the JSONL document snapshot.")
        return 0

    try:
        import langchain_community  # noqa: F401
    except ModuleNotFoundError as error:
        missing = error.name or "langchain-community"
        print(
            f"Missing Python dependency: {missing}\n"
            "Install the ingestion dependencies with:\n"
            "  python3 -m pip install -r requirements-ingestion.txt"
        )
        return 1

    documents: list[Any] = []
    stats = Counter()
    for number, file_path in enumerate(files, start=1):
        print(f"[{number}/{len(files)}] {file_path.name}")
        loaded, status = load_file(file_path)
        stats[status] += 1
        documents.extend(loaded)
        print(f"  {status}: {len(loaded)} document(s)")

    write_jsonl(documents, output, append=append)
    print("\nINGESTION SUMMARY")
    print(f"Files processed: {len(files)}")
    print(f"Files loaded: {stats['loaded']}")
    print(f"Files failed: {stats['failed']}")
    print(f"LangChain Documents: {len(documents)}")
    print(f"JSONL output: {output}")
    return 0 if stats["failed"] == 0 else 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--organize", action="store_true", help="Copy supported files into doc/data categories")
    parser.add_argument("--replace", action="store_true", help="Replace existing organized copies")
    parser.add_argument("--load", action="store_true", help="Load documents after organizing")
    parser.add_argument("--source", type=Path, default=None, help="Override the source directory")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="JSONL output path")
    parser.add_argument(
        "--exclude",
        action="append",
        default=[],
        metavar="NAME",
        help="Exclude a filename or relative path; repeat the option for multiple files",
    )
    parser.add_argument(
        "--max-size-mb",
        type=float,
        default=None,
        help="Skip source files larger than this size in megabytes",
    )
    parser.add_argument("--append", action="store_true", help="Append records to an existing JSONL output")
    return parser.parse_args()


if __name__ == "__main__":
    arguments = parse_args()
    source = (arguments.source or (
        SOURCE_DIR if arguments.organize else ORGANIZED_DIR if ORGANIZED_DIR.exists() else SOURCE_DIR
    )).resolve()
    output = arguments.output.resolve()
    raise SystemExit(
        run(
            source,
            output,
            arguments.organize,
            arguments.load,
            arguments.replace,
            set(arguments.exclude),
            arguments.max_size_mb,
            arguments.append,
        )
    )
