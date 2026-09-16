import { afterEach, describe, expect, it, vi } from "vitest";

async function loadApi(apiUrl = "https://api.example.test") {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_API_URL", apiUrl);
  return import("@/lib/api");
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("backend API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("does not force a JSON content type onto GET requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ status: "ok", service: "fixflow-api" })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { checkBackendHealth } = await loadApi();

    await expect(checkBackendHealth()).resolves.toEqual({
      status: "ok",
      service: "fixflow-api",
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
  });

  it("encodes session IDs before adding them to a URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ sessionId: "encoded" }));
    vi.stubGlobal("fetch", fetchMock);
    const { getSession } = await loadApi();

    await getSession("folder/name?admin=true");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/sessions/folder%2Fname%3Fadmin%3Dtrue",
      expect.any(Object)
    );
  });

  it("surfaces structured API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ success: false, error: { message: "Session not found" } }, 404)
      )
    );
    const { getSession } = await loadApi();

    await expect(getSession("missing")).rejects.toThrow("Session not found");
  });

  it("serializes diagnosis, chat, and saved-solution requests", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ id: "response" })));
    vi.stubGlobal("fetch", fetchMock);
    const { diagnose, saveSolution, sendFollowUp } = await loadApi();

    await diagnose({ error: "failure", repoUrl: "https://example.test/repo", techs: ["React"] });
    await sendFollowUp("Why?", "session/1");
    await saveSolution({
      problem: "failure",
      rootCause: "cause",
      technology: ["React"],
      fixSummary: "fix",
      sources: [{ title: "Docs", type: "docs" }],
    });

    const requests = fetchMock.mock.calls.map(([, init]) => init as RequestInit);
    expect(requests).toHaveLength(3);
    expect(JSON.parse(String(requests[0].body))).toMatchObject({
      error: "failure",
      repo_url: "https://example.test/repo",
    });
    expect(JSON.parse(String(requests[1].body))).toEqual({
      question: "Why?",
      session_id: "session/1",
    });
    expect(requests.every((request) => new Headers(request.headers).has("Content-Type"))).toBe(true);
  });

  it("loads collection endpoints", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse([])));
    vi.stubGlobal("fetch", fetchMock);
    const { listKnowledgeSources, listSaved, listSessions } = await loadApi();

    await Promise.all([listKnowledgeSources(), listSaved(), listSessions()]);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.example.test/api/sources",
      "https://api.example.test/api/saved",
      "https://api.example.test/api/sessions",
    ]);
  });

  it("encodes source IDs when checking ingestion status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: "ready_for_embedding" }));
    vi.stubGlobal("fetch", fetchMock);
    const { getSourceStatus } = await loadApi();
    await getSourceStatus("source/path");
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/api/sources/source%2Fpath/status", expect.any(Object));
  });

  it("passes document uploads through multipart form data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "source" }));
    vi.stubGlobal("fetch", fetchMock);
    const { addKnowledgeSource } = await loadApi();

    await addKnowledgeSource({
      kind: "docs",
      value: "Runbook",
      content: "# Runbook",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("content")).toBe("# Runbook");
  });

  it("uses the upload endpoint's safe error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "Unsupported document type." }, 415))
    );
    const { addKnowledgeSource } = await loadApi();

    await expect(
      addKnowledgeSource({ kind: "upload", value: "payload.exe" })
    ).rejects.toThrow("Unsupported document type.");
  });

  it("wraps network failures and preserves their cause", async () => {
    const failure = new TypeError("network unavailable");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(failure));
    const { listSaved } = await loadApi();

    const request = listSaved();
    await expect(request).rejects.toThrow("Could not connect to the FixFlow backend.");
    await expect(request).rejects.toHaveProperty("cause", failure);
  });

  it("requires a real backend instead of returning mock records", async () => {
    const { listSessions } = await loadApi("");
    const controller = new AbortController();
    controller.abort();

    await expect(listSessions(controller.signal)).rejects.toThrow("NEXT_PUBLIC_API_URL is not configured");
  });

  it("reports degraded readiness without hiding database details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ status: "degraded", schema: "migration_required" }, 503)));
    const { checkBackendHealth } = await loadApi();
    await expect(checkBackendHealth()).resolves.toMatchObject({ status: "degraded", schema: "migration_required" });
  });

  it("rejects malformed successful responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json")));
    const { listSaved } = await loadApi();
    await expect(listSaved()).rejects.toThrow("invalid response");
  });

  it("loads persisted messages with an encoded session ID", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    const { listMessages } = await loadApi();
    await listMessages("folder/name");
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/api/sessions/folder%2Fname/messages", expect.any(Object));
  });
});
