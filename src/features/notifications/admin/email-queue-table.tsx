"use client";

import { useState, useTransition, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { RotateCcw, XCircle, Play, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { queueStatusLabel, queueControls } from "@/lib/email/queue/presentation";
import { SortColHeader } from "@/components/erp/table/sort-col-header";
import { TablePagination } from "@/components/erp/table/table-pagination";
import { QUEUE_SORT_COLUMNS, type queuePageSchema, type QueuePageOptions } from "@/lib/email/queue/list-contract";
import type { z } from "zod";
import type { EmailQueueRow } from "@/server/actions/notifications/email-queue";
import {
  retryEmailQueueItem,
  cancelEmailQueueItem,
  processEmailQueueItem,
} from "@/server/actions/notifications/email-queue";

// ── Default column widths ─────────────────────────────────────────────────────

const DEFAULT_COL_WIDTHS: Record<string, number> = {
  id:        60,
  status:   110,
  priority:  80,
  module:    80,
  to:       200,
  subject:  280,
  attempts:  80,
  scheduled:160,
  error:    220,
};

// ── Column resize hook ────────────────────────────────────────────────────────

function useColWidths(defaults: Record<string, number>) {
  const [widths, setWidths] = useState<Record<string, number>>(defaults);
  const dragging = useRef<{ col: string; startX: number; startW: number } | null>(null);

  const onResizeStart = useCallback(
    (col: string) =>
      (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        dragging.current = { col, startX: e.clientX, startW: widths[col] ?? defaults[col] };
      },
    [widths, defaults]
  );

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      const { col, startX, startW } = dragging.current;
      const delta = e.clientX - startX;
      setWidths((prev) => ({ ...prev, [col]: Math.max(48, startW + delta) }));
    }
    function onMouseUp() {
      dragging.current = null;
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return { widths, onResizeStart };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface EmailQueueTableProps {
  items: EmailQueueRow[];
  onRefresh: () => void;
  canManage: boolean;
  canProcess: boolean;
  loading: boolean;
  total: number;
  options: z.output<typeof queuePageSchema>;
  onOptions: (options: QueuePageOptions) => void;
}

export function EmailQueueTable({ items, onRefresh, canManage, canProcess, loading, total, options, onOptions }: EmailQueueTableProps) {
  const [actingId, setActingId] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const { widths, onResizeStart } = useColWidths(DEFAULT_COL_WIDTHS);

  const table = {
    ...options, rows: items, totalFiltered: total, totalPages: Math.max(1, Math.ceil(total / options.pageSize)),
    setQuery: (query: string) => onOptions({ ...options, page: 1, query }),
    setPage: (page: number) => { if (!loading) onOptions({ ...options, page }); },
    setPageSize: (pageSize: number) => { if (!loading && [10, 25, 50, 100].includes(pageSize)) onOptions({ ...options, page: 1, pageSize: pageSize as 10 | 25 | 50 | 100 }); },
    toggleSort: (key: string) => {
      if (!loading && Object.hasOwn(QUEUE_SORT_COLUMNS, key)) onOptions({ ...options, page: 1,
        sortKey: key as keyof typeof QUEUE_SORT_COLUMNS, sortDir: options.sortKey === key && options.sortDir === "asc" ? "desc" : "asc" });
    },
  };

  const handleAction = async (
    id: number,
    fn: () => Promise<{ success: boolean; error?: string; data?: {message?:string} }>,
    successMsg: string
  ) => {
    setActingId(id);
    startTransition(async () => {
      try {
      const result = await fn();
      if (result.success) {
        toast.info(result.data?.message ?? successMsg);
        onRefresh();
      } else {
        toast.error(result.error ?? result.data?.message ?? "Action failed");
      }
      } catch { toast.error("Response unavailable. Refresh the queue before retrying."); }
      finally {
      setActingId(null);
      onRefresh();
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Search bar */}
      <div className="relative w-full max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={table.query}
          onChange={(e) => table.setQuery(e.target.value)}
          placeholder="Search subject, queue code or ID…"
          aria-label="Search queue by subject, queue code or ID"
          maxLength={100}
          className="h-8 pl-8 pr-8 text-sm"
        />
        {table.query && (
          <button
            aria-label="Clear queue search"
            onClick={() => table.setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {items.length === 0 && total === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground border rounded-lg">
          <p className="text-sm">{loading ? "Queue results unavailable or loading" : "No queue items match these filters"}</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: widths.id }} />
              <col style={{ width: widths.status }} />
              <col style={{ width: widths.priority }} />
              <col style={{ width: widths.module }} />
              <col style={{ width: widths.to }} />
              <col style={{ width: widths.subject }} />
              <col style={{ width: widths.attempts }} />
              <col style={{ width: widths.scheduled }} />
              <col style={{ width: widths.error }} />
              <col style={{ width: 96 }} />
            </colgroup>
            <thead className="border-b bg-muted/40">
              <tr>
                <SortColHeader field="id" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} width={widths.id} onResizeStart={onResizeStart("id")}>ID</SortColHeader>
                <SortColHeader field="status" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} width={widths.status} onResizeStart={onResizeStart("status")}>Status</SortColHeader>
                <SortColHeader field="priority" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} width={widths.priority} onResizeStart={onResizeStart("priority")}>Priority</SortColHeader>
                <SortColHeader field="sourceModule" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} width={widths.module} onResizeStart={onResizeStart("module")}>Module</SortColHeader>
                <SortColHeader field="to" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} width={widths.to} onResizeStart={onResizeStart("to")}>To</SortColHeader>
                <SortColHeader field="subject" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} width={widths.subject} onResizeStart={onResizeStart("subject")}>Subject</SortColHeader>
                <SortColHeader field="attempts" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} width={widths.attempts} onResizeStart={onResizeStart("attempts")}>Tries</SortColHeader>
                <SortColHeader field="scheduled" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} width={widths.scheduled} onResizeStart={onResizeStart("scheduled")}>Scheduled</SortColHeader>
                <SortColHeader field="error" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} width={widths.error} onResizeStart={onResizeStart("error")}>Last Error</SortColHeader>
                <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {table.rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No results match your search.
                  </td>
                </tr>
              ) : (
                table.rows.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 text-xs text-muted-foreground truncate">{item.id}</td>
                    <td className="px-3 py-2 truncate">
                      <span title={queueStatusLabel(item)}>{queueStatusLabel(item)}</span>
                    </td>
                    <td className="px-3 py-2 capitalize text-xs truncate">{item.priority}</td>
                    <td className="px-3 py-2 text-xs font-medium truncate">{item.sourceModule}</td>
                    <td className="px-3 py-2 text-xs truncate" title={item.toEmails.join(", ")}>{item.toEmails.join(", ")}</td>
                    <td className="px-3 py-2 text-xs truncate" title={item.subject}>{item.subject}</td>
                    <td className="px-3 py-2 text-xs truncate">{item.attemptCount}/{item.maxAttempts}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground truncate">
                      {new Date(item.scheduledFor).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-xs text-red-600 truncate" title={item.lastError ?? undefined}>
                      {item.lastError ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 justify-end">
                        {canProcess && queueControls(item).process && (
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            title="Process eligible item"
                            disabled={loading || actingId === item.id}
                            onClick={() =>
                              handleAction(item.id, () => processEmailQueueItem(item.id, false), "Processing completed; check delivery status.")
                            }
                          >
                            <Play className="h-3 w-3" />
                          </Button>
                        )}
                        {canProcess && queueControls(item).retry && (
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            title="Check retry eligibility"
                            disabled={loading || actingId === item.id}
                            onClick={() =>
                              handleAction(item.id, () => retryEmailQueueItem(item.id), "Retry remains scheduled; cooldown and attempt limits are unchanged.")
                            }
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        )}
                        {canManage && queueControls(item).cancel && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            title="Cancel"
                            disabled={loading || actingId === item.id}
                            onClick={() =>
                              handleAction(item.id, () => cancelEmailQueueItem(item.id, "Cancelled by admin"), "Cancelled")
                            }
                          >
                            <XCircle className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <fieldset disabled={loading} aria-label="Queue page navigation" className="min-w-0 border-0 p-0">
          <TablePagination
            page={table.page}
            totalPages={table.totalPages}
            onPage={table.setPage}
            pageSize={table.pageSize}
            onPageSize={table.setPageSize}
            total={table.totalFiltered}
          />
          </fieldset>
        </div>
      )}
    </div>
  );
}
