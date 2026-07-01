"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

const DEFAULT_MIN_COL_WIDTH = 60;

/**
 * Shared drag-to-resize column width state for plain HTML `<table>` grids.
 * Extracted from the DMS Batch Review Queue pattern so any ERP table can
 * add "column adjustment" (drag the header's right edge) with a couple of
 * lines, optionally persisting widths per-user via localStorage.
 */
export function useResizableColumns<K extends string>(
  defaultWidths: Record<K, number>,
  options?: { minWidth?: number; storageKey?: string }
) {
  const minWidth = options?.minWidth ?? DEFAULT_MIN_COL_WIDTH;
  const storageKey = options?.storageKey;

  const [widths, setWidths] = useState<Record<K, number>>(() => {
    if (storageKey && typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved) as Partial<Record<K, number>>;
          return { ...defaultWidths, ...parsed };
        }
      } catch {
        // Ignore corrupt/blocked storage — fall back to defaults.
      }
    }
    return defaultWidths;
  });

  const resizing = useRef<{ key: K; startX: number; startWidth: number } | null>(null);

  const startResize = useCallback(
    (key: K, e: ReactMouseEvent) => {
      e.preventDefault();
      resizing.current = { key, startX: e.clientX, startWidth: widths[key] };

      const onMove = (ev: MouseEvent) => {
        const active = resizing.current;
        if (!active) return;
        const next = Math.max(minWidth, active.startWidth + (ev.clientX - active.startX));
        setWidths((prev) => ({ ...prev, [active.key]: next }));
      };
      const onUp = () => {
        resizing.current = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [widths, minWidth]
  );

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(widths));
    } catch {
      // Ignore quota/security errors — resizing still works for this session.
    }
  }, [widths, storageKey]);

  const resetWidths = useCallback(() => setWidths(defaultWidths), [defaultWidths]);

  return { widths, startResize, resetWidths };
}
