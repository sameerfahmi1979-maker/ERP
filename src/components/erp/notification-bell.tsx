"use client";

import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, useLayoutEffect, useRef } from "react";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NotificationSeverityBadge } from "@/features/notifications/notification-severity-badge";
import { invalidateMyNotifications } from "@/lib/query/invalidation";
import { cn } from "@/lib/utils";
import {
  dismissNotification,
  markAllMyNotificationsRead,
} from "@/server/actions/notifications/notifications";

import {useNotificationUnread, useNotificationBellRows} from "@/hooks/use-notification-bell";
import {NotificationOpenButton} from '@/features/notifications/notification-open';

// ── Severity badge color mapping ─────────────────────────────────────────────

function getBadgeColor(severity: string): string {
  if (severity === "critical" || severity === "urgent") return "bg-red-500";
  if (severity === "warning") return "bg-amber-500";
  return "bg-blue-500";
}

// ── NotificationBell ──────────────────────────────────────────────────────────

export function NotificationBell({identity}: {identity?: string}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  const lifetime = useRef(false), flight = useRef(false);
  useLayoutEffect(() => {lifetime.current = true; return () => {lifetime.current = false;};}, []);
  const countRead = useNotificationUnread(identity), rowsRead = useNotificationBellRows(identity, open);
  const failed = countRead.isError || (open && rowsRead.isError) || !identity;
  const unreadCount = countRead.data ?? 0;
  const unverifiedCount=failed||countRead.isFetching||countRead.data===undefined;
  const notifsLoading = rowsRead.isFetching || rowsRead.isPending;
  const notifications = failed || notifsLoading ? [] : rowsRead.data ?? [];

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

  function perform(action: () => Promise<{success: boolean; error?: string}>, close = false) {
    if (!lifetime.current || flight.current || failed || countRead.isFetching || rowsRead.isFetching) return;
    flight.current = true;
    startTransition(async () => {
      try {
        const result = await action();
        if (!lifetime.current) return;
        if (result.success) {
          invalidateMyNotifications(queryClient);
          if (close) setOpen(false);
        } else toast.error(result.error ?? "The change could not be confirmed.");
      } catch {if (lifetime.current) toast.error("The change could not be confirmed. Refresh before retrying.");}
      finally {flight.current = false;}
    });
  }
  function handleDismiss(id: number) {
    if (notifications.some(row => row.id === id)) perform(() => dismissNotification(id));
  }
  function handleMarkAllRead() {if(identity)perform(()=>markAllMyNotificationsRead(identity), true);}

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={failed ? "Notifications unavailable" : "Notifications"}
          aria-haspopup="true"
          aria-expanded={open}
          className={cn(
            "relative inline-flex h-9 w-9 items-center justify-center rounded-md",
            "hover:bg-accent hover:text-accent-foreground transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              className={cn(
                "absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1",
                "text-[10px] font-bold text-white leading-none",
                badgeColor
              )}
              aria-label={unverifiedCount?`${unreadCount} last verified unread notifications; refresh pending`:`${unreadCount} unread notifications`}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[min(380px,calc(100vw-24px))] max-h-[calc(100dvh-80px)] overflow-y-auto p-0"
        aria-label="Notifications"
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
                {unreadCount} {unverifiedCount?'last verified unread':'unread'}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={isPending||unverifiedCount}
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
          {failed ? <div role="alert" className="p-4 text-sm">Notifications could not be verified. {identity && <button className="underline" onClick={() => {void countRead.refetch(); void rowsRead.refetch();}}>Retry notifications</button>}</div> : notifsLoading ? (
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
                      <NotificationOpenButton id={n.id} label={n.actionLabel??'Open record'} onNavigate={()=>setOpen(false)} disabled={isPending}/>
                    )}
                  </div>

                  {/* Dismiss */}
                  <button
                    onClick={() => handleDismiss(n.id)}
                    disabled={isPending}
                    aria-label={`Dismiss notification: ${n.title}`}
                    className="mt-0.5 shrink-0 h-11 w-11 sm:h-8 sm:w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
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
