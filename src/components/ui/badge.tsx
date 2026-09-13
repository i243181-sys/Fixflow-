import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: "default" | "accent" | "lime" | "success" | "warning" | "danger" | "muted";
  className?: string;
}) {
  const tones = {
    default: "bg-panel-2 text-foreground/80 border-border",
    accent: "bg-accent/12 text-accent border-accent/30",
    lime: "bg-lime/10 text-lime border-lime/30",
    success: "bg-success/12 text-success border-success/30",
    warning: "bg-warning/12 text-warning border-warning/30",
    danger: "bg-danger/12 text-danger border-danger/30",
    muted: "bg-transparent text-muted border-border",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
