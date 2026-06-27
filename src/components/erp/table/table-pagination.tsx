"use client";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface TablePaginationProps {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
  pageSize: number;
  onPageSize: (s: number) => void;
  total: number;
  className?: string;
}

export function TablePagination({
  page,
  totalPages,
  onPage,
  pageSize,
  onPageSize,
  total,
  className,
}: TablePaginationProps) {
  if (total === 0) return null;

  const from = Math.min((page - 1) * pageSize + 1, total);
  const to = Math.min(page * pageSize, total);

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2.5 text-xs text-muted-foreground ${className ?? ""}`}
    >
      {/* Rows-per-page picker */}
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline">Rows per page:</span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
          <SelectTrigger className="h-7 w-16 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent side="top">
            {PAGE_SIZE_OPTIONS.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Range + navigation */}
      <div className="flex items-center gap-1">
        <span className="mr-2 tabular-nums">
          {from}–{to} of {total}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onPage(1)}
          disabled={page === 1}
          title="First page"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          title="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="px-2 tabular-nums">
          {page} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onPage(page + 1)}
          disabled={page === totalPages}
          title="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onPage(totalPages)}
          disabled={page === totalPages}
          title="Last page"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
