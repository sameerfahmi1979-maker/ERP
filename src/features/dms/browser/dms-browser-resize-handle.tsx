"use client";

/**
 * DMS.BROWSER.1 (D4/D5) — draggable vertical divider between browser columns.
 * Duplicated from hr-doc-browser-resize-handle.tsx per decision D4.
 */

import type { MouseEvent as ReactMouseEvent } from "react";

interface DmsBrowserResizeHandleProps {
  onMouseDown: (e: ReactMouseEvent<HTMLDivElement>) => void;
}

export function DmsBrowserResizeHandle({ onMouseDown }: DmsBrowserResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      className="w-1.5 shrink-0 cursor-col-resize touch-none bg-border/40 hover:bg-primary/40 active:bg-primary/60 transition-colors"
    />
  );
}
