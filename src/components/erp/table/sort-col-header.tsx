"use client";

import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortDir } from "@/hooks/use-sort-paginate";

interface SortColHeaderProps {
  field: string;
  sortKey: string | null;
  sortDir: SortDir;
  onSort: (field: string) => void;
  children: React.ReactNode;
  className?: string;
  align?: "left" | "center" | "right";
}

export function SortColHeader({
  field,
  sortKey,
  sortDir,
  onSort,
  children,
  className,
  align = "left",
}: SortColHeaderProps) {
  const active = sortKey === field;

  return (
    <th
      onClick={() => onSort(field)}
      className={cn(
        "cursor-pointer select-none transition-colors hover:text-foreground",
        "font-medium text-xs uppercase tracking-wide text-muted-foreground",
        "px-4 py-2.5",
        align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center",
        active && "text-foreground",
        className
      )}
    >
      <span className="inline-flex items-center gap-1">
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
      </span>
    </th>
  );
}
