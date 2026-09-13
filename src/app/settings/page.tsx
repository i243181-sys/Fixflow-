"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Database,
  ExternalLink,
  Moon,
  Server,
  Sun,
} from "lucide-react";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/layout/theme-provider";
import { checkBackendHealth, listKnowledgeSources } from "@/lib/api";
import type { KnowledgeSource } from "@/lib/types";
import { SOURCE_STATUS } from "@/lib/sources";

const BACKEND_TONE = {
  checking: "warning",
  online: "success",
  offline: "danger",
} as const;

export default function SettingsPage() {
  const { dark, toggle } = useTheme();
  const [backend, setBackend] = useState<"checking" | "online" | "offline">("checking");
  const [sources, setSources] = useState<KnowledgeSource[]>([]);

  const checkConnection = (signal?: AbortSignal) => {
    setBackend("checking");
    void checkBackendHealth(signal)
      .then(() => setBackend("online"))
      .catch(() => {
        if (!signal?.aborted) setBackend("offline");
      });
  };

  useEffect(() => {
    const controller = new AbortController();
    const initialize = window.setTimeout(() => {
      checkConnection(controller.signal);
      void listKnowledgeSources(controller.signal)
        .then(setSources)
        .catch(() => {
          if (!controller.signal.aborted) setSources([]);
        });
    }, 0);
    return () => {
      controller.abort();
      window.clearTimeout(initialize);
    };
  }, []);

  return (
    <AppShell sessionTitle="Settings">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 xl:px-8">
        <header>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">Workspace</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-2 text-sm text-muted">Manage the FixFlow workspace connection and appearance.</p>
        </header>

        <section className="rounded-xl border border-border bg-panel p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/10 text-accent">
              {dark ? <Moon size={16} /> : <Sun size={16} />}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Appearance</h2>
              <p className="mt-1 text-xs text-muted">Current theme: {dark ? "Dark" : "Light"}</p>
            </div>
            <Button variant="outline" size="sm" onClick={toggle}>
              {dark ? <Sun size={14} /> : <Moon size={14} />}
              Switch to {dark ? "light" : "dark"}
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-panel p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success">
              <Server size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Backend connection</h2>
              <p className="mt-1 text-xs text-muted">FastAPI health endpoint</p>
            </div>
            <Badge tone={BACKEND_TONE[backend]}>
              {backend}
            </Badge>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
            <p className="font-mono text-[11px] text-muted">{process.env.NEXT_PUBLIC_API_URL || "Backend URL not configured"}</p>
            <Button variant="outline" size="sm" onClick={() => checkConnection()} loading={backend === "checking"}>
              Check connection
            </Button>
          </div>
          {backend === "offline" && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-danger">
              <CircleAlert size={13} /> Start FastAPI to enable live diagnosis and history.
            </p>
          )}
          {backend === "online" && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-success">
              <CheckCircle2 size={13} /> FastAPI is reachable.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-border bg-panel p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-lime/10 text-lime">
              <Database size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Knowledge index</h2>
              <p className="mt-1 text-xs text-muted">Sources available to the retrieval service</p>
            </div>
            <Badge tone="lime">{sources.length} sources</Badge>
          </div>
          <div className="mt-4 space-y-2 border-t border-border pt-3">
            {sources.map((source) => (
              <div key={source.id} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-foreground/80">{source.name}</span>
                <span className="font-mono text-muted">{source.chunks} records</span>
                <Badge tone={SOURCE_STATUS[source.status].tone}>{SOURCE_STATUS[source.status].label}</Badge>
              </div>
            ))}
            {!sources.length && <p className="text-xs text-muted">No source status available.</p>}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-panel p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Account</h2>
              <p className="mt-1 text-xs text-muted">Manage your Clerk authentication.</p>
            </div>
            <Show when="signed-in">
              <UserButton />
            </Show>
            <Show when="signed-out">
              <div className="flex gap-2">
                <SignInButton mode="modal"><Button variant="outline" size="sm">Sign in</Button></SignInButton>
                <SignUpButton mode="modal"><Button variant="primary" size="sm">Sign up</Button></SignUpButton>
              </div>
            </Show>
          </div>
          <a href="https://dashboard.clerk.com" target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground">
            Open Clerk dashboard <ExternalLink size={12} />
          </a>
        </section>
      </div>
    </AppShell>
  );
}
