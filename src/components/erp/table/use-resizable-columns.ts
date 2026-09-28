"use client";

import { usePersistentUiState } from "@/hooks/use-persistent-ui-state";
import { useCallback, useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent } from "react";

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

  const [savedWidths, setWidths] = usePersistentUiState(storageKey, defaultWidths);
  const widths = useMemo(() => {
    const merged = { ...defaultWidths };
    for (const key of Object.keys(defaultWidths) as K[]) {
      if (Number.isFinite(savedWidths[key]) && savedWidths[key] >= minWidth) merged[key] = savedWidths[key];
    }
    return merged;
  }, [defaultWidths, savedWidths, minWidth]);

  const resizing = useRef<{ key: K; startX: number; startWidth: number } | null>(null);
  const stopResize = useRef<(() => void) | null>(null);
  useEffect(() => () => stopResize.current?.(), [storageKey]);

  const startResize = useCallback(
    (key: K, e: ReactMouseEvent) => {
      e.preventDefault();
      stopResize.current?.();
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
        stopResize.current = null;
      };
      stopResize.current = onUp;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [widths, minWidth, setWidths]
  );

  const resetWidths = useCallback(() => setWidths(defaultWidths), [defaultWidths, setWidths]);

  return { widths, startResize, resetWidths };
}
