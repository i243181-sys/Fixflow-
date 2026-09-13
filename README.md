# FixFlow

FixFlow is a Next.js application with a FastAPI service and a local documentation-ingestion pipeline. It accepts debugging context, records diagnosis sessions, and uses indexed documentation for follow-up answers.

## Requirements

- Node.js 20.9 or newer
- Python 3.11 or newer
- A Clerk application for sign-in UI

## Local setup

Install the frontend and Python dependencies:

```bash
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements-dev.txt
```

Copy `.env.example` to `.env.local`, add the Clerk keys for your application, and keep `NEXT_PUBLIC_API_URL=http://localhost:8000` for local development. Export the backend settings from `backend/.env.example`, or provide the equivalent values through your process manager.

Start the API and frontend in separate terminals:

```bash
FRONTEND_ORIGINS=http://localhost:3000 FIXFLOW_DATA_DIR=../doc \
  .venv/bin/python -m uvicorn backend.main:app --reload --port 8000
npm run dev
```

The application is available at `http://localhost:3000`; the API health endpoint is `http://localhost:8000/health`.

## Document ingestion

The UI accepts Markdown, text, RST, PDF, DOCX, CSV, and HTML documents up to 50 MB. To build the local index directly:

```bash
.venv/bin/python scripts/ingest_documents.py --organize --load
.venv/bin/python scripts/chunk_documents.py
```

Generated indexes and uploaded documents are intentionally ignored by Git.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run test:coverage
.venv/bin/python -m ruff check backend scripts
.venv/bin/python -m mypy backend scripts
.venv/bin/python -m pytest
npm run build
```

Frontend coverage is written to `coverage/frontend/lcov.info`; Python coverage is written to `coverage/python-coverage.xml`. Both paths are configured in `sonar-project.properties`.

Run SonarQube after the coverage commands:

```bash
sonar-scanner \
  -Dsonar.host.url="$SONAR_HOST_URL" \
  -Dsonar.token="$SONAR_TOKEN"
```
