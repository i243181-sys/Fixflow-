# FixFlow

Next.js + FastAPI with PostgreSQL as the primary persistent store. Files → Documents → Chunks → PostgreSQL/pgvector. Embeddings remain NULL; no embedding model or reranker is installed.

## Requirements

- Node.js 20.9+ and Python 3.11+
- PostgreSQL 18 with pgvector (or Docker Compose)
- Clerk keys for the existing sign-in UI

## Dependencies and environment

```bash
npm ci
python3 -m venv myenev
myenev/bin/python -m pip install -r requirements-dev.txt
```

Keep your existing environment files. For a fresh checkout, copy `.env.example` to `.env.local`, add your Clerk keys, and set `NEXT_PUBLIC_API_URL=http://localhost:8000`. Copy `backend/.env.example` to `backend/.env` and set your own `POSTGRES_PASSWORD` (generate one with `openssl rand -hex 32`). Do not commit credentials.

The backend and Alembic automatically read `backend/.env`; shell variables take precedence. `DATABASE_URL`, when set, overrides the separate `POSTGRES_*` fields. Do not put database credentials in `NEXT_PUBLIC_*` variables. Relative `FIXFLOW_DATA_DIR` paths remain relative to `backend/`. `FIXFLOW_PYTHON` is no longer needed: ingestion runs in the backend's own virtual environment, without subprocesses.

## PostgreSQL setup

Choose one database setup, not both.

### Docker (fresh checkout)

Use `backend/.env.example` as the template and set a nonempty `POSTGRES_PASSWORD`. Remove any native socket `DATABASE_URL` override before using Docker.

```bash
docker compose --env-file backend/.env up -d --wait db
myenev/bin/alembic upgrade head
```

The database binds only to localhost; the named volume survives container/backend restarts. Do not run `docker compose down -v` unless you intend to erase the database.

### Native Linux (this workspace)

Docker daemon access was unavailable during implementation. A PostgreSQL 18/pgvector runtime and initialized cluster are installed under ignored `.local/postgres/`; the private `backend/.env` points to this cluster. It uses Unix-socket peer authentication and exposes no TCP listener.

```bash
bash scripts/local_postgres.sh start
myenev/bin/alembic upgrade head
```

`bash scripts/local_postgres.sh status` checks the server; `stop` stops it without deleting data. Back up `.local/postgres/data` using PostgreSQL backup tools. On another machine, use Docker above or install PostgreSQL/pgvector and initialize a native cluster with `initdb` before using this helper. The ignored runtime/data are not distributed with Git.

For managed PostgreSQL, set `DATABASE_URL` to your provider's PostgreSQL connection URL. The migration role needs permission to install the vector extension; provision that permission with your database administrator. Use a separate least-privileged application role in production.

## Start

```bash
myenev/bin/python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
# In another terminal:
npm run dev
```

Frontend: http://localhost:3000. Health: http://localhost:8000/health. API documentation: http://localhost:8000/docs. Health reports API, database, and pgvector readiness; unavailable dependencies return HTTP 503 without credentials or internal errors.

## Ingestion and persistence

`POST /api/documents` accepts the existing multipart fields (`kind`, `value`, `content`, `file`) and returns HTTP 202 with `source_id`, `id`, and status. Uploads are streamed into private server-generated paths, validated by extension and capped at 50 MB. The response is acceptance, not completed ingestion.

A database-backed worker loads only the new file, batches document/chunk inserts in one transaction, then transitions `uploaded → processing → chunked → ready_for_embedding`. Failures roll back documents/chunks and persist `failed` plus a safe error. Pending jobs survive restarts. Advisory locks coordinate concurrent workers. Duplicate uploads return the existing source; re-uploading a failed source retries it without creating a second source. No old corpus files are reloaded.

`GET /api/sources`, `GET /api/sources/{id}`, and `GET /api/sources/{id}/status` return persisted counts/status/errors. Existing debug sessions, chats, and saved solutions are persistent too. No delete HTTP route existed previously; the repository supports cascading deletion for administrative use. Existing follow-up keyword retrieval uses PostgreSQL full-text search, not fabricated vector similarity.

Remote URL registration remains available but reports a clear failed/not-configured state: there is no remote fetcher. Scanned PDFs require OCR before upload. Local single-user access remains the deployment model; the backend is not a multi-tenant authorization service.

The Knowledge Sources page polls pending jobs and shows “Ready for embedding,” never “Indexed” before vectors exist. The original UI layout is unchanged.

### Optional legacy import

No existing JSONL is imported or modified automatically.

```bash
myenev/bin/python -m scripts.import_jsonl_to_db \
  --documents doc/processed/documents.jsonl \
  --chunks doc/processed/chunks.jsonl --batch-size 100
```

The importer streams records, skips malformed lines, preserves metadata, reports progress, and deduplicates across reruns. Either input may be omitted. Documents-only imports generate chunks; chunks-only imports retain fragments as documents with `imported_from_chunk=true` metadata because original pages cannot be reconstructed. Each batch is transactional and restartable. Sources without usable chunks remain failed with an explanatory error.

The old `scripts/ingest_documents.py` and `scripts/chunk_documents.py` are optional offline JSONL export/debug tools, not production storage.

## Future vector pipeline

`backend/repositories/vectors.py` provides `insert_embeddings()`, `similarity_search()`, `delete_source_vectors()`, and `count_embedded_chunks()`. Mutating calls use the caller's transaction. No vectors are generated.

Leave `EMBEDDING_DIM` and `EMBEDDING_MODEL` unset now. The migration uses an unconstrained nullable vector column; when a real model is selected, configure both centrally and add a dimension-specific migration/index as appropriate. The repository validates finite, nonzero vectors and dimensions. Search without configured/populated embeddings raises “Embedding pipeline not configured.” Deterministic vectors exist only in database tests.

## Quality checks

Database tests require an explicitly disposable database whose name ends in `_test`; they run Alembic downgrade/upgrade and reset its tables. Never point `TEST_DATABASE_URL` at application data.

For this native workspace:

```bash
export TEST_DATABASE_URL="postgresql+asyncpg://$(id -un)@/fixflow_test?host=$(pwd)/.local/postgres&port=55432"
myenev/bin/python -m pytest
```

For Docker, create the disposable database first (once):

```bash
docker compose --env-file backend/.env exec db sh -c 'createdb -U "$POSTGRES_USER" fixflow_test'
```

Then set `TEST_DATABASE_URL` to that database's connection URL using your configured credentials. Missing `TEST_DATABASE_URL` skips DB integration tests rather than touching application data.

```bash
myenev/bin/alembic check
myenev/bin/python -m ruff check backend scripts
myenev/bin/python -m mypy backend scripts
myenev/bin/python -m pytest
npm run lint
npm run typecheck
npm run test:coverage
npm run build
```

Coverage: `coverage/frontend/lcov.info` and `coverage/python-coverage.xml`; both are wired to `sonar-project.properties`. The integration suite verifies migrations, pgvector, deduplication, partial-failure rollback, retries, cascades, API health, and restart recovery. Existing loader dependencies emit a LangChain Community deprecation warning; replacing those working loaders is outside this database integration.

After producing coverage:

```bash
sonar-scanner -Dsonar.host.url="$SONAR_HOST_URL" -Dsonar.token="$SONAR_TOKEN"
```
