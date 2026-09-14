import type {
  ChatMessage, DebugSession, Diagnosis, KnowledgeSource, SavedSolution, SourceType,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export interface BackendHealth {
  status: string;
  service: string;
  api: string;
  database: string;
  pgvector: string;
}

export function checkBackendHealth(signal?: AbortSignal): Promise<BackendHealth> {
  return apiFetch("/health", { signal });
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) throw new Error("NEXT_PUBLIC_API_URL is not configured");
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL.replace(/\/$/, "")}${path}`, { ...init, headers });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("Could not connect to the FixFlow backend.", { cause: error });
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiErrorMessage(body, response.status));
  return body as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function apiErrorMessage(body: unknown, status: number): string {
  if (isRecord(body)) {
    if (typeof body.detail === "string") return body.detail;
    if (isRecord(body.error) && typeof body.error.message === "string") return body.error.message;
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
}

export function diagnose(req: DebugRequest, signal?: AbortSignal): Promise<Diagnosis> {
  return apiFetch("/api/debug", {
    method: "POST", signal,
    body: JSON.stringify({
      error: req.error, code: req.code, context: req.context,
      repo_url: req.repoUrl, techs: req.techs,
    }),
  });
}

export function sendFollowUp(question: string, sessionId: string, signal?: AbortSignal): Promise<ChatMessage> {
  return apiFetch("/api/chat", { method: "POST", signal, body: JSON.stringify({ question, session_id: sessionId }) });
}

export function listSessions(signal?: AbortSignal): Promise<DebugSession[]> {
  return apiFetch("/api/sessions", { signal });
}

export function getSession(id: string, signal?: AbortSignal): Promise<Diagnosis> {
  return apiFetch(`/api/sessions/${encodeURIComponent(id)}`, { signal });
}

export function listKnowledgeSources(signal?: AbortSignal): Promise<KnowledgeSource[]> {
  return apiFetch("/api/sources", { signal });
}

export function getSourceStatus(id: string, signal?: AbortSignal): Promise<KnowledgeSource> {
  return apiFetch(`/api/sources/${encodeURIComponent(id)}/status`, { signal });
}

export function addKnowledgeSource(input: {
  kind: "docs" | "github" | "upload";
  value: string;
  content?: string;
  file?: File;
}): Promise<KnowledgeSource> {
  const form = new FormData();
  form.set("kind", input.kind);
  form.set("value", input.value);
  if (input.content) form.set("content", input.content);
  if (input.file) form.set("file", input.file);
  return apiFetch("/api/documents", { method: "POST", body: form });
}

export function listSaved(signal?: AbortSignal): Promise<SavedSolution[]> {
  return apiFetch("/api/saved", { signal });
}

export function saveSolution(input: {
  problem: string;
  rootCause: string;
  technology: string[];
  fixSummary: string;
  sources: { title: string; type: SourceType }[];
}): Promise<SavedSolution> {
  return apiFetch("/api/saved", { method: "POST", body: JSON.stringify(input) });
}

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  docs: "Documentation", github: "GitHub Issue", community: "Community", code: "Code Example",
};
