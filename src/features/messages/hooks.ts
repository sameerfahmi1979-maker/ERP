"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorText } from "./client";

export function useTask() {
  const [issue, setIssue] = useState(""),
    [busy, setBusy] = useState(false);
  const running = useRef(false);
  const run = async (work: () => Promise<void>) => {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setIssue("");
    try {
      await work();
      return true;
    } catch (error) {
      setIssue(errorText(error));
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return { run, busy, issue };
}
export function useLoad<T>(key: string, load: (signal: AbortSignal) => Promise<T>, frequency = 0) {
  const [state, setState] = useState<{ key: string; data?: T; issue?: string }>({ key: "" });
  const [revision, setRevision] = useState(0);
  const latest = useRef(load);
  useEffect(() => {
    latest.current = load;
  }, [load]);
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    let loading = false;
    async function refresh() {
      if (loading || controller.signal.aborted) return;
      loading = true;
      try {
        const data = await latest.current(controller.signal);
        if (!controller.signal.aborted) setState({ key, data });
      } catch (e) {
        if (!controller.signal.aborted) setState({ key, issue: errorText(e) });
      } finally {
        loading = false;
      }
    }
    void refresh();
    const timer = frequency
      ? window.setInterval(() => {
          if (!document.hidden) void refresh();
        }, frequency)
      : undefined;
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [key, revision, frequency]);
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  return { ...(key && state.key === key ? state : {}), refresh };
}
