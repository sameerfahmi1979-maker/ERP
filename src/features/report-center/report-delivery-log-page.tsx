"use client";
import { LoadedListTools, useLoadedListView, type LoadedListField } from "@/components/erp/table/loaded-list-view";
import { ConfiguredRow } from "@/components/erp/table/list-controls";
import { useSortPaginate } from "@/hooks/use-sort-paginate";
import { TablePagination } from "@/components/erp/table/table-pagination";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Mail, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface DeliveryLog {
  id: number;
  run_id: number | null;
  delivery_type: string;
  recipient_to: string[] | null;
  recipient_cc: string[] | null;
  subject: string | null;
  attachment_format: string | null;
  attachment_filename: string | null;
  attachment_size_bytes: number | null;
  provider: string | null;
  delivery_status: "queued" | "sent" | "failed" | "cancelled" | "provider_accepted" | "delivery_unknown";
  success: boolean | null;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

const STATUS_ICONS = {
  provider_accepted: { icon: CheckCircle2, color: "text-emerald-600", label: "Provider accepted (not inbox confirmation)" },
  delivery_unknown: { icon: Clock, color: "text-amber-600", label: "Delivery uncertain — reconcile before resending" },
  sent: { icon: CheckCircle2, color: "text-emerald-600", label: "Recorded sent (not inbox confirmation)" },
  failed: { icon: XCircle, color: "text-red-600", label: "Failed" },
  queued: { icon: Clock, color: "text-blue-600", label: "Queued" },
  cancelled: { icon: XCircle, color: "text-amber-600", label: "Cancelled" },
};

interface ReportDeliveryLogPanelProps {
  runId?: number;
}

export function ReportDeliveryLogPanel({ runId }: ReportDeliveryLogPanelProps) {
  const { data: logs = [], isPending: isLoading, error, refetch } = useQuery({
    queryKey: ["report-delivery-logs", runId],
    enabled: !!runId,
    queryFn: async () => {
      const { data, error } = await createClient().from("erp_report_delivery_logs").select("*").eq("run_id", runId!).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as DeliveryLog[];
    },
    retry: false, gcTime: 0, refetchOnWindowFocus: false,
  });

  if (!runId) return <div className="text-xs text-muted-foreground">No run selected.</div>;
  if (error) return <div role="alert">Could not load delivery history. <Button onClick={() => void refetch()}>Retry delivery history</Button></div>;
  if (isLoading) return <div className="text-xs text-muted-foreground">Loading...</div>;
  if (logs.length === 0) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Mail className="h-3.5 w-3.5" />
        No email deliveries for this run.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => {
        const statusCfg = STATUS_ICONS[log.delivery_status] ?? STATUS_ICONS.failed;
        const StatusIcon = statusCfg.icon;

        return (
          <div key={log.id} className="border rounded p-2.5 bg-background text-xs space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className={cn("flex items-center gap-1.5", statusCfg.color)}>
                <StatusIcon className="h-3.5 w-3.5" />
                <span className="font-medium">{statusCfg.label}</span>
              </div>
              {log.attachment_format && (
                <Badge variant="outline" className="text-[10px] font-mono uppercase">
                  {log.attachment_format}
                </Badge>
              )}
            </div>
            {log.subject && (
              <div className="text-muted-foreground truncate">{log.subject}</div>
            )}
            {log.recipient_to && log.recipient_to.length > 0 && (
              <div className="text-muted-foreground">
                To: {log.recipient_to.join(", ")}
              </div>
            )}
            {log.attachment_filename && (
              <div className="text-muted-foreground font-mono">{log.attachment_filename}</div>
            )}
            {log.sent_at && (
              <div className="text-muted-foreground">
                {format(new Date(log.sent_at), "dd MMM yyyy HH:mm:ss")}
              </div>
            )}
            {log.error_message && (
              <div className="text-destructive">Delivery failed. Ask an authorized administrator to inspect the delivery record.</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Full delivery log page (standalone — for future admin route)
// ─────────────────────────────────────────────────────────────────────────────

const LIST_FIELDS: LoadedListField[] = [
  {
    "id": "delivery_status",
    "label": "Status",
    "path": "delivery_status",
    "type": "text",
    "width": 180,
    "required": true
  },
  {
    "id": "subject",
    "label": "Subject",
    "path": "subject",
    "type": "text",
    "width": 180
  },
  {
    "id": "recipient_to",
    "label": "To",
    "path": "recipient_to",
    "type": "text",
    "width": 180
  },
  {
    "id": "attachment_format",
    "label": "Format",
    "path": "attachment_format",
    "type": "text",
    "width": 180
  },
  {
    "id": "provider",
    "label": "Provider",
    "path": "provider",
    "type": "text",
    "width": 180
  },
  {
    "id": "delivery_type",
    "label": "Type",
    "path": "delivery_type",
    "type": "text",
    "width": 180
  },
  {
    "id": "sent_at",
    "label": "Sent",
    "path": "sent_at",
    "type": "date",
    "width": 180
  }
];
export function ReportDeliveryLogFullPage() {
  const { data: logs = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["report-delivery-logs", "latest-500"],
    queryFn: async () => {
      const { data, error } = await createClient().from("erp_report_delivery_logs").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw new Error("Delivery history unavailable");
      return (data ?? []) as DeliveryLog[];
    }, retry: false, gcTime: 0,
  });

  const listView = useLoadedListView("ReportDeliveryLogFullPage", logs, LIST_FIELDS);
  const pagination = useSortPaginate(listView.rows,{memoryKey:"ReportDeliveryLogFullPage"});

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Mail className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Email Delivery Log</h1>
        <Badge variant="secondary">{logs.length} loaded entries (latest 500)</Badge>
        <Button onClick={() => void refetch()}>Refresh history</Button>
      </div>
      {isError && <div role="alert">Delivery history could not be refreshed. Any retained rows may be out of date.</div>}

      <div className="border rounded-lg overflow-hidden"><LoadedListTools view={listView} search />
        <div role="region" aria-label="ReportDeliveryLogFullPage results" tabIndex={0} className="max-w-full overflow-x-auto"><table className="w-full table-fixed text-sm" style={{minWidth:listView.visible.reduce((sum,c)=>sum+c.width,0)}}><colgroup>{listView.visible.map(c=><col key={c.id} style={{width:c.width}} />)}</colgroup>
          <thead>
            <ConfiguredRow columns={listView.columns} className="bg-muted/50 border-b text-xs font-medium text-muted-foreground">
              <th data-column="delivery_status" className="px-3 py-2.5 text-left">Status</th>
              <th data-column="subject" className="px-3 py-2.5 text-left">Subject</th>
              <th data-column="recipient_to" className="px-3 py-2.5 text-left">To</th>
              <th data-column="attachment_format" className="px-3 py-2.5 text-left">Format</th>
              <th data-column="provider" className="px-3 py-2.5 text-left">Provider</th>
              <th data-column="delivery_type" className="px-3 py-2.5 text-left">Type</th>
              <th data-column="sent_at" className="px-3 py-2.5 text-left">Sent</th>
            </ConfiguredRow>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={listView.visible.length} className="px-4 py-8 text-center text-muted-foreground text-xs">
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && !isError && pagination.rows.length === 0 && (
              <tr>
                <td colSpan={listView.visible.length} className="px-4 py-8 text-center text-muted-foreground text-xs">
                  No delivery logs found.
                </td>
              </tr>
            )}
            {pagination.rows.map((log) => {
              const statusCfg = STATUS_ICONS[log.delivery_status] ?? STATUS_ICONS.failed;
              const StatusIcon = statusCfg.icon;

              return (
                <ConfiguredRow columns={listView.columns} key={log.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td data-column="delivery_status" className="px-3 py-2.5">
                    <div className={cn("flex items-center gap-1.5", statusCfg.color)}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      <span className="text-xs">{statusCfg.label}</span>
                    </div>
                  </td>
                  <td data-column="subject" className="px-3 py-2.5 max-w-xs truncate text-xs">
                    {log.subject ?? "—"}
                  </td>
                  <td data-column="recipient_to" className="px-3 py-2.5 text-xs text-muted-foreground max-w-xs truncate">
                    {log.recipient_to?.join(", ") ?? "—"}
                  </td>
                  <td data-column="attachment_format" className="px-3 py-2.5">
                    {log.attachment_format && (
                      <Badge variant="outline" className="text-[10px] font-mono uppercase">
                        {log.attachment_format}
                      </Badge>
                    )}
                  </td>
                  <td data-column="provider" className="px-3 py-2.5 text-xs text-muted-foreground">
                    {log.provider ?? "—"}
                  </td>
                  <td data-column="delivery_type" className="px-3 py-2.5 text-xs text-muted-foreground">
                    {log.delivery_type}
                  </td>
                  <td data-column="sent_at" className="px-3 py-2.5 text-xs text-muted-foreground">
                    {log.sent_at
                      ? format(new Date(log.sent_at), "dd MMM HH:mm")
                      : log.error_message
                      ? <span className="text-destructive">Delivery failed; review the authorized delivery record.</span>
                      : "—"}
                  </td>
                </ConfiguredRow>
              );
            })}
          </tbody>
        </table></div>
      <TablePagination page={pagination.page} totalPages={pagination.totalPages} onPage={pagination.setPage} pageSize={pagination.pageSize} onPageSize={pagination.setPageSize} total={pagination.totalFiltered}/></div>
    </div>
  );
}
