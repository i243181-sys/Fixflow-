"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, X, XCircle, Info } from "lucide-react";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastCtx = createContext<{
  toast: (message: string, kind?: ToastKind) => void;
}>({ toast: () => {} });

export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = ++nextId.current;
    setToasts((current) => [...current, { id, kind, message }]);
    timers.current.set(id, setTimeout(dismiss, 4000, id));
  }, [dismiss]);

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      activeTimers.forEach(clearTimeout);
      activeTimers.clear();
    };
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="ff-fade-up flex items-start gap-2.5 rounded-md border border-border bg-panel px-3.5 py-3 shadow-lg shadow-black/40"
          >
            {t.kind === "success" && (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
            )}
            {t.kind === "error" && (
              <XCircle size={16} className="mt-0.5 shrink-0 text-danger" />
            )}
            {t.kind === "info" && (
              <Info size={16} className="mt-0.5 shrink-0 text-lime" />
            )}
            <p className="flex-1 text-sm text-foreground/90 leading-snug">
              {t.message}
            </p>
            <button
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
              className="text-muted hover:text-foreground transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
