"use client";

import { useCallback, useEffect, useState } from "react";

/** Abort on navigation and keep loading, empty, and failure states distinct. */
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).then((value) => {
      if (!controller.signal.aborted) setData(value);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load data.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [load, version]);
  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setVersion((current) => current + 1);
  }, []);
  return { data, loading, error, reload };
}
