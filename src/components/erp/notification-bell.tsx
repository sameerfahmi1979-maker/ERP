"use client";

import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, X, ExternalLink } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { NotificationSeverityBadge } from "@/features/notifications/notification-severity-badge";
import {
  getUnreadNotificationCount,
  getMyNotifications,
  markAllMyNotificationsRead,
  dismissNotification,
} from "@/server/actions/notifications/notifications";
import { invalidateMyNotifications } from "@/lib/query/invalidation";
import { cn } from "@/lib/utils";

// ── Query keys ──────────────────────────────────────────────────────────────

const UNREAD_COUNT_KEY = ["notifications", "unread-count"] as const;
const MY_NOTIFS_KEY = ["notifications", "my", { status: "unread", limit: 10 }] as const;

// ── Severity badge color mapping ─────────────────────────────────────────────

function getBadgeColor(severity: string): string {
  if (severity === "critical" || severity === "urgent") return "bg-red-500";
  if (severity === "warning") return "bg-amber-500";
  return "bg-blue-500";
}

// ── NotificationBell ──────────────────────────────────────────────────────────

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  // Fetch unread count — drives the badge
  const { data: countData } = useQuery({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: async () => {
      const result = await getUnreadNotificationCount();
      if (result.success && result.data) return result.data.count;
      return 0;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const unreadCount = countData ?? 0;

  // Fetch recent unread notifications for the dropdown — only when open
  const { data: notifsData, isLoading: notifsLoading } = useQuery({
    queryKey: MY_NOTIFS_KEY,
    queryFn: async () => {
      const result = await getMyNotifications({ status: "unread", limit: 10 });
      if (result.success && result.data) return result.data;
      return [];
    },
    enabled: open,
    staleTime: 10_000,
  });

  const notifications = notifsData ?? [];

  // Determine badge color from highest-severity notification
  const badgeColor =
    notifications.length > 0
      ? getBadgeColor(
          notifications.some((n) => n.severity === "critical" || n.severity === "urgent")
            ? "critical"
            : notifications.some((n) => n.severity === "warning")
            ? "warning"
            : "info"
        )
      : "bg-blue-500";

  function handleDismiss(id: number) {
    startTransition(async () => {
      const result = await dismissNotification(id);
      if (result.success) {
        invalidateMyNotifications(queryClient);
      } else {
        toast.error(result.error ?? "Failed to dismiss");
      }
    });
  }

  function handleMarkAllRead() {
    startTransition(async () => {
      const result = await markAllMyNotificationsRead();
      if (result.success) {
        toast.success(`${result.data?.count ?? 0} notifications marked as read`);
        invalidateMyNotifications(queryClient);
        setOpen(false);
      } else {
        toast.error(result.error ?? "Failed");
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="Notifications"
          aria-haspopup="true"
          aria-expanded={open}
          className={cn(
            "relative inline-flex h-9 w-9 items-center justify-center rounded-md",
            "hover:bg-accent hover:text-accent-foreground transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          <Bell className="h-4 w-4 text-muted-foreground" />
          {unreadCount > 0 && (
            <span
              className={cn(
                "absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1",
                "text-[10px] font-bold text-white leading-none",
                badgeColor
              )}
              aria-label={`${unreadCount} unread notifications`}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[380px] p-0"
        align="end"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {unreadCount} unread
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={isPending}
              className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              aria-label="Mark all notifications as read"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
        </div>

        {/* Body */}
        <div className="max-h-[400px] overflow-y-auto">
          {notifsLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <Bell className="h-8 w-8 opacity-25" />
              <p className="text-sm">No unread notifications</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className="group flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <NotificationSeverityBadge severity={n.severity} />
                      <span className="text-[10px] text-muted-foreground ml-auto whitespace-nowrap">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-foreground line-clamp-1">{n.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                    {n.actionUrl && (
                      <Link
                        href={n.actionUrl}
                        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                        onClick={() => setOpen(false)}
                      >
                        {n.actionLabel ?? "View"} <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>

                  {/* Dismiss */}
                  <button
                    onClick={() => handleDismiss(n.id)}
                    disabled={isPending}
                    aria-label={`Dismiss notification: ${n.title}`}
                    className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-muted transition-all disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-2.5 flex items-center justify-end">
          <Link
            href="/notifications"
            className="text-xs text-primary hover:underline"
            onClick={() => setOpen(false)}
          >
            View all notifications →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
