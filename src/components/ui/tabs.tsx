"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Lightweight tooltip using CSS-only reveal on hover/focus. */
export function Tooltip({
  label,
  children,
  side = "top",
  className,
}: {
  label: string;
  children: React.ReactNode;
  side?: "top" | "bottom" | "right";
  className?: string;
}) {
  const positions = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
    right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
  };
  return (
    <span className={cn("relative inline-flex group/tt", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 hidden group-hover/tt:block group-focus-within/tt:block",
          "whitespace-nowrap rounded bg-[#262b33] px-2 py-1 text-[11px] text-foreground",
          "border border-border-strong shadow-md shadow-black/50",
          positions[side]
        )}
      >
        {label}
      </span>
    </span>
  );
}

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export function Tabs({
  items,
  value,
  onChange,
  className,
  size = "md",
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      className={cn("flex items-center gap-1 border-b border-border", className)}
    >
      {items.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative inline-flex items-center gap-1.5 transition-colors",
              size === "md" ? "px-3 py-2 text-sm" : "px-2.5 py-1.5 text-xs",
              active
                ? "text-foreground"
                : "text-muted hover:text-foreground/80"
            )}
          >
            {t.icon}
            {t.label}
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-0 -bottom-px h-0.5 rounded-full transition-all",
                active ? "bg-accent opacity-100" : "opacity-0"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

export function Collapsible({
  title,
  icon,
  children,
  defaultOpen = false,
  className,
  headerExtra,
}: {
  title: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  headerExtra?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("border border-border rounded-lg bg-panel overflow-hidden", className)}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-white/[0.03] transition-colors"
      >
        <span
          aria-hidden
          className={cn(
            "text-muted transition-transform duration-200",
            open && "rotate-90"
          )}
        >
          ▸
        </span>
        {icon}
        <span className="flex-1">{title}</span>
        {headerExtra}
      </button>
      {open && <div className="ff-fade-up px-4 pb-4">{children}</div>}
    </div>
  );
}
