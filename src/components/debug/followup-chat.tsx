"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Bot, CornerDownLeft, GitBranch, MessagesSquare, Code2, User } from "lucide-react";
import { FOLLOWUP_SUGGESTIONS } from "@/lib/mock-data";
import { sendFollowUp } from "@/lib/api";
import type { ChatMessage, SourceType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

const SOURCE_ICON: Record<SourceType, React.ReactNode> = {
  docs: <BookOpen size={11} />,
  github: <GitBranch size={11} />,
  community: <MessagesSquare size={11} />,
  code: <Code2 size={11} />,
};

export function FollowUpChat({
  sessionId,
  confidence,
}: {
  sessionId: string;
  confidence: number;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "seed",
      role: "fixflow",
      text: `Diagnosis ready with ${confidence}% confidence. Ask me anything about this fix — the retrieved debugging context stays loaded for follow-ups.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const messageId = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const { toast } = useToast();
  const listRef = useRef<HTMLDivElement>(null);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setInput("");
    setBusy(true);
    const pendingId = `p-${messageId.current++}`;
    setMessages((m) => [
      ...m,
      { id: `u-${messageId.current++}`, role: "user", text: question },
      { id: pendingId, role: "fixflow", text: "", pending: true },
    ]);
    try {
      const reply = await sendFollowUp(question, sessionId, controller.signal);
      if (controller.signal.aborted) return;
      setMessages((m) =>
        m.map((msg) =>
          msg.id === pendingId
            ? { id: reply.id, role: "fixflow", text: reply.text, sources: reply.sources }
            : msg
        )
      );
    } catch {
      if (!controller.signal.aborted) {
        setMessages((m) => m.filter((x) => x.id !== pendingId));
        toast("Could not send the follow-up. Try again.", "error");
      }
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setBusy(false);
        requestAnimationFrame(() =>
          listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight, behavior: "smooth" })
        );
      }
    }
  };

  useEffect(() => () => activeRequest.current?.abort(), []);

  return (
    <section aria-label="Follow-up chat" className="rounded-xl border border-border bg-panel">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Bot size={15} className="text-accent" />
        <h3 className="text-sm font-semibold">Ask about this fix…</h3>
        <span className="ml-auto hidden text-[11px] text-muted sm:inline">
          context from diagnosis attached
        </span>
      </div>

      <div ref={listRef} className="max-h-96 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ff-fade-up flex justify-end gap-2.5">
              <div className="max-w-[85%] rounded-lg rounded-br-sm border border-accent/25 bg-accent/12 px-3.5 py-2.5">
                <p className="text-[13px] leading-relaxed text-foreground">{m.text}</p>
              </div>
              <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-panel-2 text-muted">
                <User size={13} />
              </span>
            </div>
          ) : (
            <div key={m.id} className="ff-fade-up flex gap-2.5">
              <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                <Bot size={13} />
              </span>
              <div className="max-w-[85%] space-y-2">
                <div className="rounded-lg rounded-tl-sm border border-border bg-[#0e1013] px-3.5 py-2.5">
                  {m.pending ? (
                    <span className="flex gap-1 py-1" aria-label="FixFlow is thinking">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="ff-pulse-dot h-1.5 w-1.5 rounded-full bg-accent"
                          style={{ animationDelay: `${i * 0.2}s` }}
                        />
                      ))}
                    </span>
                  ) : (
                    <p className="text-[13px] leading-relaxed text-foreground/90">{m.text}</p>
                  )}
                </div>
                {m.sources && m.sources.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.sources.map((s) => (
                      <span
                        key={`${s.type}:${s.title}`}
                        className={cn(
                          "inline-flex items-center gap-1 rounded border border-border bg-panel-2 px-2 py-0.5 text-[10px]",
                          s.type === "docs" ? "text-lime/90" : "text-muted"
                        )}
                      >
                        {SOURCE_ICON[s.type]}
                        {s.title}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        )}
      </div>

      <div className="border-t border-border px-4 py-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {FOLLOWUP_SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              disabled={busy}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask(input)}
            placeholder="Ask a follow-up about this diagnosis…"
            aria-label="Follow-up question"
            disabled={busy}
            className="h-10 flex-1 rounded-lg border border-border bg-[#0e1013] px-3.5 text-sm text-foreground placeholder:text-muted/50 focus:border-accent/60 focus:outline-none disabled:opacity-60"
          />
          <button
            onClick={() => ask(input)}
            disabled={busy || !input.trim()}
            aria-label="Send follow-up"
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-[#1a0e08] transition-colors hover:bg-accent-strong disabled:opacity-40"
          >
            <CornerDownLeft size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
