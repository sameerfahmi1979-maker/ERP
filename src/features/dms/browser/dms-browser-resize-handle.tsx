"use client";

/**
 * DMS.BROWSER.1 (D4/D5) — draggable vertical divider between browser columns.
 * Duplicated from hr-doc-browser-resize-handle.tsx per decision D4.
 */

import type { MouseEvent as ReactMouseEvent } from "react";

interface DmsBrowserResizeHandleProps {
  onMouseDown: (e: ReactMouseEvent<HTMLDivElement>) => void;
  width: number;
  min: number;
  max: number;
  onResize: (width: number) => void;
}

export function DmsBrowserResizeHandle({ onMouseDown, width, min, max, onResize }: DmsBrowserResizeHandleProps) {
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label="Resize document results"
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      onMouseDown={onMouseDown}
      onKeyDown={event => {
        const positions: Record<string, number> = { ArrowLeft: width - 24, ArrowRight: width + 24, Home: min, End: max };
        const next = Object.hasOwn(positions, event.key) ? positions[event.key] : undefined;
        if (next === undefined) return;
        event.preventDefault();
        onResize(Math.max(min, Math.min(max, next)));
      }}
      className="w-1.5 shrink-0 cursor-col-resize touch-none bg-border/40 hover:bg-primary/40 focus-visible:outline-2 focus-visible:outline-primary active:bg-primary/60 transition-colors"
    />
  );
}
