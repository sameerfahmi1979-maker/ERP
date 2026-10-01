"use client";

/**
 * HR.DOC_BROWSER.1 (D5) — draggable vertical divider between browser columns.
 * See .cursor/rules/erp-document-browser-standard.mdc.
 */

import type { MouseEvent as ReactMouseEvent } from "react";

interface HrDocBrowserResizeHandleProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onResize: (value:number)=>void;
  onMouseDown: (e: ReactMouseEvent<HTMLDivElement>) => void;
}

export function HrDocBrowserResizeHandle({ onMouseDown, label, value, min, max, onResize }: HrDocBrowserResizeHandleProps) {
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      onKeyDown={event=>{const next=event.key==='ArrowLeft'?value-20:event.key==='ArrowRight'?value+20:event.key==='Home'?min:event.key==='End'?max:null;if(next!==null){event.preventDefault();onResize(Math.min(max,Math.max(min,next)));}}}
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      className="hidden xl:block w-1.5 shrink-0 cursor-col-resize touch-none bg-border/40 hover:bg-primary/40 active:bg-primary/60 transition-colors focus-visible:outline-2 focus-visible:outline-primary"
    />
  );
}
