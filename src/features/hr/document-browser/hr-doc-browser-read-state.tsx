"use client";
import {Button} from "@/components/ui/button";
export function HrBrowserReadState({noun, busy, failed, oversized, retry}: {noun: string; busy: boolean; failed: boolean; oversized?: boolean; retry: () => void}) {
  if (busy) return <p role="status" className="p-3 text-xs text-muted-foreground">Loading {noun}…</p>;
  if (oversized) return <p role="alert" className="p-3 text-sm">Too many matching records for a complete safe view. {noun === "documents" ? "This person's combined document collection needs an administrator's review." : "Refine the employee/dependent search or contact your administrator."} No partial result is shown.</p>;
  if (failed) return <div role="alert" className="m-3 rounded-sm border border-destructive p-3 text-sm">The complete {noun} could not be loaded. Results in this section remain unverified. <Button variant="outline" onClick={retry}>Retry {noun}</Button></div>;
  return null;
}
export function HrBrowserPagination({label, page, pageSize, total, busy, onPage}: {label: string; page: number; pageSize: number; total: number | null; busy: boolean; onPage: (page: number) => void}) {
  return <nav aria-label={`${label} pages`} className="flex items-center gap-2 border-t p-2 text-xs shrink-0">
    <Button size="sm" variant="outline" disabled={busy || page <= 1} onClick={() => onPage(page - 1)} aria-label={`Previous ${label} page`}>Previous</Button>
    <span className="flex-1 text-center">{total === null ? "Total unverified" : `${total} permitted · Page ${page} of ${Math.max(1, Math.ceil(total / pageSize))}`}</span>
    <Button size="sm" variant="outline" disabled={busy || total === null || page * pageSize >= total} onClick={() => onPage(page + 1)} aria-label={`Next ${label} page`}>Next</Button>
  </nav>;
}
