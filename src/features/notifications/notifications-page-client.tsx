"use client";

import { useState, useTransition, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateMyNotifications } from "@/lib/query/invalidation";
import { Bell, CheckCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MyNotificationsTable } from "./my-notifications-table";
import type { NotificationRow } from "@/server/actions/notifications/notifications";
import {
  getMyNotifications,
  getUnreadNotificationCount,
  markAllMyNotificationsRead,
} from "@/server/actions/notifications/notifications";

// ─────────────────────────────────────────────────────────────────────────────
// Severity stats strip config
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_STATS = [
  { key: "critical", label: "Critical", dot: "bg-red-500",     pill: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" },
  { key: "urgent",   label: "Urgent",   dot: "bg-orange-500",  pill: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400" },
  { key: "warning",  label: "Warning",  dot: "bg-amber-500",   pill: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" },
  { key: "info",     label: "Info",     dot: "bg-blue-500",    pill: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" },
  { key: "success",  label: "Success",  dot: "bg-emerald-500", pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Tab config
// ─────────────────────────────────────────────────────────────────────────────

type Tab = "all" | "unread" | "dismissed";

const TABS: { id: Tab; label: string }[] = [
  { id: "all",       label: "All" },
  { id: "unread",    label: "Unread" },
  { id: "dismissed", label: "Dismissed" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Page client
// ─────────────────────────────────────────────────────────────────────────────

interface NotificationsPageClientProps {
  initialNotifications: NotificationRow[];
  unreadCount: number;
  initialError?: boolean;
}

export function NotificationsPageClient({
  initialNotifications,
  unreadCount: initialUnreadCount,
  initialError = false,
}: NotificationsPageClientProps) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const queryClient = useQueryClient();
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [loading, startTransition] = useTransition();
  const [failed, setFailed] = useState(initialError);
  const latest = useRef(0);
  const marking = useRef(false);

  const refresh = useCallback(() => {
    const request = ++latest.current;
    startTransition(async () => {
      try {
        const [result, count] = await Promise.all([getMyNotifications({ limit: 200 }), getUnreadNotificationCount()]);
        if (request !== latest.current) return;
        if (!result.success || !result.data || !count.success || !count.data) { setFailed(true); return; }
        setNotifications(result.data); setUnreadCount(count.data.count); setFailed(false);
      } catch { if (request === latest.current) setFailed(true); }
    });
  }, []);

  const handleMarkAllRead = () => {
    if (marking.current || failed || loading) return;
    marking.current = true;
    startTransition(async () => {
      try {
      const result = await markAllMyNotificationsRead();
      if (result.success) {
        toast.success(`${result.data?.count ?? 0} notifications marked as read`);
        invalidateMyNotifications(queryClient);
        refresh();
      } else {
        toast.error(result.error ?? "Failed");
      }
      } catch { toast.error("The change could not be confirmed. Refresh notifications before retrying."); }
      finally { marking.current = false; }
    });
  };

  // Severity breakdown across ALL notifications (not filtered)
  const severityCounts: Record<string, number> = {};
  for (const n of notifications) {
    severityCounts[n.severity] = (severityCounts[n.severity] ?? 0) + 1;
  }

  // Tab filter
  const counts: Record<Tab, number> = {
    all: notifications.length,
    unread: notifications.filter(n => n.status === "unread").length,
    dismissed: notifications.filter((n) => n.status === "dismissed").length,
  };

  const filtered: NotificationRow[] =
    activeTab === "unread"
      ? notifications.filter((n) => n.status === "unread")
      : activeTab === "dismissed"
      ? notifications.filter((n) => n.status === "dismissed")
      : notifications;

  const hasUrgentUnread = notifications.some(
    (n) => (n.severity === "critical" || n.severity === "urgent") && n.status === "unread"
  );

  return (
    <div className="flex min-w-0 flex-col gap-6" aria-busy={loading}>

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
            hasUrgentUnread
              ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
              : unreadCount > 0
              ? "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
              : "bg-muted text-muted-foreground"
          )}>
            <Bell className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold leading-tight">Notifications</h1>
              {unreadCount > 0 && (
                <span className={cn(
                  "inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full px-1.5 text-xs font-bold tabular-nums",
                  hasUrgentUnread
                    ? "bg-red-500 text-white"
                    : "bg-blue-500 text-white"
                )}>
                  {unreadCount}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {hasUrgentUnread
                ? "You have critical or urgent items that need attention"
                : unreadCount > 0
                ? `${unreadCount} unread message${unreadCount !== 1 ? "s" : ""} waiting`
                : "You\u2019re all caught up \u2014 nothing new"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={handleMarkAllRead}
              disabled={loading || failed}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={refresh}
            disabled={loading}
            title="Refresh"
            aria-label="Refresh notifications"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>
      {failed && <p role="alert" className="rounded-sm border border-destructive p-3 text-sm">Notifications or unread counts could not be refreshed. Displayed information may be outdated. Use Refresh to retry; actions are disabled.</p>}
      <p className="text-xs text-muted-foreground">Showing up to 200 recent notifications. List counts and filters cover these loaded items; the unread total in the heading covers your account. Mark all read applies to all your unread notifications, including those not loaded here. Reading or dismissing an alert does not complete its business task.</p>

      {/* ── Severity stats strip ── */}
      {notifications.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {SEVERITY_STATS.filter((s) => (severityCounts[s.key] ?? 0) > 0).map((s) => (
            <span
              key={s.key}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                s.pill
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
              {severityCounts[s.key]} {s.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-muted text-muted-foreground">
            {notifications.length} loaded
          </span>
        </div>
      )}

      {/* ── Tab strip ── */}
      <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-0.5 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              activeTab === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {counts[tab.id] > 0 && (
              <span className={cn(
                "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
                activeTab === tab.id && tab.id === "unread"
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                  : "bg-muted text-muted-foreground"
              )}>
                {counts[tab.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Notification feed ── */}
      <MyNotificationsTable
        notifications={filtered}
        onRefresh={refresh}
        activeTab={activeTab}
        disabled={loading || failed}
      />
    </div>
  );
}
