"use client";

import type { OnChangeFn, PaginationState } from "@tanstack/react-table";

export type ListPresentation = "worklist" | "embedded";

export function isVerifiedListTotal(total: number | null): total is number {
  return total !== null && Number.isSafeInteger(total) && total >= 0;
}

/** Retain navigation when needed, without a master-list toolbar. */
export function EmbeddedListNavigation({ label, total, pagination, onPaginationChange, busy = false, hasCriteria = false, onClearCriteria }: {
  label: string; total: number | null; pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>; busy?: boolean;
  hasCriteria?: boolean; onClearCriteria?: () => void;
}) {
  const verified = isVerifiedListTotal(total);
  const pages = verified ? Math.max(1, Math.ceil(total / pagination.pageSize)) : 1;
  const outOfRange = pagination.pageIndex >= pages;
  return <>
    {hasCriteria && <p className="flex flex-wrap items-center gap-2 py-2 text-sm text-muted-foreground">
      Search or filters are limiting these records.
      <button type="button" className="min-h-9 text-primary underline focus-visible:outline-2" disabled={busy} onClick={onClearCriteria}>Clear list criteria</button>
    </p>}
    {!verified && !busy && <p role="alert" className="py-2 text-sm text-destructive">Records could not yet be verified. Check the read status or retry.</p>}
    {verified && (pages > 1 || pagination.pageIndex > 0) && <nav aria-label={`${label} pages`} className="flex flex-wrap items-center justify-end gap-2 border-t border-border py-2 text-sm">
      {outOfRange ? <button type="button" className="min-h-9 rounded-sm border px-3 focus-visible:outline-2" disabled={busy}
        onClick={() => onPaginationChange(previous => ({ ...previous, pageIndex: 0 }))}>Return to first page</button> : <>
        <button type="button" className="min-h-9 rounded-sm border px-3 disabled:opacity-50 focus-visible:outline-2" disabled={busy || pagination.pageIndex === 0}
          onClick={() => onPaginationChange(previous => ({ ...previous, pageIndex: Math.max(0, previous.pageIndex - 1) }))}>Previous</button>
        <span role="status">Page {pagination.pageIndex + 1} of {pages}</span>
        <button type="button" className="min-h-9 rounded-sm border px-3 disabled:opacity-50 focus-visible:outline-2" disabled={busy || pagination.pageIndex + 1 >= pages}
          onClick={() => onPaginationChange(previous => ({ ...previous, pageIndex: Math.min(pages - 1, previous.pageIndex + 1) }))}>Next</button>
      </>}
    </nav>}
  </>;
}
