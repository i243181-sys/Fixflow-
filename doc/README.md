# FixFlow document ingestion

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

The organized files are grouped into `doc/data/guides`, `doc/data/pdf`, `doc/data/python`, and `doc/data/text`. The loaded LangChain documents are written to `doc/processed/documents.jsonl` for the next chunking and embedding stage.

The script includes PDFs, Markdown, text, RST, source/config files, CSV, HTML, and DOCX. It intentionally skips the generated Python HTML and Texinfo trees because the text export already contains the same documentation without navigation assets. EPUB is also left out until an EPUB-specific loader is added.

## Adding more documentation

Copy new files into `doc/`, then rerun:

```bash
python3 scripts/ingest_documents.py --organize --load
```

Use `--replace` when an existing source file has changed and its organized copy should be refreshed.

## Reset and restart

The generated directories can be safely removed; the original documents in `doc/` are not affected:

```bash
rm -rf doc/data doc/processed
```

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
