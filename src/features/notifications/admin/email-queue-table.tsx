"use client";

import { useState, useTransition, useRef } from "react";
import { ConfiguredRow, EditColumns, EditFilters, useListColumns, type ListColumn } from "@/components/erp/table/list-controls";
import { toast } from "sonner";
import { RotateCcw, XCircle, Play, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { queueStatusLabel, queueControls } from "@/lib/email/queue/presentation";
import { SortColHeader } from "@/components/erp/table/sort-col-header";
import { TablePagination } from "@/components/erp/table/table-pagination";
import { QUEUE_SORT_COLUMNS, QUEUE_STATUSES, type queuePageSchema, type QueuePageOptions } from "@/lib/email/queue/list-contract";
import { queueDeliveryDetails } from "@/lib/email/queue/ui-details";
import { AlgtDialog } from "@/components/design-system/algt-dialog";
import { EmailAttemptHistory } from "./email-attempt-history";
import type { z } from "zod";
import type { EmailQueueRow } from "@/server/actions/notifications/email-queue";
import {
  retryEmailQueueItem,
  cancelEmailQueueItem,
  processEmailQueueItem,
} from "@/server/actions/notifications/email-queue";

const COLUMNS: ListColumn[] = [
  {id:'id',label:'ID',width:80,visible:true,required:true},
  {id:'status',label:'Status',width:240,visible:true,required:true},
  {id:'priority',label:'Priority',width:100,visible:true},
  {id:'module',label:'Module',width:100,visible:true},
  {id:'to',label:'To',width:220,visible:true},
  {id:'subject',label:'Subject',width:280,visible:true},
  {id:'attempts',label:'Tries',width:80,visible:true},
  {id:'scheduled',label:'Scheduled',width:190,visible:true},
  {id:'error',label:'Delivery details',width:300,visible:true},
  {id:'actions',label:'Actions',width:140,visible:true,required:true},
];
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
  const flight = useRef(false);
  const [cancelTarget, setCancelTarget] = useState<EmailQueueRow | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const columns = useListColumns("notifications.email-queue:v1", COLUMNS);
  const widths = Object.fromEntries(columns.columns.map(c => [c.id, c.width]));

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
    if (flight.current || loading) return;
    flight.current = true;
    setActingId(id);
    startTransition(async () => {
      try {
      const result = await fn();
      if (result.success) {
        setCancelTarget(null);
        toast.info(result.data?.message ?? successMsg);
        onRefresh();
      } else {
        toast.error(result.error ?? result.data?.message ?? "Action failed");
      }
      } catch { toast.error("Response unavailable. Refresh the queue before retrying."); }
      finally {
      flight.current = false;
      setActingId(null);
      onRefresh();
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <fieldset disabled={loading} className="min-w-0 border-0 p-0 flex flex-wrap gap-2" aria-label="Queue list controls">
        <EditColumns columns={columns.columns} defaults={COLUMNS} onApply={columns.setColumns} />
        <EditFilters definitions={[
          {id:"status",label:"Delivery status",type:"select",options:QUEUE_STATUSES.map(value => ({value,label:value === "sent" ? "Provider accepted / legacy sent" : value === "delivery_unknown" ? "Delivery uncertain" : value.charAt(0).toUpperCase()+value.slice(1)}))},
          {id:"query",label:"Subject, queue code or ID",type:"text"},
        ]} values={{status:options.status??"",query:options.query}} scopeLabel="Search and status are applied on the server across the authorized queue, not only this page."
          onApply={values => { if (!loading) onOptions({...options,page:1,status:QUEUE_STATUSES.find(s=>s===values.status),query:(values.query??"").slice(0,100)}); }} />
      </fieldset>
      <p className="text-xs text-muted-foreground">{total} server-matched records. Dates use your browser timezone. Provider acceptance is not inbox delivery.</p>
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
        <div role="region" aria-label="Email queue results" tabIndex={0} className="rounded-sm border bg-card overflow-x-auto">
          <table aria-label="Email queue" className="w-full text-sm" style={{ tableLayout: "fixed", minWidth:columns.visible.reduce((sum,c)=>sum+c.width,0) }}>
            <colgroup>{columns.visible.map(c => <col key={c.id} style={{width:c.width}} />)}</colgroup>
            <thead className="border-b bg-muted/40">
              <ConfiguredRow columns={columns.columns}>
                <SortColHeader data-column="id" field="id" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} width={widths.id}>ID</SortColHeader>
                <SortColHeader data-column="status" field="status" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} width={widths.status}>Status</SortColHeader>
                <SortColHeader data-column="priority" field="priority" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} width={widths.priority}>Priority</SortColHeader>
                <SortColHeader data-column="module" field="sourceModule" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} width={widths.module}>Module</SortColHeader>
                <SortColHeader data-column="to" field="to" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} width={widths.to}>To</SortColHeader>
                <SortColHeader data-column="subject" field="subject" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} width={widths.subject}>Subject</SortColHeader>
                <SortColHeader data-column="attempts" field="attempts" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} width={widths.attempts}>Tries</SortColHeader>
                <SortColHeader data-column="scheduled" field="scheduled" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} width={widths.scheduled}>Scheduled</SortColHeader>
                <th data-column="error" className="px-3 py-2.5 text-left text-xs font-medium">Delivery details</th>
                <th data-column="actions" className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Actions</th>
              </ConfiguredRow>
            </thead>
            <tbody className="divide-y divide-border">
              {table.rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.visible.length} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No results match your search.
                  </td>
                </tr>
              ) : (
                table.rows.map((item) => (
                  <ConfiguredRow columns={columns.columns} key={item.id} className="hover:bg-muted/20 transition-colors">
                    <td data-column="id" className="px-3 py-2 text-xs text-muted-foreground truncate">{item.id}</td>
                    <td data-column="status" className="px-3 py-2 truncate">
                      <span title={queueStatusLabel(item)}>{queueStatusLabel(item)}</span>
                    </td>
                    <td data-column="priority" className="px-3 py-2 capitalize text-xs truncate">{item.priority}</td>
                    <td data-column="module" className="px-3 py-2 text-xs font-medium truncate">{item.sourceModule}</td>
                    <td data-column="to" className="px-3 py-2 text-xs truncate" title={item.toEmails.join(", ")}>{item.toEmails.join(", ")}</td>
                    <td data-column="subject" className="px-3 py-2 text-xs truncate" title={item.subject}>{item.subject}</td>
                    <td data-column="attempts" className="px-3 py-2 text-xs"><button type="button" className="underline focus-visible:outline-2" aria-label={`View attempts for queue ${item.id}`} onClick={() => setHistoryId(item.id)}>{item.attemptCount}/{item.maxAttempts}</button></td>
                    <td data-column="scheduled" className="px-3 py-2 text-xs text-muted-foreground truncate">
                      {new Date(item.scheduledFor).toLocaleString()}
                    </td>
                    <td data-column="error" className="px-3 py-2 text-xs whitespace-normal break-words">
                      {queueDeliveryDetails(item)}
                      {item.nextRetryAt && <p>Next eligible: {new Date(item.nextRetryAt).toLocaleString()}</p>}
                    </td>
                    <td data-column="actions" className="px-3 py-2">
                      <div className="flex gap-1 justify-end">
                        {canProcess && queueControls(item).process && (
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            title="Process eligible item"
                            aria-label={`Process queue item ${item.id}`}
                            disabled={loading || actingId !== null}
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
                            aria-label={`Check retry for queue item ${item.id}`}
                            disabled={loading || actingId !== null}
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
                            aria-label={`Cancel queue item ${item.id}`}
                            disabled={loading || actingId !== null}
                            onClick={() => setCancelTarget(item)}
                          >
                            <XCircle className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </ConfiguredRow>
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
      {historyId !== null && <EmailAttemptHistory key={historyId} id={historyId} onClose={() => setHistoryId(null)} />}
      <AlgtDialog open={!!cancelTarget} onOpenChange={open => { if (!open && !flight.current) setCancelTarget(null); }} title="Cancel queued message?"
        actions={<><Button variant="outline" disabled={actingId !== null} onClick={()=>setCancelTarget(null)}>Keep message</Button>
          <Button variant="destructive" disabled={loading || actingId !== null} onClick={()=>{ if(cancelTarget) void handleAction(cancelTarget.id,()=>cancelEmailQueueItem(cancelTarget.id,"Cancelled by admin"),"Cancelled"); }}>Confirm cancellation</Button></>}>
        <p>Cancel queue item {cancelTarget?.id}? A message already dispatched to the email provider cannot be recalled. The server will recheck its current state.</p>
      </AlgtDialog>
    </div>
  );
}
