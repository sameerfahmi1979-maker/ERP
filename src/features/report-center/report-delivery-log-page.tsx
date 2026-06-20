"use client";

import { useState, useEffect } from "react";
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
  delivery_status: "queued" | "sent" | "failed" | "cancelled";
  success: boolean | null;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

const STATUS_ICONS = {
  sent: { icon: CheckCircle2, color: "text-emerald-600", label: "Sent" },
  failed: { icon: XCircle, color: "text-red-600", label: "Failed" },
  queued: { icon: Clock, color: "text-blue-600", label: "Queued" },
  cancelled: { icon: XCircle, color: "text-amber-600", label: "Cancelled" },
};

interface ReportDeliveryLogPanelProps {
  runId?: number;
}

export function ReportDeliveryLogPanel({ runId }: ReportDeliveryLogPanelProps) {
  const [logs, setLogs] = useState<DeliveryLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!runId) return;
    setIsLoading(true);
    const db = createClient();
    db.from("erp_report_delivery_logs")
      .select("*")
      .eq("run_id", runId)
      .order("created_at", { ascending: false })
      .then(({ data }: { data: DeliveryLog[] | null }) => {
        setLogs(data ?? []);
        setIsLoading(false);
      });
  }, [runId]);

  if (!runId) return <div className="text-xs text-muted-foreground">No run selected.</div>;
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
              <div className="text-red-600">{log.error_message}</div>
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

export function ReportDeliveryLogFullPage() {
  const [logs, setLogs] = useState<DeliveryLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const db = createClient();
    db.from("erp_report_delivery_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }: { data: DeliveryLog[] | null }) => {
        setLogs(data ?? []);
        setIsLoading(false);
      });
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Mail className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Email Delivery Log</h1>
        <Badge variant="secondary">{logs.length} entries</Badge>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b text-xs font-medium text-muted-foreground">
              <th className="px-3 py-2.5 text-left">Status</th>
              <th className="px-3 py-2.5 text-left">Subject</th>
              <th className="px-3 py-2.5 text-left">To</th>
              <th className="px-3 py-2.5 text-left">Format</th>
              <th className="px-3 py-2.5 text-left">Provider</th>
              <th className="px-3 py-2.5 text-left">Type</th>
              <th className="px-3 py-2.5 text-left">Sent</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-xs">
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && logs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-xs">
                  No delivery logs found.
                </td>
              </tr>
            )}
            {logs.map((log) => {
              const statusCfg = STATUS_ICONS[log.delivery_status] ?? STATUS_ICONS.failed;
              const StatusIcon = statusCfg.icon;

              return (
                <tr key={log.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5">
                    <div className={cn("flex items-center gap-1.5", statusCfg.color)}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      <span className="text-xs">{statusCfg.label}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 max-w-xs truncate text-xs">
                    {log.subject ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-xs truncate">
                    {log.recipient_to?.join(", ") ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    {log.attachment_format && (
                      <Badge variant="outline" className="text-[10px] font-mono uppercase">
                        {log.attachment_format}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {log.provider ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {log.delivery_type}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {log.sent_at
                      ? format(new Date(log.sent_at), "dd MMM HH:mm")
                      : log.error_message
                      ? <span className="text-red-600 truncate max-w-[120px] block">{log.error_message}</span>
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
