"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorText } from "./client";

const PILOT_VISIBLE_RECHECK_MS = 30_000;
const PILOT_PRESENTATION_LEASE_MS = 60_000;

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
export function useLoad<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  frequency = 0,
  events: "window" | "pilot" | "pilotProtected" = "window",
) {
  const [state, setState] = useState<{
    key: string;
    data?: T;
    issue?: string;
    validUntil?: number;
    expired?: boolean;
  }>({ key: "" });
  const [revision, setRevision] = useState(0);
  const latest = useRef(load);
  useEffect(() => {
    latest.current = load;
  }, [load]);
  useEffect(() => {
    const { key, validUntil } = state;
    if (validUntil === undefined) return;
    function expire() {
      setState((current) => current === state ? { key, expired: true } : current);
    }
    function checkExpiry() {
      if (validUntil !== undefined && Date.now() >= validUntil) expire();
    }
    const timer = window.setTimeout(expire, Math.max(0, validUntil - Date.now()));
    document.addEventListener("visibilitychange", checkExpiry);
    window.addEventListener("focus", checkExpiry);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", checkExpiry);
      window.removeEventListener("focus", checkExpiry);
    };
  }, [state]);
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    let loading = false;
    let networkChanged = false;
    let online = navigator.onLine;
    let hidden = document.hidden;
    let startedAt = 0;
    async function refresh() {
      if (loading || controller.signal.aborted) return;
      loading = true;
      networkChanged = false;
      startedAt = Date.now();
      const validUntil = events === "pilotProtected" && navigator.onLine
        ? startedAt + PILOT_PRESENTATION_LEASE_MS
        : undefined;
      try {
        const data = await latest.current(controller.signal);
        if (!controller.signal.aborted && !networkChanged) {
          setState(validUntil !== undefined && Date.now() >= validUntil
            ? { key, expired: true }
            : { key, data, validUntil });
        }
      } catch (e) {
        if (!controller.signal.aborted && !networkChanged) setState({ key, issue: errorText(e) });
      } finally {
        loading = false;
        if (networkChanged && !document.hidden && !controller.signal.aborted) reloadNetwork();
      }
    }
    function reloadNetwork() {
      // Require a fresh response before showing connected data after an offline view.
      if (online) setState({ key });
      void refresh();
    }
    function onVisibility() {
      const revealed = hidden && !document.hidden;
      hidden = document.hidden;
      if (!revealed) return;
      if (networkChanged) reloadNetwork();
      else if (Date.now() - startedAt >= PILOT_VISIBLE_RECHECK_MS) void refresh();
    }
    function onNetworkChange() {
      if (online === navigator.onLine) return;
      online = navigator.onLine;
      networkChanged = true;
      if (!document.hidden) reloadNetwork();
    }
    void refresh();
    const timer = frequency
      ? window.setInterval(() => {
          if (!document.hidden) void refresh();
        }, frequency)
      : undefined;
    if (events !== "window") {
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("online", onNetworkChange);
      window.addEventListener("offline", onNetworkChange);
    } else {
      window.addEventListener("online", refresh);
      window.addEventListener("focus", refresh);
    }
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onNetworkChange);
      window.removeEventListener("offline", onNetworkChange);
    };
  }, [key, revision, frequency, events]);
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  return { ...(key && state.key === key ? state : {}), refresh };
}
