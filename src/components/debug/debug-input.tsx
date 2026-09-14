"use client";

import { useEffect, useRef, useState } from "react";
import {
  Paperclip,
  Trash2,
  X,
  Command,
  FileCode2,
  Lightbulb,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, Tooltip } from "@/components/ui/tabs";
import { CodeBlock } from "@/components/ui/code-block";
import { useToast } from "@/components/ui/toast";
import { TECH_OPTIONS, type TechOption } from "@/lib/types";
import type { DebugRequest } from "@/lib/api";
import { cn } from "@/lib/utils";

const EXAMPLE_ERROR = "RuntimeError: no running event loop";
export function DebugInput({
  onDiagnose,
  busy,
  onFilesChange,
  onTechsChange,
  onRepoChange,
}: {
  onDiagnose: (req: DebugRequest) => void;
  busy: boolean;
  onFilesChange: (files: string[]) => void;
  onTechsChange: (techs: TechOption[]) => void;
  onRepoChange: (url: string) => void;
}) {
  const [tab, setTab] = useState("error");
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [context, setContext] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [techs, setTechs] = useState<TechOption[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [techQuery, setTechQuery] = useState("");
  const [showTechs, setShowTechs] = useState(false);
  const { toast } = useToast();
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const filteredTechs = TECH_OPTIONS.filter((t) =>
    t.toLowerCase().includes(techQuery.toLowerCase())
  );

  const toggleTech = (t: TechOption) => {
    const next = techs.includes(t) ? techs.filter((x) => x !== t) : [...techs, t];
    setTechs(next);
    onTechsChange(next);
  };

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const next = [...files, ...Array.from(list)];
    setFiles(next);
    onFilesChange(next.map((f) => f.name));
    toast(`${list.length} file(s) attached`, "success");
  };

  const clearAll = () => {
    setError("");
    setCode("");
    setContext("");
    setRepoUrl("");
    setFiles([]);
    setTechs([]);
    setShowTechs(false);
    onFilesChange([]);
    onTechsChange([]);
    onRepoChange("");
    setTab("error");
    toast("Workspace cleared", "info");
  };

  const submit = () => {
    if (!error.trim() && !code.trim() && !context.trim()) {
      toast("Add an error message, code, or context first", "error");
      areaRef.current?.focus();
      return;
    }
    onDiagnose({
      error: error || undefined,
      code: code || undefined,
      context: context || undefined,
      repoUrl: repoUrl || undefined,
      techs,
    });
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (!busy) submit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  return (
    <section
      aria-label="Debug input"
      className="overflow-visible rounded-xl border border-border bg-panel shadow-lg shadow-black/20"
    >
      <div className="flex items-center pr-2">
        <Tabs
          size="sm"
          value={tab}
          onChange={setTab}
          items={[
            { id: "error", label: "Error", icon: <AlertTriangle size={13} /> },
            { id: "code", label: "Code", icon: <FileCode2 size={13} /> },
            { id: "context", label: "Context", icon: <Lightbulb size={13} /> },
          ]}
        />
        <span className="ml-auto hidden items-center gap-1 font-mono text-[10px] text-muted/60 sm:flex">
          <Command size={10} /> + Enter to diagnose
        </span>
      </div>

      <div className="p-4">
        {tab === "error" && (
          <div className="ff-fade-up">
            <textarea
              ref={areaRef}
              value={error}
              onChange={(e) => setError(e.target.value)}
              placeholder="Paste the full error message or stack trace…"
              aria-label="Error message"
              rows={5}
              spellCheck={false}
              className="w-full resize-y rounded-lg border border-border bg-[#0e1013] p-3.5 font-mono text-[13px] leading-relaxed text-foreground placeholder:text-muted/50 focus:border-accent/60 focus:outline-none"
            />
            {!error && (
              <button
                onClick={() => setError(EXAMPLE_ERROR)}
                className="mt-2 flex items-center gap-1.5 rounded px-1.5 py-1 font-mono text-[11px] text-muted transition-colors hover:text-lime"
              >
                <span className="text-warning">›</span> try example:
                <span className="text-danger">{EXAMPLE_ERROR}</span>
              </button>
            )}
          </div>
        )}

        {tab === "code" && (
          <div className="ff-fade-up space-y-3">
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="// Paste the relevant code that's failing…"
              aria-label="Code"
              rows={7}
              spellCheck={false}
              className="w-full resize-y rounded-lg border border-border bg-[#0e1013] p-3.5 font-mono text-[13px] leading-relaxed text-foreground placeholder:text-muted/50 focus:border-accent/60 focus:outline-none"
            />
            {code.trim() && (
              <CodeBlock code={code} language="python" filename="preview.py" />
            )}
          </div>
        )}

        {tab === "context" && (
          <div className="ff-fade-up space-y-3">
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Describe the problem: what did you expect, what happened, when does it occur…"
              aria-label="Problem context"
              rows={4}
              className="w-full resize-y rounded-lg border border-border bg-[#0e1013] p-3.5 text-sm leading-relaxed text-foreground placeholder:text-muted/50 focus:border-accent/60 focus:outline-none"
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="url"
                value={repoUrl}
                onChange={(e) => {
                  setRepoUrl(e.target.value);
                  onRepoChange(e.target.value);
                }}
                placeholder="https://github.com/you/your-repo"
                aria-label="GitHub repository URL"
                className="h-9 flex-1 rounded-md border border-border bg-[#0e1013] px-3 text-sm text-foreground placeholder:text-muted/50 focus:border-accent/60 focus:outline-none"
              />
              <label className="cursor-pointer">
                <input
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={(e) => addFiles(e.target.files)}
                />
                <span className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-panel-2 px-3.5 text-sm text-foreground transition-colors hover:border-accent hover:text-accent">
                  <Paperclip size={14} /> Attach files
                </span>
              </label>
            </div>
            {files.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <Badge key={`${f.name}-${i}`} tone="muted" className="gap-1.5 py-1 font-mono">
                    {f.name}
                    <button
                      aria-label={`Remove ${f.name}`}
                      onClick={() => {
                        const next = files.filter((_, j) => j !== i);
                        setFiles(next);
                        onFilesChange(next.map((x) => x.name));
                      }}
                      className="text-muted hover:text-danger"
                    >
                      <X size={11} />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-border bg-panel-2/50 px-4 py-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <button
            onClick={() => setShowTechs((s) => !s)}
            aria-expanded={showTechs}
            className="flex w-full items-center gap-2 rounded-md border border-border bg-[#0e1013] px-3 py-2 text-sm text-muted transition-colors hover:border-border-strong sm:w-auto sm:min-w-56"
          >
            <span className={cn("truncate", techs.length && "text-foreground")}>
              {techs.length ? techs.join(", ") : "Select technology…"}
            </span>
            <span className="ml-auto shrink-0 text-[10px]">{showTechs ? "▲" : "▼"}</span>
          </button>
          {showTechs && (
            <div className="ff-fade-up absolute bottom-full left-0 z-30 mb-1.5 w-full min-w-72 rounded-lg border border-border-strong bg-panel p-2 shadow-xl shadow-black/50">
              <input
                value={techQuery}
                onChange={(e) => setTechQuery(e.target.value)}
                placeholder="Search frameworks…"
                aria-label="Search technologies"
                className="mb-2 h-8 w-full rounded border border-border bg-[#0e1013] px-2.5 text-xs focus:border-accent/60 focus:outline-none"
              />
              <div className="flex flex-wrap gap-1.5">
                {filteredTechs.map((t) => {
                  const active = techs.includes(t);
                  return (
                    <button
                      key={t}
                      onClick={() => toggleTech(t)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        active
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-border text-muted hover:border-border-strong hover:text-foreground"
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Tooltip label="Clear all inputs">
            <Button variant="ghost" onClick={clearAll} disabled={busy}>
              <Trash2 size={14} /> Clear
            </Button>
          </Tooltip>
          <Button variant="primary" size="lg" onClick={submit} loading={busy}>
            {busy ? "Diagnosing…" : "Diagnose Error"}
          </Button>
        </div>
      </div>
    </section>
  );
}
