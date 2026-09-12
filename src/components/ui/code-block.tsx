"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { HighlightedCode } from "./highlight";
import { Tooltip } from "./tabs";
import { useToast } from "./toast";

export function CodeBlock({
  code,
  language,
  filename,
  lineRef,
  tone = "neutral",
  label,
  className,
}: {
  code: string;
  language: "python" | "typescript" | "javascript" | "bash" | "sql";
  filename?: string;
  lineRef?: string;
  tone?: "neutral" | "danger" | "success";
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast(`${label ?? "Code"} copied to clipboard`, "success");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast("Could not access clipboard", "error");
    }
  };

  const tones = {
    neutral: "border-border",
    danger: "border-danger/30",
    success: "border-success/30",
  };
  const headers = {
    neutral: "text-muted",
    danger: "text-danger",
    success: "text-success",
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-[#0e1013]",
        tones[tone],
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-border bg-panel px-3 py-1.5">
        <span className={cn("font-mono text-xs", headers[tone])}>
          {filename ?? language}
        </span>
        {lineRef && (
          <span className="font-mono text-[11px] text-muted/70">{lineRef}</span>
        )}
        <span className="flex-1" />
        <Tooltip label={copied ? "Copied!" : "Copy"}>
          <button
            onClick={copy}
            aria-label="Copy code"
            className={cn(
              "rounded p-1 transition-colors",
              copied ? "text-success" : "text-muted hover:text-foreground"
            )}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </Tooltip>
      </div>
      <div className="overflow-x-auto p-3">
        <HighlightedCode code={code} language={language} />
      </div>
    </div>
  );
}
