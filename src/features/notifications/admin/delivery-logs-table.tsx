"use client";

import { NotificationStatusBadge } from "@/features/notifications/notification-status-badge";
import type { DeliveryLogRow } from "@/server/actions/notifications/delivery-logs";

interface DeliveryLogsTableProps {
  logs: DeliveryLogRow[];
}

export function DeliveryLogsTable({ logs }: DeliveryLogsTableProps) {
  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground border rounded-lg">
        <p className="text-sm">No delivery logs</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">ID</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Channel</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Status</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Queue ID</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Notif ID</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Attempt</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Duration</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Message</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Error</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {logs.map((log) => (
            <tr key={log.id} className="hover:bg-muted/20 transition-colors">
              <td className="px-3 py-2 text-xs text-muted-foreground">{log.id}</td>
              <td className="px-3 py-2 text-xs capitalize">{log.deliveryChannel}</td>
              <td className="px-3 py-2"><NotificationStatusBadge status={log.status} /></td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{log.emailQueueId ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{log.notificationId ?? "—"}</td>
              <td className="px-3 py-2 text-xs">{log.attemptNumber ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {log.durationMs != null ? `${log.durationMs}ms` : "—"}
              </td>
              <td className="px-3 py-2 text-xs max-w-[200px] truncate">{log.message ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-red-600 max-w-[200px] truncate">{log.errorMessage ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                {new Date(log.createdAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
