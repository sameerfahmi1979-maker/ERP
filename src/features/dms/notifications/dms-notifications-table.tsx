"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, CheckCircle2, XCircle, Bell, Mail, GitMerge } from "lucide-react";
import { queryKeys } from "@/lib/query/query-keys";
import { useQuery } from "@tanstack/react-query";
import {
  getDmsNotifications,
  markDmsNotificationRead,
  dismissDmsNotification,
  type DmsNotificationRow,
  type DmsNotificationsFilter,
} from "@/server/actions/dms/notifications";
import { bridgeDmsNotificationToGlobal } from "@/server/actions/dms/dms-email-bridge";
import { invalidateDmsNotifications, invalidateEmailQueue } from "@/lib/query/invalidation";
import { DmsBridgeStatusBadge } from "./dms-bridge-status-badge";

interface DmsNotificationsTableProps {
  filter?: DmsNotificationsFilter;
  showBridgeStatus?: boolean;
}

export function DmsNotificationsTable({ filter = {}, showBridgeStatus = false }: DmsNotificationsTableProps) {
  const queryClient = useQueryClient();
  const [bridgingId, setBridgingId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: queryKeys.dms.notifications(filter as Record<string, unknown>),
    queryFn: async () => {
      const result = await getDmsNotifications(filter);
      if (!result.success) throw new Error(result.error);
      return result.data ?? [];
    },
    staleTime: 30_000,
  });

  const handleRead = async (id: number) => {
    const result = await markDmsNotificationRead(id);
    if (result.success) {
      toast.success("Marked as read");
      invalidateDmsNotifications(queryClient);
    }
  };

  const handleDismiss = async (id: number) => {
    const result = await dismissDmsNotification(id);
    if (result.success) {
      toast.success("Notification dismissed");
      invalidateDmsNotifications(queryClient);
    }
  };

  const handleBridge = (id: number) => {
    setBridgingId(id);
    startTransition(async () => {
      const result = await bridgeDmsNotificationToGlobal(id);
      if (result.success && result.data) {
        if (result.data.skipped) {
          toast.info(result.data.reason ?? "Already bridged");
        } else {
          toast.success(`Bridged → notif #${result.data.globalNotificationId}${result.data.globalEmailQueueId ? `, email queued #${result.data.globalEmailQueueId}` : ""}`);
        }
        invalidateDmsNotifications(queryClient);
        invalidateEmailQueue(queryClient);
      } else {
        toast.error(result.error ?? "Bridge failed");
      }
      setBridgingId(null);
    });
  };

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (notifications.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">No notifications found.</div>
    );
  }

  const statusColors: Record<string, string> = {
    pending: "border-amber-400 text-amber-700 dark:text-amber-400",
    read: "border-slate-300 text-slate-500",
    sent: "border-blue-400 text-blue-700",
    dismissed: "border-slate-200 text-slate-400",
    failed: "border-red-400 text-red-600",
  };

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/20 border-b border-border">
            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Notification</th>
            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Document</th>
            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Channel</th>
            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Status</th>
            {showBridgeStatus && (
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Bridge</th>
            )}
            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Scheduled</th>
            <th className="px-3 py-2 w-32" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {notifications.map((n: DmsNotificationRow) => {
            const doc = n.document as Record<string, unknown> | null | undefined;
            const isUnread = n.status === "pending" && !n.read_at;
            return (
              <tr
                key={n.id}
                className={`hover:bg-muted/10 transition-colors ${isUnread ? "font-medium" : "opacity-80"}`}
              >
                <td className="px-3 py-2">
                  <div className="flex items-start gap-2">
                    {isUnread && <div className="mt-1.5 h-2 w-2 rounded-full bg-primary flex-shrink-0" />}
                    <div>
                      <p className="text-sm truncate max-w-[280px]">{n.subject}</p>
                      <p className="text-xs text-muted-foreground font-normal truncate max-w-[280px] mt-0.5">
                        {n.message.slice(0, 100)}{n.message.length > 100 ? "…" : ""}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2">
                  {doc ? (
                    <div>
                      <p className="font-mono text-xs text-muted-foreground">{doc.document_no as string}</p>
                    </div>
                  ) : "—"}
                </td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className="text-xs gap-1">
                    {n.channel === "in_app" ? (
                      <><Bell className="h-3 w-3" />In-App</>
                    ) : (
                      <><Mail className="h-3 w-3" />Email Ready</>
                    )}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className={`text-xs ${statusColors[n.status] ?? ""}`}>
                    {n.status}
                  </Badge>
                </td>
                {showBridgeStatus && (
                  <td className="px-3 py-2">
                    <DmsBridgeStatusBadge status={n.bridge_status} />
                  </td>
                )}
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {format(parseISO(n.scheduled_for), "dd MMM, HH:mm")}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1 justify-end">
                    {doc && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => window.open(`/dms/documents/record/${doc.id}`, "_blank")}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                    {showBridgeStatus && !n.global_notification_id && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        title="Bridge to global"
                        disabled={bridgingId === n.id}
                        onClick={() => handleBridge(n.id)}
                      >
                        <GitMerge className={`h-3 w-3 text-blue-500 ${bridgingId === n.id ? "animate-spin" : ""}`} />
                      </Button>
                    )}
                    {n.status === "pending" && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          title="Mark as read"
                          onClick={() => handleRead(n.id)}
                        >
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          title="Dismiss"
                          onClick={() => handleDismiss(n.id)}
                        >
                          <XCircle className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
