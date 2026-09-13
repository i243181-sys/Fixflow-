import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = process.cwd();
const configuredDataRoot = process.env.FIXFLOW_DATA_DIR?.trim();
const DATA_ROOT = configuredDataRoot
  ? path.resolve(PROJECT_ROOT, "backend", configuredDataRoot)
  : path.join(PROJECT_ROOT, "doc");
const UPLOAD_ROOT = path.join(DATA_ROOT, "uploads");
const INDEX_FILE = path.join(DATA_ROOT, "processed", "documents.jsonl");
const CHUNKS_FILE = path.join(DATA_ROOT, "processed", "chunks.jsonl");
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024;
const MAX_FILENAME_LENGTH = 255;
const INGESTION_TIMEOUT_MS = 300_000;
const PROCESS_BUFFER_BYTES = 10 * 1024 * 1024;
const MAX_REMOTE_URL_LENGTH = 2048;
const SOURCE_KINDS = new Set(["docs", "github", "upload"] as const);
const ALLOWED_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".rst",
  ".pdf",
  ".docx",
  ".csv",
  ".html",
  ".htm",
]);

type SourceKind = "docs" | "github" | "upload";
let ingestionQueue: Promise<void> = Promise.resolve();

interface DocumentUpload {
  bytes: Uint8Array;
  displayName: string;
  fileName: string;
}

class UploadError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function safeFileName(name: string): string {
  const basename = path.basename(name);
  const extension = path.extname(basename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new UploadError("Unsupported document type.", 415);
  }
  const stem = basename
    .slice(0, -extension.length)
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(0, MAX_FILENAME_LENGTH - extension.length);
  if (!stem || stem === "." || stem === "..") {
    throw new UploadError("Unsupported document type.", 415);
  }
  return `${stem}${extension}`;
}

function pythonExecutable(): string {
  const executable = process.env.FIXFLOW_PYTHON?.trim() || "python3";
  if (executable.includes("\0") || /[\r\n]/.test(executable)) {
    throw new Error("FIXFLOW_PYTHON is invalid.");
  }
  return executable;
}

function validateRemoteUrl(value: string): string {
  if (value.length > MAX_REMOTE_URL_LENGTH) {
    throw new UploadError("Source URL is too long.", 422);
  }
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new UploadError("Provide a valid HTTP(S) source URL without credentials.", 422);
  }
  const protocolIsAllowed = parsed.protocol === "http:" || parsed.protocol === "https:";
  if (!protocolIsAllowed || parsed.username || parsed.password) {
    throw new UploadError("Provide a valid HTTP(S) source URL without credentials.", 422);
  }
  return parsed.toString();
}

function validateRequestSize(request: Request): void {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) return;
  const declaredSize = Number(contentLength);
  if (Number.isFinite(declaredSize) && declaredSize > MAX_REQUEST_BYTES) {
    throw new UploadError("Request exceeds the 50 MB upload limit.", 413);
  }
}

async function requestForm(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    throw new UploadError("Invalid multipart form data.", 400);
  }
}

function sourceKind(form: FormData): SourceKind {
  const kind = String(form.get("kind") || "upload");
  if (!SOURCE_KINDS.has(kind as SourceKind)) {
    throw new UploadError("Unsupported source kind.", 422);
  }
  return kind as SourceKind;
}

async function documentUpload(form: FormData, value: string): Promise<DocumentUpload> {
  const uploaded = form.get("file");
  if (uploaded instanceof File) {
    if (uploaded.size > MAX_UPLOAD_BYTES) {
      throw new UploadError("File exceeds the 50 MB upload limit.", 413);
    }
    if (uploaded.size === 0) {
      throw new UploadError("Document cannot be empty.", 422);
    }
    const fileName = safeFileName(uploaded.name);
    return {
      bytes: new Uint8Array(await uploaded.arrayBuffer()),
      displayName: fileName,
      fileName,
    };
  }

  const content = form.get("content");
  if (typeof content !== "string" || !content.trim()) {
    throw new UploadError("Provide document content or a file.", 400);
  }
  const bytes = new TextEncoder().encode(content);
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new UploadError("Document exceeds the 50 MB upload limit.", 413);
  }
  return {
    bytes,
    displayName: value.slice(0, MAX_FILENAME_LENGTH) || "pasted-document.md",
    fileName: "pasted-document.md",
  };
}

async function storeUpload(upload: DocumentUpload): Promise<string> {
  const uploadDirectory = path.join(UPLOAD_ROOT, randomUUID());
  await mkdir(uploadDirectory, { recursive: true, mode: 0o700 });
  await writeFile(path.join(uploadDirectory, upload.fileName), upload.bytes, {
    flag: "wx",
    mode: 0o600,
  });
  await mkdir(path.dirname(INDEX_FILE), { recursive: true });
  return uploadDirectory;
}

async function runIngestion(uploadDirectory: string): Promise<void> {
  const executable = pythonExecutable();
  const options = {
    cwd: PROJECT_ROOT,
    maxBuffer: PROCESS_BUFFER_BYTES,
    timeout: INGESTION_TIMEOUT_MS,
  };
  await execFileAsync(
    executable,
    [
      path.join(PROJECT_ROOT, "scripts", "ingest_documents.py"),
      "--source",
      uploadDirectory,
      "--load",
      "--append",
      "--output",
      INDEX_FILE,
    ],
    options
  );
  await execFileAsync(
    executable,
    [
      path.join(PROJECT_ROOT, "scripts", "chunk_documents.py"),
      "--input",
      INDEX_FILE,
      "--output",
      CHUNKS_FILE,
    ],
    options
  );
}

async function serializedIngestion<T>(task: () => Promise<T>): Promise<T> {
  const result = ingestionQueue.then(task, task);
  ingestionQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function countJsonLines(contents: string): number {
  return contents.split("\n").filter(Boolean).length;
}

function errorCode(error: unknown): unknown {
  return error instanceof Error && "code" in error ? error.code : undefined;
}

async function readLineCount(filePath: string): Promise<number> {
  try {
    return countJsonLines(await readFile(filePath, "utf8"));
  } catch (error) {
    if (errorCode(error) === "ENOENT") return 0;
    throw error;
  }
}

function queuedSource(value: string) {
  return NextResponse.json({
    id: `queued-${randomUUID()}`,
    name: validateRemoteUrl(value),
    kind: "github",
    status: "queued",
    chunks: 0,
    updated: new Date().toISOString(),
    detail: "remote URL queued; backend fetcher required",
  });
}

function uploadResponse(
  upload: DocumentUpload,
  kind: Exclude<SourceKind, "github">,
  chunks: number
) {
  return NextResponse.json({
    id: `source-${randomUUID()}`,
    name: upload.displayName,
    kind,
    status: "indexed",
    chunks,
    updated: new Date().toISOString(),
    detail: `${chunks} total chunks ready for embeddings`,
  });
}

function errorResponse(error: unknown) {
  if (error instanceof UploadError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: "Document ingestion failed." }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    validateRequestSize(request);
    const form = await requestForm(request);
    const kind = sourceKind(form);
    const value = String(form.get("value") || "").trim();
    if (kind === "github") return queuedSource(value);

    const upload = await documentUpload(form, value);
    const uploadDirectory = await storeUpload(upload);
    const totalChunks = await serializedIngestion(async () => {
      const beforeLines = await readLineCount(INDEX_FILE);
      await runIngestion(uploadDirectory);
      const afterLines = await readLineCount(INDEX_FILE);
      const chunkCount = await readLineCount(CHUNKS_FILE);
      return chunkCount || Math.max(afterLines - beforeLines, 0);
    });
    return uploadResponse(upload, kind, totalChunks);
  } catch (error) {
    return errorResponse(error);
  }
}
