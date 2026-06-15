"use client";

import { useState, useTransition, useCallback } from "react";
import { Bell, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MyNotificationsTable } from "@/features/notifications/my-notifications-table";
import type { NotificationRow } from "@/server/actions/notifications/notifications";
import { getAllNotifications } from "@/server/actions/notifications/notifications";
import { NotificationSeverityBadge } from "@/features/notifications/notification-severity-badge";
import { NotificationStatusBadge } from "@/features/notifications/notification-status-badge";

interface AdminNotificationsPageClientProps {
  initialNotifications: NotificationRow[];
}

export function AdminNotificationsPageClient({ initialNotifications }: AdminNotificationsPageClientProps) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [loading, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => {
      const result = await getAllNotifications({ limit: 300 });
      if (result.success && result.data) setNotifications(result.data);
    });
  }, []);

  const unread = notifications.filter((n) => n.status === "unread").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Notification Center</h1>
            <p className="text-sm text-muted-foreground">
              All ERP notifications — {notifications.length} total, {unread} unread
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={refresh} disabled={loading} title="Refresh">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total", value: notifications.length, cls: "text-foreground" },
          { label: "Unread", value: unread, cls: "text-blue-600 font-semibold" },
          { label: "Dismissed", value: notifications.filter((n) => n.status === "dismissed").length, cls: "text-muted-foreground" },
          { label: "Archived", value: notifications.filter((n) => n.status === "archived").length, cls: "text-muted-foreground" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.cls}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">ID</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Severity</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Module</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Title</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Recipient</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Channels</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {notifications.map((n) => (
              <tr key={n.id} className="hover:bg-muted/20">
                <td className="px-3 py-2 text-xs text-muted-foreground">{n.id}</td>
                <td className="px-3 py-2"><NotificationStatusBadge status={n.status} /></td>
                <td className="px-3 py-2"><NotificationSeverityBadge severity={n.severity} /></td>
                <td className="px-3 py-2 text-xs font-medium">{n.sourceModule}</td>
                <td className="px-3 py-2 text-xs max-w-[240px] truncate">{n.title}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {n.recipientEmail ?? (n.recipientUserId ? `user:${n.recipientUserId}` : n.recipientRoleCode ?? "—")}
                </td>
                <td className="px-3 py-2 text-xs">
                  {[n.channelInApp && "In-App", n.channelEmail && "Email"].filter(Boolean).join(", ")}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(n.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {notifications.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No notifications found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
