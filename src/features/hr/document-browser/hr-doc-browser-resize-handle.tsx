"use client";

/**
 * HR.DOC_BROWSER.1 (D5) — draggable vertical divider between browser columns.
 * See .cursor/rules/erp-document-browser-standard.mdc.
 */

import type { MouseEvent as ReactMouseEvent } from "react";

interface HrDocBrowserResizeHandleProps {
  onMouseDown: (e: ReactMouseEvent<HTMLDivElement>) => void;
}

export function HrDocBrowserResizeHandle({ onMouseDown }: HrDocBrowserResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      className="w-1.5 shrink-0 cursor-col-resize touch-none bg-border/40 hover:bg-primary/40 active:bg-primary/60 transition-colors"
    />
  );
}
