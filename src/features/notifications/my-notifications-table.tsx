"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Bell, Check, X, Archive, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationSeverityBadge } from "./notification-severity-badge";
import { NotificationStatusBadge } from "./notification-status-badge";
import type { NotificationRow } from "@/server/actions/notifications/notifications";
import {
  markNotificationRead,
  dismissNotification,
  archiveNotification,
} from "@/server/actions/notifications/notifications";

interface MyNotificationsTableProps {
  notifications: NotificationRow[];
  onRefresh: () => void;
}

export function MyNotificationsTable({ notifications, onRefresh }: MyNotificationsTableProps) {
  const [pending, startTransition] = useTransition();
  const [actingId, setActingId] = useState<number | null>(null);

  const handleAction = (id: number, fn: () => Promise<{ success: boolean; error?: string }>, label: string) => {
    setActingId(id);
    startTransition(async () => {
      const result = await fn();
      if (result.success) {
        toast.success(label);
        onRefresh();
      } else {
        toast.error(result.error ?? "Action failed");
      }
      setActingId(null);
    });
  };

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
        <Bell className="h-10 w-10 opacity-30" />
        <p className="text-sm">No notifications</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border rounded-lg border bg-card">
      {notifications.map((n) => (
        <div key={n.id} className={`flex items-start gap-4 p-4 hover:bg-muted/30 transition-colors ${n.status === "unread" ? "bg-blue-50/40" : ""}`}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <NotificationSeverityBadge severity={n.severity} />
              <NotificationStatusBadge status={n.status} />
              <span className="text-xs text-muted-foreground">{n.sourceModule}</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {new Date(n.createdAt).toLocaleString()}
              </span>
            </div>
            <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
            {n.actionUrl && (
              <a
                href={n.actionUrl}
                className="inline-flex items-center gap-1 text-xs text-primary mt-1 hover:underline"
              >
                {n.actionLabel ?? "View"} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            {n.status === "unread" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={pending && actingId === n.id}
                title="Mark as read"
                onClick={() => handleAction(n.id, () => markNotificationRead(n.id), "Marked as read")}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
            )}
            {n.status !== "dismissed" && n.status !== "archived" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                disabled={pending && actingId === n.id}
                title="Dismiss"
                onClick={() => handleAction(n.id, () => dismissNotification(n.id), "Dismissed")}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              disabled={pending && actingId === n.id}
              title="Archive"
              onClick={() => handleAction(n.id, () => archiveNotification(n.id), "Archived")}
            >
              <Archive className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
