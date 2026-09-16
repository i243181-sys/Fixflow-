"use client";

import Link from "next/link";
import { History, ArrowUpRight } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { listSessions } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";

export default function HistoryPage() {
  const { data, loading, error, reload } = useResource(listSessions);
  const sessions = data ?? [];

  return (
    <AppShell sessionTitle="Debug History">
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-8 xl:px-8">
        <header>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">Sessions</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Debug history</h1>
          <p className="mt-2 text-sm text-muted">Reopen a backend session and continue the investigation.</p>
          <Button className="mt-3" size="sm" onClick={reload} loading={loading}>Refresh history</Button>
        </header>
        {error && <p className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
        {loading && <p role="status" className="text-sm text-muted">Loading debug history…</p>}
        <section className="space-y-2">
          {sessions.map((session) => (
            <Link key={session.id} href={`/?session=${encodeURIComponent(session.id)}`} className="flex items-center gap-3 rounded-lg border border-border bg-panel p-4 transition-colors hover:border-accent/50">
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
          {!loading && !sessions.length && !error && <p className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted">No debug sessions yet.</p>}
        </section>
      </div>
    </AppShell>
  );
}
