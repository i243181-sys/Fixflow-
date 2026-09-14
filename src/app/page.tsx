"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { RightPanel } from "@/components/layout/right-panel";
import { DebugInput } from "@/components/debug/debug-input";
import { PipelineProgress } from "@/components/debug/pipeline";
import { DiagnosisResult } from "@/components/debug/diagnosis-result";
import { useToast } from "@/components/ui/toast";
import { diagnose, getSession, saveSolution as saveSolutionApi, type DebugRequest } from "@/lib/api";
import type { Diagnosis } from "@/lib/types";

function DebugSessionContent() {
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [techs, setTechs] = useState<string[]>([]);
  const [repoUrl, setRepoUrl] = useState("");
  const [rightOpen, setRightOpen] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const diagnosisRequest = useRef<AbortController | null>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();
  const params = useSearchParams();

  useEffect(() => {
    const sid = params.get("session");
    if (sid) {
      const controller = new AbortController();
      void getSession(sid, controller.signal)
        .then((session) => {
          setDiagnosis(session);
          setTechs(session.detected);
          toast(`Reopened session "${sid}"`, "info");
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setError("Could not reopen that debug session.");
          }
        });
      return () => controller.abort();
    }
  }, [params, toast]);

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
    setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, 6)), 380);
    try {
      const result = await diagnose(req, controller.signal);
      if (controller.signal.aborted) return;
      setDiagnosis(result);
      setRightOpen(true);
      scrollTimer.current = setTimeout(
        () => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        100
      );
    } catch {
      if (!controller.signal.aborted) {
        setError("Diagnosis failed. Check your inputs and try again.");
      }
    } finally {
      clearInterval(timer);
      if (diagnosisRequest.current === controller) {
        diagnosisRequest.current = null;
        setBusy(false);
      }
    }
  }, []);

  const saveSolution = async () => {
    if (!diagnosis) return;
    try {
      await saveSolutionApi({
        problem: diagnosis.rootCause,
        rootCause: diagnosis.rootCause,
        technology: diagnosis.detected,
        fixSummary: diagnosis.recommendedFix[0]?.detail ?? "Review the recommended fix.",
        sources: diagnosis.sources.map((source) => ({ title: source.title, type: source.type })),
      });
      toast("Solution saved to Saved Solutions", "success");
    } catch {
      toast("Could not save this solution.", "error");
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
            Grounded debugging using documentation, GitHub issues, community
            solutions and code examples.
          </p>
        </div>

        <DebugInput
          onDiagnose={runPipeline}
          busy={busy}
          onFilesChange={setFiles}
          onTechsChange={setTechs}
          onRepoChange={setRepoUrl}
        />

        <div ref={resultRef}>
          {busy && <PipelineProgress currentStep={step} />}
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
          {!busy && !error && !diagnosis && (
            <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
              <p className="text-sm text-muted">
                Paste an error, code, or context above — then run{" "}
                <span className="text-foreground">Diagnose Error</span>.
              </p>
              <p className="mt-1 font-mono text-[11px] text-muted/60">
                searches docs · github · community · code examples
              </p>
            </div>
          )}
          {diagnosis && !busy && (
            <DiagnosisResult
              diagnosis={diagnosis}
              onSaved={saveSolution}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function DebugSessionPage() {
  return (
    <Suspense fallback={null}>
      <DebugSessionContent />
    </Suspense>
  );
}
