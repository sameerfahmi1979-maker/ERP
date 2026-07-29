"use client";

import { useState, useTransition, useCallback } from "react";
import { toast } from "sonner";
import { Bell, CheckCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MyNotificationsTable } from "./my-notifications-table";
import type { NotificationRow } from "@/server/actions/notifications/notifications";
import {
  getMyNotifications,
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
}

export function NotificationsPageClient({
  initialNotifications,
  unreadCount: initialUnreadCount,
}: NotificationsPageClientProps) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [loading, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => {
      const result = await getMyNotifications({ limit: 200 });
      if (result.success && result.data) {
        setNotifications(result.data);
        setUnreadCount(result.data.filter((n) => n.status === "unread").length);
      }
    });
  }, []);

  const handleMarkAllRead = () => {
    startTransition(async () => {
      const result = await markAllMyNotificationsRead();
      if (result.success) {
        toast.success(`${result.data?.count ?? 0} notifications marked as read`);
        refresh();
      } else {
        toast.error(result.error ?? "Failed");
      }
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
    unread: unreadCount,
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
    <div className="flex flex-col gap-6 max-w-2xl">

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
              disabled={loading}
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
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

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
            {notifications.length} total
          </span>
        </div>
      )}

      {/* ── Tab strip ── */}
      <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-0.5 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.id}
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
      />
    </div>
  );
}
