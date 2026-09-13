// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: (
    _executable: string,
    _arguments: string[],
    _options: object,
    callback: (error: Error | null, result?: { stdout: string; stderr: string }) => void
  ) => callback(null, { stdout: "", stderr: "" }),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue('{"record":1}\n{"record":2}\n'),
}));

import { POST } from "@/app/api/documents/route";

function formRequest(form: FormData, headers?: HeadersInit): Request {
  return new Request("http://localhost/api/documents", {
    method: "POST",
    body: form,
    headers,
  });
}

async function responseBody(response: Response): Promise<{ error?: string; name?: string }> {
  return response.json() as Promise<{ error?: string; name?: string }>;
}

describe("document route validation", () => {
  it("rejects oversized requests before parsing multipart data", async () => {
    const request = new Request("http://localhost/api/documents", {
      method: "POST",
      headers: { "Content-Length": String(52 * 1024 * 1024) },
    });

    const response = await POST(request);

    expect(response.status).toBe(413);
    await expect(responseBody(response)).resolves.toEqual({
      error: "Request exceeds the 50 MB upload limit.",
    });
  });

  it("rejects unsupported source kinds", async () => {
    const form = new FormData();
    form.set("kind", "filesystem");

    const response = await POST(formRequest(form));

    expect(response.status).toBe(422);
  });

  it("accepts only credential-free HTTP source URLs", async () => {
    const invalid = new FormData();
    invalid.set("kind", "github");
    invalid.set("value", "file:///etc/passwd");
    const invalidResponse = await POST(formRequest(invalid));
    expect(invalidResponse.status).toBe(422);

    const valid = new FormData();
    valid.set("kind", "github");
    valid.set("value", "https://github.com/example/project");
    const validResponse = await POST(formRequest(valid));
    expect(validResponse.status).toBe(200);
    await expect(responseBody(validResponse)).resolves.toMatchObject({
      name: "https://github.com/example/project",
    });
  });

  it("rejects empty and unsupported uploaded files", async () => {
    const empty = new FormData();
    empty.set("kind", "upload");
    empty.set("file", new File([], "empty.md", { type: "text/markdown" }));
    const emptyResponse = await POST(formRequest(empty));
    expect(emptyResponse.status).toBe(422);

    const unsupported = new FormData();
    unsupported.set("kind", "upload");
    unsupported.set("file", new File(["payload"], "payload.exe"));
    const unsupportedResponse = await POST(formRequest(unsupported));
    expect(unsupportedResponse.status).toBe(415);
  });

  it("stores valid pasted content and files without exposing process details", async () => {
    const pasted = new FormData();
    pasted.set("kind", "docs");
    pasted.set("value", "Runbook");
    pasted.set("content", "# Safe operations runbook");
    const pastedResponse = await POST(formRequest(pasted));
    expect(pastedResponse.status).toBe(200);
    await expect(responseBody(pastedResponse)).resolves.toMatchObject({
      name: "Runbook",
    });

    const uploaded = new FormData();
    uploaded.set("kind", "upload");
    uploaded.set("value", "file contents should not become the display name");
    uploaded.set("file", new File(["safe"], "notes.md"));
    const uploadedResponse = await POST(formRequest(uploaded));
    expect(uploadedResponse.status).toBe(200);
    await expect(responseBody(uploadedResponse)).resolves.toMatchObject({
      name: "notes.md",
    });

    const longName = new FormData();
    longName.set("kind", "upload");
    longName.set("file", new File(["safe"], `${"a".repeat(300)}.md`));
    const longNameResponse = await POST(formRequest(longName));
    const body = await responseBody(longNameResponse);
    expect(longNameResponse.status).toBe(200);
    expect(body.name).toHaveLength(255);
    expect(body.name?.endsWith(".md")).toBe(true);
  });
});
