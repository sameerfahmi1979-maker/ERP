"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortDir } from "@/hooks/use-sort-paginate";

interface SortColHeaderProps {
  "data-column"?: string;
  field: string;
  sortKey: string | null;
  sortDir: SortDir;
  onSort: (field: string) => void;
  children: React.ReactNode;
  className?: string;
  align?: "left" | "center" | "right";
  /** Optional fixed width in px — pairs with `onResizeStart` for resizable columns. */
  width?: number;
  /** When provided, renders a drag handle on the right edge to resize this column. */
  onResizeStart?: (e: ReactMouseEvent<HTMLDivElement>) => void;
}

export function SortColHeader({
  "data-column": columnId,
  field,
  sortKey,
  sortDir,
  onSort,
  children,
  className,
  align = "left",
  width,
  onResizeStart,
}: SortColHeaderProps) {
  const active = sortKey === field;

  return (
    <th
      data-column={columnId}
      aria-sort={active ? sortDir === "asc" ? "ascending" : "descending" : "none"}
      style={width != null ? { width } : undefined}
      className={cn(
        "relative cursor-pointer select-none transition-colors hover:text-foreground",
        "font-medium text-xs uppercase tracking-wide text-muted-foreground",
        "px-4 py-2.5",
        align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center",
        active && "text-foreground",
        className
      )}
    >
      <button type="button" onClick={() => onSort(field)} className="inline-flex min-h-8 items-center gap-1 text-left focus-visible:outline-2">
        {children}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3 shrink-0" />
          ) : (
            <ArrowDown className="h-3 w-3 shrink-0" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 shrink-0 opacity-35" />
        )}
      </button>
      {onResizeStart && (
        <div
          onClick={(e) => e.stopPropagation()}
          onMouseDown={onResizeStart}
          className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none hover:bg-primary/50"
        />
      )}
    </th>
  );
}
