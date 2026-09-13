"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, FileText, GitBranch, Link2, Upload, Database } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  addKnowledgeSource,
  listKnowledgeSources,
} from "@/lib/api";
import type { KnowledgeSource } from "@/lib/types";
import { isSourcePending, SOURCE_STATUS } from "@/lib/sources";
import { cn } from "@/lib/utils";

type SourceMode = "docs" | "github" | "upload";

const SOURCE_MODES: {
  id: SourceMode;
  label: string;
  description: string;
  icon: typeof BookOpen;
}[] = [
  {
    id: "docs",
    label: "Paste documentation",
    description: "Add a guide, runbook, or internal reference.",
    icon: BookOpen,
  },
  {
    id: "github",
    label: "Documentation URL",
    description: "Index public docs or a GitHub repository URL.",
    icon: Link2,
  },
  {
    id: "upload",
    label: "Upload a file",
    description: "Add Markdown, text, or PDF documentation.",
    icon: Upload,
  },
];

function sourceName(mode: SourceMode, title: string, value: string): string {
  if (mode === "github") return value.trim();
  if (title) return title;
  return mode === "docs" ? "Pasted documentation" : "Pasted document";
}

export default function SourcesPage() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [mode, setMode] = useState<SourceMode>("docs");
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const controller = new AbortController();
    void listKnowledgeSources(controller.signal)
      .then(setSources)
      .catch(() => {
        if (!controller.signal.aborted) {
          toast("Could not load knowledge sources.", "error");
        }
      });
    return () => controller.abort();
  }, [toast]);

  const hasPendingSources = sources.some(isSourcePending);
  useEffect(() => {
    if (!hasPendingSources) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const current = await listKnowledgeSources(controller.signal);
        if (controller.signal.aborted) return;
        setSources(current);
        if (current.some(isSourcePending)) timer = setTimeout(refresh, 2000);
      } catch {
        if (!controller.signal.aborted) toast("Could not refresh source status. Reload to retry.", "error");
      }
    };
    timer = setTimeout(refresh, 2000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [hasPendingSources, toast]);

  const resetForm = () => {
    setTitle("");
    setValue("");
    setSelectedFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const selectMode = (nextMode: SourceMode) => {
    setMode(nextMode);
    resetForm();
  };

  const submitSource = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!value.trim()) return;

    setBusy(true);
    try {
      const source = await addKnowledgeSource({
        kind: mode,
        value: sourceName(mode, title, value),
        content: mode === "docs" || (mode === "upload" && !selectedFile) ? value : undefined,
        file: mode === "upload" ? selectedFile ?? undefined : undefined,
      });
      setSources((current) => [source, ...current.filter((item) => item.id !== source.id)]);
      resetForm();
      toast(source.error_message || "Source saved to the knowledge base.", source.status === "failed" ? "error" : "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not add this source. Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast("Document exceeds the 50 MB limit", "error");
      return;
    }
    setTitle(file.name);
    setSelectedFile(file);
    if (file.type === "text/plain" || file.name.endsWith(".md")) {
      setValue(await file.text());
    } else {
      setValue(file.name);
    }
  };

  return (
    <AppShell sessionTitle="Knowledge Sources" techs={["RAG index"]}>
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-8 xl:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
              Initial knowledge base
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Give FixFlow its context.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              Add documentation here once. These sources will be ready for the embedding pipeline,
              and you can extend the collection whenever your project grows.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border bg-panel px-3 py-2 text-xs text-muted">
            <Database size={14} className="text-lime" />
            {sources.length} sources available
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
          <section className="rounded-xl border border-border bg-panel p-4 sm:p-5">
            <div className="mb-4">
              <h2 className="text-sm font-semibold">Add documentation</h2>
              <p className="mt-1 text-xs text-muted">This source will be queued for retrieval in future diagnoses.</p>
            </div>

            <div className="grid gap-1.5 sm:grid-cols-3" role="tablist" aria-label="Source type">
              {SOURCE_MODES.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={mode === item.id}
                    onClick={() => selectMode(item.id)}
                    className={cn(
                      "flex items-start gap-2 rounded-md border px-3 py-2.5 text-left transition-colors",
                      mode === item.id
                        ? "border-accent/50 bg-accent/10 text-foreground"
                        : "border-border text-muted hover:border-border-strong hover:text-foreground"
                    )}
                  >
                    <Icon size={15} className={mode === item.id ? "mt-0.5 text-accent" : "mt-0.5"} />
                    <span>
                      <span className="block text-xs font-medium">{item.label}</span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-muted">{item.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <form onSubmit={submitSource} className="mt-5 space-y-3">
              {mode !== "github" && (
                <label className="block text-xs font-medium text-foreground/80">
                  {mode === "docs" ? "Document title" : "File"}
                  {mode === "docs" ? (
                    <input
                      value={title}
                      maxLength={255}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="e.g. Internal debugging runbook"
                      className="mt-1.5 h-10 w-full rounded-md border border-border bg-[#0e1013] px-3 text-sm text-foreground placeholder:text-muted/50 focus:border-accent/60 focus:outline-none"
                    />
                  ) : (
                    <div className="mt-1.5 flex gap-2">
                      <input
                        readOnly
                        value={title}
                        placeholder="Choose a .md, .txt, or .pdf file"
                        className="h-10 min-w-0 flex-1 rounded-md border border-border bg-[#0e1013] px-3 text-sm text-muted placeholder:text-muted/50"
                      />
                      <Button type="button" size="md" variant="outline" onClick={() => fileRef.current?.click()}>
                        <FileText size={14} />
                        Browse
                      </Button>
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".md,.txt,.pdf,text/markdown,text/plain,application/pdf"
                        onChange={(event) => void handleFile(event.target.files?.[0])}
                        className="hidden"
                      />
                    </div>
                  )}
                </label>
              )}

              {mode === "github" ? (
                <label className="block text-xs font-medium text-foreground/80">
                  Documentation or repository URL
                  <input
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    placeholder="https://docs.example.com or https://github.com/org/repo"
                    type="url"
                    maxLength={2048}
                    className="mt-1.5 h-10 w-full rounded-md border border-border bg-[#0e1013] px-3 text-sm text-foreground placeholder:text-muted/50 focus:border-accent/60 focus:outline-none"
                    required
                  />
                </label>
              ) : (
                <label className="block text-xs font-medium text-foreground/80">
                  {mode === "docs" ? "Documentation content" : "Selected file content"}
                  <textarea
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    placeholder={mode === "docs" ? "Paste the documentation, runbook, or troubleshooting guide here…" : "Choose a file above or paste its text here…"}
                    rows={10}
                    className="mt-1.5 w-full resize-y rounded-md border border-border bg-[#0e1013] px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground placeholder:font-sans placeholder:text-muted/50 focus:border-accent/60 focus:outline-none"
                    required
                  />
                </label>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                <p className="text-[11px] text-muted">Supported: Markdown, TXT, PDF, public URLs</p>
                <Button type="submit" variant="primary" loading={busy} disabled={!value.trim()}>
                  <Upload size={14} />
                  Add to knowledge base
                </Button>
              </div>
            </form>
          </section>

          <section className="rounded-xl border border-border bg-panel p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <BookOpen size={15} className="text-lime" />
              <h2 className="text-sm font-semibold">Knowledge sources</h2>
            </div>
            <div className="space-y-1.5">
              {sources.map((source) => (
                <div key={source.id} className="rounded-md border border-border bg-[#0e1013] px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    {source.kind === "github" ? <GitBranch size={14} className="mt-0.5 text-accent" /> : <FileText size={14} className="mt-0.5 text-muted" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{source.name}</p>
                      <p className="mt-0.5 text-[10px] text-muted">
                        {source.kind} · {source.document_count} documents · {source.chunk_count} chunks
                      </p>
                      {source.error_message && <p className="mt-1 text-[10px] text-red-400">{source.error_message}</p>}
                    </div>
                    <Badge tone={SOURCE_STATUS[source.status].tone}>{SOURCE_STATUS[source.status].label}</Badge>
                  </div>
                </div>
              ))}
              {sources.length === 0 && <p className="py-8 text-center text-xs text-muted">No sources added yet.</p>}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
