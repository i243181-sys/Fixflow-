import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = process.cwd();
const UPLOAD_ROOT = path.join(PROJECT_ROOT, "doc", "uploads");
const INDEX_FILE = path.join(PROJECT_ROOT, "doc", "processed", "documents.jsonl");
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function safeFileName(name: string): string {
  const cleaned = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "-");
  return cleaned || "uploaded-document.md";
}

function pythonExecutable(): string {
  return process.env.FIXFLOW_PYTHON || "python3";
}

export async function POST(request: Request) {
  const form = await request.formData();
  const kind = String(form.get("kind") || "upload");
  const value = String(form.get("value") || "");
  const content = form.get("content");
  const uploaded = form.get("file");

  if (kind === "github") {
    return NextResponse.json({
      id: `queued-${randomUUID()}`,
      name: value,
      kind,
      status: "queued",
      chunks: 0,
      updated: new Date().toISOString(),
      detail: "remote URL queued; backend fetcher required",
    });
  }

  let fileName = "pasted-document.md";
  let bytes: Uint8Array;
  if (uploaded instanceof File) {
    fileName = safeFileName(uploaded.name);
    if (uploaded.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File exceeds the 50 MB upload limit." }, { status: 413 });
    }
    bytes = new Uint8Array(await uploaded.arrayBuffer());
  } else if (typeof content === "string" && content.trim()) {
    bytes = new TextEncoder().encode(content);
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Document exceeds the 50 MB upload limit." }, { status: 413 });
    }
  } else {
    return NextResponse.json({ error: "Provide document content or a file." }, { status: 400 });
  }

  const uploadDirectory = path.join(UPLOAD_ROOT, randomUUID());
  const storedFile = path.join(uploadDirectory, fileName);
  await mkdir(uploadDirectory, { recursive: true });
  await writeFile(storedFile, bytes);
  await mkdir(path.dirname(INDEX_FILE), { recursive: true });

  let beforeLines = 0;
  try {
    beforeLines = (await readFile(INDEX_FILE, "utf8")).split("\n").filter(Boolean).length;
  } catch {
    // The first uploaded document creates the index.
  }

  try {
    await execFileAsync(
      pythonExecutable(),
      [
        path.join(PROJECT_ROOT, "scripts", "ingest_documents.py"),
        "--source",
        uploadDirectory,
        "--load",
        "--append",
        "--output",
        INDEX_FILE,
      ],
      { cwd: PROJECT_ROOT, maxBuffer: 10 * 1024 * 1024 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Document ingestion failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let afterLines = beforeLines;
  try {
    afterLines = (await readFile(INDEX_FILE, "utf8")).split("\n").filter(Boolean).length;
  } catch {
    // The loader succeeded only if it created the index, but keep the response safe.
  }

  return NextResponse.json({
    id: `source-${randomUUID()}`,
    name: value || fileName,
    kind: kind === "docs" ? "docs" : "upload",
    status: "indexed",
    chunks: Math.max(afterLines - beforeLines, 0),
    updated: new Date().toISOString(),
    detail: `${Math.max(afterLines - beforeLines, 0)} document chunk(s) added to the local index`,
  });
}
