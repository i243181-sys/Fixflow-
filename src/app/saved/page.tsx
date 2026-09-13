"use client";

import { useEffect, useState } from "react";
import { Bookmark, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { listSaved } from "@/lib/api";
import type { SavedSolution } from "@/lib/types";

export default function SavedPage() {
  const [solutions, setSolutions] = useState<SavedSolution[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void listSaved(controller.signal)
      .then(setSolutions)
      .catch(() => {
        if (!controller.signal.aborted) setError("Could not load saved solutions.");
      });
    return () => controller.abort();
  }, []);

  return (
    <AppShell sessionTitle="Saved Solutions">
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-8 xl:px-8">
        <header>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">Library</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Saved solutions</h1>
          <p className="mt-2 text-sm text-muted">Keep useful fixes close for the next incident.</p>
        </header>
        {error && <p className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
        <section className="grid gap-3 md:grid-cols-2">
          {solutions.map((solution) => (
            <article key={solution.id} className="rounded-lg border border-border bg-panel p-4">
              <div className="flex items-start gap-2">
                <Bookmark size={16} className="mt-0.5 shrink-0 text-lime" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-medium">{solution.problem}</h2>
                  <p className="mt-2 text-xs leading-relaxed text-muted">{solution.fixSummary}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {solution.technology.map((technology) => <Badge key={technology} tone="muted">{technology}</Badge>)}
                  </div>
                </div>
                <ExternalLink size={14} className="text-muted" />
              </div>
            </article>
          ))}
          {!solutions.length && !error && <p className="col-span-full rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted">No saved solutions yet.</p>}
        </section>
      </div>
    </AppShell>
  );
}
