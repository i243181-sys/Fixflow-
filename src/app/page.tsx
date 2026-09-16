"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { RightPanel } from "@/components/layout/right-panel";
import { DebugInput } from "@/components/debug/debug-input";
import { PipelineProgress } from "@/components/debug/pipeline";
import { DiagnosisResult } from "@/components/debug/diagnosis-result";
import { useToast } from "@/components/ui/toast";
import { diagnose, getSession, saveSolution as saveSolutionApi, type DebugRequest } from "@/lib/api";
import type { Diagnosis } from "@/lib/types";

function DebugSessionContent({ sessionId }: { sessionId: string | null }) {
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingSession, setLoadingSession] = useState(Boolean(sessionId));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [techs, setTechs] = useState<string[]>([]);
  const [repoUrl, setRepoUrl] = useState("");
  const [rightOpen, setRightOpen] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const diagnosisRequest = useRef<AbortController | null>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    const sid = sessionId;
    if (sid) {
      const controller = new AbortController();
      void getSession(sid, controller.signal)
        .then((session) => {
          if (controller.signal.aborted) return;
          setDiagnosis(session);
          setTechs(session.detected);
          setFiles(session.request?.files?.map((file) => file.name) ?? []);
          setRepoUrl(session.request?.repo_url ?? "");
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setError("Could not reopen that debug session.");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingSession(false);
        });
      return () => controller.abort();
    }
  }, [sessionId]);

  useEffect(
    () => () => {
      diagnosisRequest.current?.abort();
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    },
    []
  );

  const runPipeline = useCallback(async (req: DebugRequest) => {
    diagnosisRequest.current?.abort();
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    const controller = new AbortController();
    diagnosisRequest.current = controller;
    setBusy(true);
    setError(null);
    setDiagnosis(null);
    setSaved(false);
    try {
      const result = await diagnose(req, controller.signal);
      if (controller.signal.aborted) return;
      setDiagnosis(result);
      setRightOpen(true);
      window.dispatchEvent(new Event("fixflow:sessions-changed"));
      router.replace(`/?session=${encodeURIComponent(result.sessionId)}`);
      scrollTimer.current = setTimeout(
        () => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        100
      );
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof Error ? failure.message : "Diagnosis failed. Please try again.");
      }
    } finally {
      if (diagnosisRequest.current === controller) {
        diagnosisRequest.current = null;
        setBusy(false);
      }
    }
  }, [router]);

  const saveSolution = async () => {
    if (!diagnosis || saving || saved) return;
    setSaving(true);
    try {
      await saveSolutionApi({
        problem: (diagnosis.request?.error || diagnosis.request?.context || diagnosis.rootCause).slice(0, 20_000),
        rootCause: diagnosis.rootCause,
        technology: diagnosis.detected,
        fixSummary: diagnosis.recommendedFix[0]?.detail ?? "Review the recommended fix.",
        sources: diagnosis.sources.map((source) => ({ title: source.title, type: source.type })),
      });
      toast("Solution saved to Saved Solutions", "success");
      setSaved(true);
    } catch {
      toast("Could not save this solution.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell
      sessionTitle={diagnosis ? `${diagnosis.detected.slice(0, 2).join(" · ")} diagnosis` : "New Debug Session"}
      techs={techs.length ? techs : (diagnosis?.detected ?? [])}
      rightPanel={
        <RightPanel
          diagnosis={diagnosis}
          open={rightOpen}
          onClose={() => setRightOpen(false)}
          files={files}
          repoUrl={repoUrl}
          techs={techs.length ? techs : (diagnosis?.detected ?? [])}
        />
      }
      rightPanelOpen={rightOpen}
      onToggleRightPanel={() => setRightOpen((o) => !o)}
    >
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 max-xl:max-w-4xl xl:px-8">
        <div className="ff-grid-bg rounded-xl border border-border px-5 py-7 text-center sm:px-8">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Debug smarter. <span className="text-accent">Fix faster.</span>
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted">
            Search your documentation, keep debugging context together, and review relevant evidence.
          </p>
        </div>

        {loadingSession && <p role="status" className="text-sm text-muted">Loading session…</p>}
        {!loadingSession && <DebugInput
          onDiagnose={runPipeline}
          busy={busy}
          onFilesChange={setFiles}
          onTechsChange={setTechs}
          onRepoChange={setRepoUrl}
          initialValues={diagnosis?.request ? {
            ...diagnosis.request,
            error: diagnosis.request.error ?? undefined,
            code: diagnosis.request.code ?? undefined,
            context: diagnosis.request.context ?? undefined,
            repoUrl: diagnosis.request.repo_url ?? undefined,
          } : undefined}
          onClear={() => { setDiagnosis(null); setError(null); setSaved(false); router.replace("/"); }}
        />}

        <div ref={resultRef}>
          {busy && <PipelineProgress />}
          {error && !busy && (
            <div
              className="ff-fade-up rounded-xl border border-danger/40 bg-danger/10 px-4 py-3.5 text-sm text-danger"
              role="alert"
            >
              {error}
              <button
                onClick={() => setError(null)}
                className="ml-3 underline underline-offset-2 hover:no-underline"
              >
                Dismiss
              </button>
            </div>
          )}
          {!busy && !loadingSession && !error && !diagnosis && (
            <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
              <p className="text-sm text-muted">
                Paste an error, code, or context above — then run{" "}
                <span className="text-foreground">Diagnose Error</span>.
              </p>
              <p className="mt-1 font-mono text-[11px] text-muted/60">
                searches your uploaded knowledge base
              </p>
            </div>
          )}
          {diagnosis && !busy && (
            <DiagnosisResult
              key={diagnosis.sessionId}
              diagnosis={diagnosis}
              onSaved={saveSolution}
              saving={saving}
              saved={saved}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}

function SessionRoute() {
  const sessionId = useSearchParams().get("session");
  return <DebugSessionContent key={sessionId ?? "new"} sessionId={sessionId} />;
}

export default function DebugSessionPage() {
  return (
    <Suspense fallback={null}>
      <SessionRoute />
    </Suspense>
  );
}
