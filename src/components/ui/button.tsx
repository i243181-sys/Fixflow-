"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-[#1a0e08] hover:bg-accent-strong active:bg-accent font-medium",
  secondary:
    "bg-panel-2 text-foreground border border-border hover:border-border-strong hover:bg-[#242931]",
  ghost: "text-muted hover:text-foreground hover:bg-white/5",
  danger: "bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25",
  outline:
    "border border-border text-foreground hover:border-accent hover:text-accent bg-transparent",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs gap-1.5 rounded",
  md: "h-9 px-3.5 text-sm gap-2 rounded-md",
  lg: "h-10 px-5 text-sm gap-2 rounded-md",
  icon: "h-8 w-8 rounded-md",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", size = "md", loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap transition-all duration-150 select-none",
        "disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="ff-spin h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full"
        />
      )}
      {children}
    </button>
  )
);
Button.displayName = "Button";
