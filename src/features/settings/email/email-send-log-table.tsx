"use client";

import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, Send } from "lucide-react";
import type { EmailSendLogRow } from "@/lib/email/providers/types";

interface EmailSendLogTableProps {
  logs: EmailSendLogRow[];
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; classes: string }> = {
  sent: { label: "Sent", icon: Send, classes: "border-green-400 text-green-700 dark:text-green-400" },
  failed: { label: "Failed", icon: XCircle, classes: "border-red-400 text-red-600" },
  pending: { label: "Pending", icon: Clock, classes: "border-amber-400 text-amber-700" },
  skipped: { label: "Skipped", icon: CheckCircle2, classes: "border-slate-300 text-slate-500" },
};

export function EmailSendLogTable({ logs }: EmailSendLogTableProps) {
  if (logs.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No send logs yet. Logs are created when you test connections or send test emails.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/20 border-b border-border">
            <th className="text-left px-3 py-2 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Time</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Operation</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Provider</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">To</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Subject</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Status</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Duration</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {logs.map((log) => {
            const statusCfg = STATUS_CONFIG[log.status] ?? { label: log.status, icon: Clock, classes: "border-slate-300 text-slate-500" };
            const Icon = statusCfg.icon;
            return (
              <tr key={log.id} className="hover:bg-muted/10 transition-colors">
                <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                  {format(parseISO(log.createdAt), "dd MMM, HH:mm")}
                </td>
                <td className="px-3 py-1.5">
                  <span className="font-mono">{log.operationType}</span>
                  <span className="ml-1 text-muted-foreground opacity-60">/ {log.featureArea}</span>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{log.providerName ?? "—"}</td>
                <td className="px-3 py-1.5">
                  {log.toEmails?.slice(0, 2).join(", ") ?? "—"}
                  {(log.toEmails?.length ?? 0) > 2 && ` +${(log.toEmails?.length ?? 0) - 2}`}
                </td>
                <td className="px-3 py-1.5 max-w-[200px] truncate">{log.subject ?? "—"}</td>
                <td className="px-3 py-1.5">
                  <Badge variant="outline" className={`text-[10px] gap-1 ${statusCfg.classes}`}>
                    <Icon className="h-2.5 w-2.5" />{statusCfg.label}
                  </Badge>
                  {log.lastError && (
                    <p className="text-red-500 mt-0.5 max-w-[180px] truncate" title={log.lastError}>{log.lastError}</p>
                  )}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{log.durationMs != null ? `${log.durationMs}ms` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
