"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bookmark,
  Bug,
  Database,
  History,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { listSessions } from "@/lib/api";
import type { DebugSession } from "@/lib/types";
import { Tooltip } from "@/components/ui/tabs";

export function MobileNavButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open menu"
      className="rounded-md p-1.5 text-muted transition-colors hover:bg-foreground/5 hover:text-foreground lg:hidden"
    >
      <Menu size={18} />
    </button>
  );
}

const NAV = [
  { href: "/", label: "New Debug Session", icon: Plus },
  { href: "/history", label: "Debug History", icon: History },
  { href: "/saved", label: "Saved Solutions", icon: Bookmark },
  { href: "/sources", label: "Knowledge Sources", icon: Database },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const pathname = usePathname();
  const [sessions, setSessions] = useState<DebugSession[]>([]);
  const [showRelativeTimes, setShowRelativeTimes] = useState(false);

  useEffect(() => {
    const revealTimes = window.requestAnimationFrame(() => {
      setShowRelativeTimes(true);
    });
    return () => window.cancelAnimationFrame(revealTimes);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => { void listSessions(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setSessions(items.slice(0, 4));
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSessions([]);
        }
      }); };
    refresh();
    window.addEventListener("fixflow:sessions-changed", refresh);
    return () => { controller.abort(); window.removeEventListener("fixflow:sessions-changed", refresh); };
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onMobileClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [mobileOpen, onMobileClose]);

  return (
    <>
      <div
        aria-hidden
        onClick={onMobileClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/60 transition-opacity lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-dvh w-60 flex-col border-r border-border bg-surface transition-transform duration-200",
          "lg:relative lg:h-auto lg:translate-x-0",
          collapsed ? "lg:w-14" : "lg:w-60",
          mobileOpen ? "translate-x-0" : "-translate-x-full max-lg:invisible"
        )}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent">
            <Bug size={18} strokeWidth={2.2} />
          </span>
            <span className={cn("flex flex-col leading-tight", collapsed && "lg:hidden")}>
              <span className="font-semibold tracking-tight">FixFlow</span>
              <span className="text-[10px] text-muted">Debugging RAG</span>
            </span>
          <button
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="ml-auto hidden rounded p-1 text-muted transition-colors hover:text-foreground lg:block"
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <button
            onClick={onMobileClose}
            aria-label="Close menu"
            className="ml-auto rounded p-1 text-muted hover:text-foreground lg:hidden"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>

        <nav className="flex flex-col gap-0.5 p-2" aria-label="Main">
          {NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const btn = (
              <Link
                href={item.href}
                onClick={onMobileClose}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                  active
                    ? "bg-accent/10 text-accent"
                    : "text-muted hover:bg-foreground/5 hover:text-foreground",
                  collapsed && "lg:justify-center lg:px-0"
                )}
              >
                <item.icon size={16} className="shrink-0" />
                <span className={collapsed ? "lg:hidden" : undefined}>{item.label}</span>
              </Link>
            );
            return collapsed ? (
              <Tooltip key={item.href} label={item.label} side="right" className="block">
                {btn}
              </Tooltip>
            ) : (
              <div key={item.href}>{btn}</div>
            );
          })}
        </nav>

        {!collapsed && (
          <div className="mt-2 flex min-h-0 flex-1 flex-col border-t border-border">
            <p className="px-4 pb-1.5 pt-3 text-[11px] font-medium uppercase tracking-wider text-muted/70">
              Recent sessions
            </p>
            <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
              {sessions.map((s) => (
                <Link
                  key={s.id}
                  href={`/?session=${encodeURIComponent(s.id)}`}
                  onClick={onMobileClose}
                  className="group flex items-center gap-2 rounded-md px-2.5 py-2 transition-colors hover:bg-foreground/5"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      s.status === "resolved" && "bg-success",
                      s.status === "unresolved" && "bg-danger",
                      s.status === "in-progress" && "bg-warning"
                    )}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] text-foreground/85 group-hover:text-foreground">
                      {s.title}
                    </span>
                    <span className="truncate text-[11px] text-muted/70">
                      {s.technology[0]} · {showRelativeTimes ? timeAgo(s.createdAt) : "recent"}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
