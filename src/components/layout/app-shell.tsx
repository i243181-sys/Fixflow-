"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { TopBar } from "./topbar";

const PAGE_META: Record<string, { title: string; techs: string[] }> = {
  "/": { title: "New Debug Session", techs: [] },
  "/history": { title: "Debug History", techs: [] },
  "/saved": { title: "Saved Solutions", techs: [] },
  "/sources": { title: "Knowledge Sources", techs: ["RAG index"] },
  "/settings": { title: "Settings", techs: [] },
};

export function AppShell({
  children,
  sessionTitle,
  techs = [],
  rightPanel,
  rightPanelOpen = false,
  onToggleRightPanel,
}: {
  children: ReactNode;
  sessionTitle?: string;
  techs?: string[];
  rightPanel?: ReactNode;
  rightPanelOpen?: boolean;
  onToggleRightPanel?: () => void;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const meta = PAGE_META[pathname] ?? PAGE_META["/"];
  const showRightToggle = Boolean(onToggleRightPanel);

  useEffect(() => {
    const close = window.requestAnimationFrame(() => setMobileOpen(false));
    return () => window.cancelAnimationFrame(close);
  }, [pathname]);

  const title = sessionTitle ?? meta.title;
  const panelTechs = techs.length ? techs : meta.techs;

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          sessionTitle={title}
          techs={panelTechs}
          onMobileNav={() => setMobileOpen(true)}
          rightPanelOpen={rightPanelOpen}
          onToggleRightPanel={() => onToggleRightPanel?.()}
          showRightToggle={showRightToggle}
        />
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
          {rightPanel}
        </div>
      </div>
    </div>
  );
}
