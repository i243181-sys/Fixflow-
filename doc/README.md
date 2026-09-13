# Optional FixFlow JSONL snapshots

Production uploads persist documents and chunks directly in PostgreSQL. Use the Knowledge Sources page for new files; the commands below are optional offline exports/debug snapshots, not the primary store. See [project setup](../README.md) for database startup and the optional JSONL importer.

Place source documents in this directory. The ingestion script preserves the originals and creates a clean working copy under `doc/data/`.

## First run

From the project root:

```bash
python3 -m pip install -r requirements-ingestion.txt
python3 scripts/ingest_documents.py --organize
python3 scripts/ingest_documents.py --load
```

To do both steps together:

```bash
python3 scripts/ingest_documents.py --organize --load
```

The organized files are grouped into `doc/data/guides`, `doc/data/pdf`, `doc/data/python`, and `doc/data/text`. Loaded LangChain documents are written to `doc/processed/documents.jsonl` as an optional snapshot.

The script includes PDFs, Markdown, text, RST, source/config files, CSV, HTML, and DOCX. It intentionally skips the generated Python HTML and Texinfo trees because the text export already contains the same documentation without navigation assets. EPUB is also left out until an EPUB-specific loader is added.

## Create embedding-ready chunks

After loading, create stable retrieval chunks:

```bash
python3 scripts/chunk_documents.py
```

This writes `doc/processed/chunks.jsonl`. Markdown is split by headings, source code uses code-aware separators, and every chunk keeps source/page metadata with a stable `chunk_id`. Import the snapshot with `python -m scripts.import_jsonl_to_db`; the future embedding pipeline will read PostgreSQL chunks.

## Adding more documentation

Copy new files into `doc/`, then rerun:

```bash
python3 scripts/ingest_documents.py --organize --load
```

Use `--replace` when an existing source file has changed and its organized copy should be refreshed.

Uploads from the FixFlow UI load and chunk only the new file, using batched PostgreSQL transactions. Successful sources become `ready_for_embedding`, with all vector fields NULL until a real embedding pipeline is configured. No JSONL reload or rewrite occurs.

## Reset and restart

Back up any JSONL snapshots you need before removing generated `doc/data` or `doc/processed` files. Those files are independent of PostgreSQL. Do not remove `doc/uploads`, the database volume, or `.local/postgres/data` as part of snapshot cleanup.

To skip a known problematic file, repeat `--exclude`:

```bash
python3 scripts/ingest_documents.py \
	--organize --load \
	--exclude Docker.pdf
```

To skip every file larger than a limit, use megabytes:

```bash
python3 scripts/ingest_documents.py \
	--organize --load \
	--max-size-mb 10
```

Skipped files remain in the original `doc/` directory and can be loaded later with a separate run.
