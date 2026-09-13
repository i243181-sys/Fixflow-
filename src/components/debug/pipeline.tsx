"use client";

import { BookOpen, Check, GitBranch, ListChecks, Search, Braces, MessagesSquare, BrainCircuit, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PIPELINE_STEPS = [
  { id: "understand", label: "Understanding error", icon: Braces },
  { id: "docs", label: "Searching documentation", icon: BookOpen },
  { id: "github", label: "Searching GitHub issues", icon: GitBranch },
  { id: "community", label: "Searching community solutions", icon: MessagesSquare },
  { id: "examples", label: "Retrieving code examples", icon: ListChecks },
  { id: "rerank", label: "Reranking evidence", icon: Search },
  { id: "generate", label: "Generating diagnosis", icon: BrainCircuit },
] as const;

export function PipelineProgress({ currentStep }: { currentStep: number }) {
  return (
    <section
      aria-label="Diagnosis pipeline"
      aria-busy="true"
      className="rounded-xl border border-border bg-panel p-4 sm:p-5"
    >
      <div className="mb-4 flex items-center gap-2">
        <Loader2 size={15} className="ff-spin text-accent" />
        <p className="text-sm font-medium">Running RAG pipeline…</p>
        <span className="ml-auto font-mono text-[11px] text-muted">
          {Math.min(currentStep + 1, PIPELINE_STEPS.length)}/{PIPELINE_STEPS.length}
        </span>
      </div>

      <div className="mb-4 h-1 overflow-hidden rounded-full bg-panel-2">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
          style={{
            width: `${Math.min(((currentStep + 1) / PIPELINE_STEPS.length) * 100, 100)}%`,
          }}
        />
      </div>

      <ol className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {PIPELINE_STEPS.map((step, i) => {
          const done = i < currentStep;
          const active = i === currentStep;
          return (
            <li
              key={step.id}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                active && "bg-accent/8 text-foreground",
                done && "text-muted",
                !done && !active && "text-muted/45"
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] transition-colors",
                  done && "border-success/50 bg-success/10 text-success",
                  active && "border-accent bg-accent/15 text-accent",
                  !done && !active && "border-border text-muted/50"
                )}
              >
                {done ? (
                  <Check size={12} />
                ) : (
                  <step.icon size={12} className={active ? "ff-pulse-dot" : ""} />
                )}
              </span>
              {step.label}
              {done && (
                <span className="ml-auto font-mono text-[10px] text-success/70">ok</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
