"use client";

import { type ReactNode } from "react";
import { usePersistentUiState } from "@/hooks/use-persistent-ui-state";
import type { ERPTableServerRead } from "./erp-table-types";
import { EmbeddedListNavigation, isVerifiedListTotal } from "./embedded-list-navigation";

/** Render the permitted card once, without manufacturing duplicate scalar columns. */
export function EmbeddedRecordCollection<T>({ id, rows, renderRecord, serverRead, isLoading, message, userProfileId }: {
  id: string; rows: T[]; renderRecord: (row: T, index: number) => ReactNode;
  serverRead?: ERPTableServerRead<T>; isLoading?: boolean; message?: string | null; userProfileId?: string;
}) {
  const [localPage, setLocalPage] = usePersistentUiState(`embedded:${userProfileId ?? "default"}:${id}:page`, { pageIndex: 0, pageSize: 25 });
  const total = serverRead ? serverRead.totalCount : rows.length;
  const verified = isVerifiedListTotal(total);
  const localIndex = Math.min(localPage.pageIndex, Math.max(0, Math.ceil(rows.length / localPage.pageSize) - 1));
  const pagination = serverRead?.pagination ?? { ...localPage, pageIndex: localIndex };
  const offset = serverRead ? 0 : pagination.pageIndex * pagination.pageSize;
  const displayed = !verified ? [] : serverRead ? rows : rows.slice(offset, offset + pagination.pageSize);
  const hasCriteria = !!serverRead && (!!serverRead.globalFilter || serverRead.columnFilters.length > 0);
  return <section aria-label="Related records" aria-busy={isLoading || undefined} className="min-w-0 space-y-2" data-list-presentation="embedded">
    {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
    {isLoading && <p role="status" className="text-sm text-muted-foreground">Loading records…</p>}
    {displayed.length > 0 && <ul className="min-w-0 space-y-2" aria-label="Records">{displayed.map((row, index) => {
      // Browser documents may have null/repeated IDs but a unique source key.
      const record = row && typeof row === "object" ? row as Record<string, unknown> : null;
      const identity = record?.key ?? record?.id ?? record?.file_id;
      const key = typeof identity === "string" || typeof identity === "number" ? identity : offset + index;
      return <li key={key} className="min-w-0 [overflow-wrap:anywhere] [&>*]:max-w-full [&>.flex]:flex-wrap [&>.flex]:gap-2">{renderRecord(row, offset + index)}</li>;
    })}</ul>}
    {verified && !isLoading && displayed.length === 0 && <p className="py-3 text-sm text-muted-foreground">{hasCriteria ? "No records match the current criteria." : total === 0 ? "No related records yet." : "No records on this page. Return to the first page."}</p>}
    <EmbeddedListNavigation label="Related records" total={total} pagination={pagination} busy={isLoading}
      onPaginationChange={serverRead?.onPaginationChange ?? (update => setLocalPage(previous => {
        const current = { ...previous, pageIndex: Math.min(previous.pageIndex, Math.max(0, Math.ceil(rows.length / previous.pageSize) - 1)) };
        return typeof update === "function" ? update(current) : update;
      }))} hasCriteria={hasCriteria}
      onClearCriteria={() => { serverRead?.onGlobalFilterChange(""); serverRead?.onColumnFiltersChange([]); serverRead?.onPaginationChange(previous => ({ ...previous, pageIndex: 0 })); }} />
  </section>;
}
