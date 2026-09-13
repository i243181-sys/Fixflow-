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
  KnowledgeSource,
  SavedSolution,
  SourceType,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const complete = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const abort = () => {
      clearTimeout(timeout);
      reject(signal?.reason);
    };
    const timeout = setTimeout(complete, milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function checkBackendHealth(
  signal?: AbortSignal
): Promise<{ status: string; service: string }> {
  return apiFetch<{ status: string; service: string }>("/health", { signal });
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured");
  }
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new Error("Could not connect to the FixFlow backend.", { cause: error });
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(apiErrorMessage(body, response.status));
  }
  return body as T;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function apiErrorMessage(body: unknown, status: number): string {
  if (isRecord(body)) {
    if (typeof body.detail === "string") return body.detail;
    if (isRecord(body.error) && typeof body.error.message === "string") {
      return body.error.message;
    }
    if (typeof body.error === "string") return body.error;
  }
  return `API request failed (${status})`;
}

export interface DebugRequest {
  error?: string;
  code?: string;
  context?: string;
  repoUrl?: string;
  techs: string[];
  files?: File[];
}

export async function diagnose(req: DebugRequest, signal?: AbortSignal): Promise<Diagnosis> {
  if (API_URL) {
    return apiFetch<Diagnosis>("/api/debug", {
      method: "POST",
      signal,
      body: JSON.stringify({
        error: req.error,
        code: req.code,
        context: req.context,
        repo_url: req.repoUrl,
        techs: req.techs,
      }),
    });
  }
  await delay(2800, signal);
  if (!req.error && !req.code && !req.context) {
    throw new Error("No error, code or context provided.");
  }
  return ASYNCIO_DIAGNOSIS;
}

export async function sendFollowUp(
  question: string,
  sessionId: string,
  signal?: AbortSignal
): Promise<ChatMessage> {
  if (API_URL) {
    return apiFetch<ChatMessage>("/api/chat", {
      method: "POST",
      signal,
      body: JSON.stringify({ question, session_id: sessionId }),
    });
  }
  await delay(1400, signal);
  const reply = MOCK_CHAT_REPLIES.default;
  return {
    id: `c-${Date.now()}`,
    role: "fixflow",
    text: reply.text,
    sources: reply.sources,
  };
}

export async function listSessions(signal?: AbortSignal): Promise<DebugSession[]> {
  if (API_URL) {
    return apiFetch<DebugSession[]>("/api/sessions", { signal });
  }
  await delay(400, signal);
  return MOCK_SESSIONS;
}

export async function getSession(id: string, signal?: AbortSignal): Promise<Diagnosis | null> {
  if (API_URL) {
    return apiFetch<Diagnosis>(`/api/sessions/${encodeURIComponent(id)}`, { signal });
  }
  await delay(300, signal);
  return MOCK_SESSIONS.find((s) => s.id === id) ? ASYNCIO_DIAGNOSIS : null;
}

export async function listKnowledgeSources(signal?: AbortSignal): Promise<KnowledgeSource[]> {
  if (API_URL) {
    return apiFetch<KnowledgeSource[]>("/api/sources", { signal });
  }
  await delay(350, signal);
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
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      throw new Error(apiErrorMessage(body, response.status));
    }
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

export async function listSaved(signal?: AbortSignal): Promise<SavedSolution[]> {
  if (API_URL) {
    return apiFetch<SavedSolution[]>("/api/saved", { signal });
  }
  await delay(300, signal);
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
