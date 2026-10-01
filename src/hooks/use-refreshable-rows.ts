"use client";

import { useCallback, useRef, useState, useTransition } from "react";

/** Explicit failed/last-successful state; a read failure is never an empty list. */
export function useRefreshableRows<T>(initial: T[], initialError: boolean, fetchRows: () => Promise<{ success: boolean; data?: T[] }>) {
  const [rows, setRows] = useState(initial);
  const [failed, setFailed] = useState(initialError);
  const [loading, startTransition] = useTransition();
  const latest = useRef(0);
  const refresh = useCallback(() => {
    const request = ++latest.current;
    startTransition(async () => {
      try {
        const result = await fetchRows();
        if (request !== latest.current) return;
        if (!result.success || !result.data) { setFailed(true); return; }
        setRows(result.data); setFailed(false);
      } catch { if (request === latest.current) setFailed(true); }
    });
  }, [fetchRows]);
  return { rows, failed, loading, refresh };
}
