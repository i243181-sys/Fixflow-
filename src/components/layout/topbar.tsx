"use client";

import {
  SignInButton,
  SignUpButton,
  Show,
  UserButton,
} from "@clerk/nextjs";
import { Moon, PanelRight, Sun, Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tabs";
import { MobileNavButton } from "./sidebar";
import { useTheme } from "./theme-provider";

export function TopBar({
  sessionTitle,
  techs,
  onMobileNav,
  rightPanelOpen,
  onToggleRightPanel,
  showRightToggle,
}: {
  sessionTitle: string;
  techs: string[];
  onMobileNav: () => void;
  rightPanelOpen: boolean;
  onToggleRightPanel: () => void;
  showRightToggle: boolean;
}) {
  const { dark, toggle } = useTheme();
  const online = true;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface/80 px-3 sm:px-4">
      <MobileNavButton onClick={onMobileNav} />

      <div className="flex min-w-0 items-center gap-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium leading-tight">
            {sessionTitle}
          </p>
          <p className="text-[11px] text-muted leading-tight">
            session · autosaved
          </p>
        </div>
        {techs.length > 0 && (
          <div className="hidden items-center gap-1.5 sm:flex">
            {techs.slice(0, 3).map((t) => (
              <Badge key={t} tone="muted" className="font-mono">
                {t}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <Tooltip label={online ? "Connected to retrieval backend" : "Offline — mock mode"} side="bottom">
          <span className="flex items-center gap-1.5 rounded-md border border-border bg-panel px-2 py-1 text-[11px] text-muted">
            {online ? (
              <Wifi size={13} className="text-success" />
            ) : (
              <WifiOff size={13} className="text-warning" />
            )}
            <span className="hidden sm:inline">
              {online ? "Connected" : "Offline"}
            </span>
            <span
              aria-hidden
              className="ff-pulse-dot h-1.5 w-1.5 rounded-full bg-success"
            />
          </span>
        </Tooltip>

        {showRightToggle && (
          <Tooltip label={rightPanelOpen ? "Hide context panel" : "Show context panel"} side="bottom">
            <button
              onClick={onToggleRightPanel}
              aria-label="Toggle context panel"
              aria-pressed={rightPanelOpen}
              className="rounded-md p-1.5 text-muted transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <PanelRight size={17} className={rightPanelOpen ? "text-accent" : ""} />
            </button>
          </Tooltip>
        )}

        <Show when="signed-out">
          <div className="hidden items-center gap-1.5 sm:flex">
            <SignInButton mode="modal">
              <button
                type="button"
                className="rounded-md px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-white/5 hover:text-foreground"
              >
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button
                type="button"
                className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-[#1a0e08] transition-colors hover:bg-accent-strong"
              >
                Sign up
              </button>
            </SignUpButton>
          </div>
        </Show>
        <Show when="signed-in">
          <UserButton />
        </Show>

        <Tooltip label={dark ? "Switch to light theme" : "Switch to dark theme"} side="bottom">
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-white/5 hover:text-foreground"
          >
            {dark ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </Tooltip>
      </div>
    </header>
  );
}
