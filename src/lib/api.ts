import {
  ASYNCIO_DIAGNOSIS,
  MOCK_CHAT_REPLIES,
  MOCK_KNOWLEDGE,
  MOCK_SAVED,
  MOCK_SESSIONS,
} from "./mock-data";
import type {
  ChatMessage,
  DebugSession,
  Diagnosis,
  SavedSolution,
  SourceType,
} from "./types";

/**
 * FixFlow service layer.
 *
 * All UI reads/writes go through these functions only. Today they resolve
 * locally with simulated latency; when the FastAPI backend is available,
 * each function swaps to a `fetch` call (see the // fastapi: comments)
 * without any component changes.
 *
 * Target endpoints:
 *   POST /api/debug            -> diagnose()
 *   POST /api/chat             -> sendFollowUp()
 *   POST /api/documents        -> addKnowledgeSource()
 *   GET  /api/sessions         -> listSessions()
 *   GET  /api/sessions/{id}    -> getSession()
 *   GET  /api/sources          -> listKnowledgeSources()
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function checkBackendHealth(): Promise<{ status: string; service: string }> {
  return apiFetch<{ status: string; service: string }>("/health");
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) throw new Error("NEXT_PUBLIC_API_URL is not configured");
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: { "Content-Type": "application/json", ...init?.headers },
      ...init,
    });
  } catch {
    throw new Error("Could not connect to the FixFlow backend.");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body?.error?.message || body?.detail || `API request failed (${response.status})`;
    throw new Error(message);
  }
  return body as T;
}

export interface DebugRequest {
  error?: string;
  code?: string;
  context?: string;
  repoUrl?: string;
  techs: string[];
  files?: File[];
}

export async function diagnose(req: DebugRequest): Promise<Diagnosis> {
  if (API_URL) {
    return apiFetch<Diagnosis>("/api/debug", {
      method: "POST",
      body: JSON.stringify({
        error: req.error,
        code: req.code,
        context: req.context,
        repo_url: req.repoUrl,
        techs: req.techs,
      }),
    });
  }
  await delay(2800);
  if (!req.error && !req.code && !req.context) {
    throw new Error("No error, code or context provided.");
  }
  return ASYNCIO_DIAGNOSIS;
}

export async function sendFollowUp(
  question: string,
  _sessionId: string
): Promise<ChatMessage> {
  void question;
  void _sessionId;
  if (API_URL) {
    return apiFetch<ChatMessage>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ question, session_id: _sessionId }),
    });
  }
  await delay(1400);
  const reply = MOCK_CHAT_REPLIES.default;
  return {
    id: `c-${Date.now()}`,
    role: "fixflow",
    text: reply.text,
    sources: reply.sources,
  };
}

export async function listSessions(): Promise<DebugSession[]> {
  if (API_URL) {
    return apiFetch<DebugSession[]>("/api/sessions");
  }
  await delay(400);
  return MOCK_SESSIONS;
}

export async function getSession(id: string): Promise<Diagnosis | null> {
  if (API_URL) {
    return apiFetch<Diagnosis>(`/api/sessions/${id}`);
  }
  await delay(300);
  return MOCK_SESSIONS.find((s) => s.id === id) ? ASYNCIO_DIAGNOSIS : null;
}

export interface KnowledgeSource {
  id: string;
  name: string;
  kind: "docs" | "github" | "community" | "upload";
  status: "indexed" | "indexing" | "queued" | "error";
  chunks: number;
  updated: string;
  detail: string;
}

export async function listKnowledgeSources(): Promise<KnowledgeSource[]> {
  if (API_URL) {
    return apiFetch<KnowledgeSource[]>("/api/sources");
  }
  await delay(350);
  return MOCK_KNOWLEDGE.map((source, index) => ({
    id: `knowledge-${index + 1}`,
    ...source,
  }));
}

export async function addKnowledgeSource(input: {
  kind: "docs" | "github" | "upload";
  value: string;
  fileName?: string;
  content?: string;
  file?: File;
}): Promise<KnowledgeSource> {
  if (API_URL || typeof window !== "undefined") {
    const form = new FormData();
    form.set("kind", input.kind);
    form.set("value", input.value);
    if (input.content) form.set("content", input.content);
    if (input.file) form.set("file", input.file);

    const response = await fetch(API_URL ? `${API_URL}/api/documents` : "/api/documents", {
      method: "POST",
      body: form,
    });
    if (!response.ok) throw new Error(`Document upload failed (${response.status})`);
    return response.json() as Promise<KnowledgeSource>;
  }
  await delay(900);
  return {
    id: `k-${Date.now()}`,
    name: input.fileName || input.value,
    kind: input.kind,
    status: "indexing",
    chunks: 0,
    updated: new Date().toISOString(),
    detail: input.kind === "github" ? "repository sync queued" : "queued for indexing",
  };
}

export async function listSaved(): Promise<SavedSolution[]> {
  if (API_URL) {
    return apiFetch<SavedSolution[]>("/api/saved");
  }
  await delay(300);
  return MOCK_SAVED;
}

export async function saveSolution(input: {
  problem: string;
  rootCause: string;
  technology: string[];
  fixSummary: string;
  sources: { title: string; type: SourceType }[];
}): Promise<SavedSolution> {
  if (API_URL) {
    return apiFetch<SavedSolution>("/api/saved", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  await delay(250);
  return { id: `sv-${Date.now()}`, ...input, savedAt: new Date().toISOString() };
}

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  docs: "Documentation",
  github: "GitHub Issue",
  community: "Community",
  code: "Code Example",
};
