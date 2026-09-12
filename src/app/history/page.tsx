"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { History, ArrowUpRight } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { listSessions } from "@/lib/api";
import type { DebugSession } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

export default function HistoryPage() {
  const [sessions, setSessions] = useState<DebugSession[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSessions().then(setSessions).catch(() => setError("Could not load debug history."));
  }, []);

  return (
    <AppShell sessionTitle="Debug History">
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-8 xl:px-8">
        <header>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">Sessions</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Debug history</h1>
          <p className="mt-2 text-sm text-muted">Reopen a backend session and continue the investigation.</p>
        </header>
        {error && <p className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
        <section className="space-y-2">
          {sessions.map((session) => (
            <Link key={session.id} href={`/?session=${session.id}`} className="flex items-center gap-3 rounded-lg border border-border bg-panel p-4 transition-colors hover:border-accent/50">
              <History size={16} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{session.title}</span>
                <span className="mt-1 block truncate text-xs text-muted">{session.errorMessage}</span>
              </span>
              <Badge tone={session.status === "resolved" ? "success" : "warning"}>{session.status}</Badge>
              <span className="hidden text-xs text-muted sm:block">{timeAgo(session.createdAt)}</span>
              <ArrowUpRight size={15} className="text-muted" />
            </Link>
          ))}
          {!sessions.length && !error && <p className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted">No debug sessions yet.</p>}
        </section>
      </div>
    </AppShell>
  );
}
