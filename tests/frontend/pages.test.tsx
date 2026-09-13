import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HistoryPage from "@/app/history/page";
import DebugSessionPage from "@/app/page";
import SavedPage from "@/app/saved/page";
import SettingsPage from "@/app/settings/page";
import SourcesPage from "@/app/sources/page";
import { ASYNCIO_DIAGNOSIS } from "@/lib/mock-data";

const api = vi.hoisted(() => ({
  addKnowledgeSource: vi.fn(),
  checkBackendHealth: vi.fn(),
  diagnose: vi.fn(),
  getSession: vi.fn(),
  listKnowledgeSources: vi.fn(),
  listSaved: vi.fn(),
  listSessions: vi.fn(),
  saveSolution: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => api);
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/components/layout/theme-provider", () => ({
  useTheme: () => ({ dark: true, toggle: vi.fn() }),
}));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/layout/right-panel", () => ({ RightPanel: () => null }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@clerk/nextjs", () => ({
  Show: ({ children }: { children: ReactNode }) => <>{children}</>,
  SignInButton: ({ children }: { children: ReactNode }) => <>{children}</>,
  SignUpButton: ({ children }: { children: ReactNode }) => <>{children}</>,
  UserButton: () => <button>User</button>,
}));
vi.mock("@/components/debug/debug-input", () => ({
  DebugInput: ({ onDiagnose }: { onDiagnose: (request: { error: string; techs: string[] }) => void }) => (
    <button onClick={() => onDiagnose({ error: "event loop", techs: ["Python"] })}>
      Run diagnosis
    </button>
  ),
}));
vi.mock("@/components/debug/pipeline", () => ({ PipelineProgress: () => <p>Analyzing</p> }));
vi.mock("@/components/debug/diagnosis-result", () => ({
  DiagnosisResult: ({
    diagnosis,
    onSaved,
  }: {
    diagnosis: { rootCause: string };
    onSaved: () => void;
  }) => (
    <div>
      <p>{diagnosis.rootCause}</p>
      <button onClick={onSaved}>Save diagnosis</button>
    </div>
  ),
}));

beforeEach(() => {
  api.addKnowledgeSource.mockReset();
  api.checkBackendHealth.mockReset();
  api.diagnose.mockReset();
  api.getSession.mockReset();
  api.listKnowledgeSources.mockReset();
  api.listSaved.mockReset();
  api.listSessions.mockReset();
  api.saveSolution.mockReset();
  toast.mockReset();
});

afterEach(cleanup);

describe("application pages", () => {
  it("loads history and links to a session", async () => {
    api.listSessions.mockResolvedValue([
      {
        id: "session/1",
        title: "Async failure",
        technology: ["Python"],
        createdAt: new Date().toISOString(),
        status: "resolved",
        confidence: 90,
        errorMessage: "No event loop",
      },
    ]);

    render(<HistoryPage />);

    const link = await screen.findByRole("link", { name: /Async failure/ });
    expect(link.getAttribute("href")).toBe("/?session=session/1");
  });

  it("shows saved solutions returned by the service", async () => {
    api.listSaved.mockResolvedValue([
      {
        id: "saved-1",
        problem: "Port collision",
        rootCause: "Port already used",
        technology: ["Docker"],
        fixSummary: "Use a different host port.",
        sources: [],
        savedAt: new Date().toISOString(),
      },
    ]);

    render(<SavedPage />);

    expect(await screen.findByText("Port collision")).toBeDefined();
    expect(screen.getByText("Use a different host port.")).toBeDefined();
  });

  it("submits pasted documentation and prepends the new source", async () => {
    api.listKnowledgeSources.mockResolvedValue([]);
    api.addKnowledgeSource.mockResolvedValue({
      id: "source-1",
      name: "Runbook",
      kind: "docs",
      status: "indexing",
      chunks: 0,
      updated: new Date().toISOString(),
      detail: "queued",
    });

    render(<SourcesPage />);
    fireEvent.change(screen.getByLabelText("Document title"), { target: { value: "Runbook" } });
    fireEvent.change(screen.getByLabelText("Documentation content"), {
      target: { value: "# Recovery\nRestart the worker." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add to knowledge base/ }));

    await waitFor(() =>
      expect(api.addKnowledgeSource).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "docs",
          value: "Runbook",
          content: "# Recovery\nRestart the worker.",
        })
      )
    );
    expect(await screen.findByText("Runbook")).toBeDefined();
  });

  it("checks backend health and renders source status in settings", async () => {
    api.checkBackendHealth.mockResolvedValue({ status: "ok", service: "fixflow-api" });
    api.listKnowledgeSources.mockResolvedValue([
      {
        id: "source-1",
        name: "Runbook",
        kind: "docs",
        status: "indexed",
        chunks: 12,
        updated: new Date().toISOString(),
        detail: "ready",
      },
    ]);

    render(<SettingsPage />);

    expect(await screen.findByText("online")).toBeDefined();
    expect(screen.getByText("12 records")).toBeDefined();
  });

  it("runs and saves a diagnosis from the main page", async () => {
    api.diagnose.mockResolvedValue(ASYNCIO_DIAGNOSIS);
    api.saveSolution.mockResolvedValue({ id: "saved-1" });

    render(<DebugSessionPage />);
    fireEvent.click(screen.getByRole("button", { name: "Run diagnosis" }));

    expect(await screen.findByText(ASYNCIO_DIAGNOSIS.rootCause)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Save diagnosis" }));
    await waitFor(() => expect(api.saveSolution).toHaveBeenCalledOnce());
  });
});
