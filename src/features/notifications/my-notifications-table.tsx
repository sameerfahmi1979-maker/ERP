"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Bell, Check, X, Archive, ArrowRight,
  FileText, Users, Landmark, ShieldCheck, Clock, Settings, LayoutDashboard,
  AlertCircle, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { NotificationRow as NotificationRowData } from "@/server/actions/notifications/notifications";
import {
  markNotificationRead,
  dismissNotification,
  archiveNotification,
} from "@/server/actions/notifications/notifications";

// ─────────────────────────────────────────────────────────────────────────────
// Severity config
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY: Record<string, {
  accent: string;
  cardBg: string;
  avatarBg: string;
  avatarText: string;
  dot: string;
  icon: React.ReactNode;
}> = {
  critical: {
    accent: "bg-red-500",
    cardBg: "bg-red-50/70 border-red-100 dark:bg-red-950/25 dark:border-red-900/40",
    avatarBg: "bg-red-100 dark:bg-red-900/40",
    avatarText: "text-red-600 dark:text-red-400",
    dot: "bg-red-500",
    icon: <AlertCircle className="h-3.5 w-3.5" />,
  },
  urgent: {
    accent: "bg-orange-500",
    cardBg: "bg-orange-50/70 border-orange-100 dark:bg-orange-950/25 dark:border-orange-900/40",
    avatarBg: "bg-orange-100 dark:bg-orange-900/40",
    avatarText: "text-orange-600 dark:text-orange-400",
    dot: "bg-orange-500",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  },
  warning: {
    accent: "bg-amber-500",
    cardBg: "bg-amber-50/50 border-amber-100 dark:bg-amber-950/20 dark:border-amber-900/30",
    avatarBg: "bg-amber-100 dark:bg-amber-900/40",
    avatarText: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  },
  info: {
    accent: "bg-blue-500",
    cardBg: "",
    avatarBg: "bg-blue-100 dark:bg-blue-900/40",
    avatarText: "text-blue-600 dark:text-blue-400",
    dot: "bg-blue-500",
    icon: null,
  },
  success: {
    accent: "bg-emerald-500",
    cardBg: "",
    avatarBg: "bg-emerald-100 dark:bg-emerald-900/40",
    avatarText: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
    icon: null,
  },
};

const DEFAULT_SEVERITY = SEVERITY.info;

function sev(severity: string) {
  return SEVERITY[severity] ?? DEFAULT_SEVERITY;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module avatar
// ─────────────────────────────────────────────────────────────────────────────

const MODULE_META: Record<string, { icon: React.ReactNode; color: string; text: string }> = {
  DMS:        { icon: <FileText className="h-3.5 w-3.5" />,    color: "bg-blue-100 dark:bg-blue-900/40",    text: "text-blue-600 dark:text-blue-400" },
  HR:         { icon: <Users className="h-3.5 w-3.5" />,       color: "bg-violet-100 dark:bg-violet-900/40", text: "text-violet-600 dark:text-violet-400" },
  PAYROLL:    { icon: <Landmark className="h-3.5 w-3.5" />,    color: "bg-emerald-100 dark:bg-emerald-900/40",text: "text-emerald-600 dark:text-emerald-400" },
  COMPLIANCE: { icon: <ShieldCheck className="h-3.5 w-3.5" />, color: "bg-amber-100 dark:bg-amber-900/40",  text: "text-amber-600 dark:text-amber-400" },
  TIME:       { icon: <Clock className="h-3.5 w-3.5" />,       color: "bg-purple-100 dark:bg-purple-900/40",text: "text-purple-600 dark:text-purple-400" },
  SYSTEM:     { icon: <Settings className="h-3.5 w-3.5" />,    color: "bg-slate-100 dark:bg-slate-800",     text: "text-slate-600 dark:text-slate-400" },
};

function ModuleAvatar({ sourceModule }: { sourceModule: string }) {
  const key = sourceModule?.toUpperCase();
  const meta = MODULE_META[key] ?? { icon: <LayoutDashboard className="h-3.5 w-3.5" />, color: "bg-muted", text: "text-muted-foreground" };
  return (
    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", meta.color, meta.text)}>
      {meta.icon}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Relative time
// ─────────────────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Date grouping
// ─────────────────────────────────────────────────────────────────────────────

function groupLabel(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff < 1) return "Today";
  if (diff < 2) return "Yesterday";
  if (diff < 7) return "This Week";
  if (diff < 30) return "This Month";
  return "Earlier";
}

const GROUP_ORDER = ["Today", "Yesterday", "This Week", "This Month", "Earlier"];

// ─────────────────────────────────────────────────────────────────────────────
// Single notification card
// ─────────────────────────────────────────────────────────────────────────────

function NotificationCard({
  n,
  onAction,
  actingId,
  isPending,
  spotlight = false,
}: {
  n: NotificationRowData;
  onAction: (id: number, fn: () => Promise<{ success: boolean; error?: string }>, label: string) => void;
  actingId: number | null;
  isPending: boolean;
  spotlight?: boolean;
}) {
  const isUnread = n.status === "unread";
  const s = sev(n.severity);
  const isBusy = isPending && actingId === n.id;
  const ts = n.createdAt ?? n.scheduledFor;

  return (
    <div
      className={cn(
        "group relative flex gap-0 overflow-hidden rounded-xl border transition-all duration-150",
        "hover:shadow-md",
        spotlight
          ? s.cardBg || "bg-card border-border/60"
          : isUnread
          ? "bg-card shadow-sm border-border/60"
          : "bg-card/60 border-border/40 shadow-none"
      )}
    >
      {/* Left severity accent */}
      <span className={cn("w-1 shrink-0 self-stretch", s.accent)} />

      <div className="flex flex-1 gap-3 p-3.5 min-w-0">
        {/* Module avatar */}
        <div className="pt-0.5">
          <ModuleAvatar sourceModule={n.sourceModule} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Top row: title + time */}
          <div className="flex items-start justify-between gap-2">
            <p className={cn(
              "text-sm leading-snug",
              isUnread ? "font-semibold text-foreground" : "font-medium text-foreground/80"
            )}>
              {/* Unread dot inline */}
              {isUnread && (
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500 mr-1.5 mb-0.5 align-middle" />
              )}
              {n.title}
            </p>
            <span className="text-[11px] text-muted-foreground/70 tabular-nums whitespace-nowrap shrink-0 pt-0.5">
              {relativeTime(ts)}
            </span>
          </div>

          {/* Message */}
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
            {n.message}
          </p>

          {/* Footer: module + type tag + action link */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wide">
              {n.sourceModule}
            </span>
            <span className="text-muted-foreground/40 text-[10px]">·</span>
            <span className="text-[10px] text-muted-foreground/60 capitalize">
              {n.notificationType.replace(/_/g, " ")}
            </span>
            {n.actionUrl && (
              <>
                <span className="text-muted-foreground/40 text-[10px]">·</span>
                <a
                  href={n.actionUrl}
                  className="inline-flex items-center gap-0.5 text-[11px] text-primary font-medium hover:underline"
                >
                  {n.actionLabel ?? "View"} <ArrowRight className="h-3 w-3" />
                </a>
              </>
            )}
          </div>
        </div>

        {/* Action buttons — always visible for primary action on unread, hover-only otherwise */}
        <div className={cn(
          "flex flex-col items-center gap-0.5 shrink-0 self-start pt-0.5 transition-opacity duration-150",
          isUnread ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
          isBusy && "opacity-100"
        )}>
          {isUnread && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              disabled={isBusy}
              title="Mark as read"
              onClick={() => onAction(n.id, () => markNotificationRead(n.id), "Marked as read")}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
          )}
          {n.status !== "dismissed" && n.status !== "archived" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              disabled={isBusy}
              title="Dismiss"
              onClick={() => onAction(n.id, () => dismissNotification(n.id), "Dismissed")}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            disabled={isBusy}
            title="Archive"
            onClick={() => onAction(n.id, () => archiveNotification(n.id), "Archived")}
          >
            <Archive className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Critical spotlight zone
// ─────────────────────────────────────────────────────────────────────────────

function SpotlightZone({
  items,
  onAction,
  actingId,
  isPending,
}: {
  items: NotificationRowData[];
  onAction: (id: number, fn: () => Promise<{ success: boolean; error?: string }>, label: string) => void;
  actingId: number | null;
  isPending: boolean;
}) {
  if (items.length === 0) return null;
  const hasCritical = items.some((n) => n.severity === "critical");

  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-2",
      hasCritical
        ? "bg-red-50/60 border-red-200 dark:bg-red-950/20 dark:border-red-900/40"
        : "bg-orange-50/60 border-orange-200 dark:bg-orange-950/20 dark:border-orange-900/40"
    )}>
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className={cn("h-4 w-4", hasCritical ? "text-red-500" : "text-orange-500")} />
        <span className={cn(
          "text-xs font-semibold uppercase tracking-wide",
          hasCritical ? "text-red-600 dark:text-red-400" : "text-orange-600 dark:text-orange-400"
        )}>
          {hasCritical ? "Critical Alerts" : "Urgent Alerts"} · {items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((n) => (
          <NotificationCard
            key={n.id}
            n={n}
            onAction={onAction}
            actingId={actingId}
            isPending={isPending}
            spotlight
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: string }) {
  const copy =
    tab === "unread"
      ? { headline: "No unread notifications", sub: "You've read everything — check back later." }
      : tab === "dismissed"
      ? { headline: "Nothing dismissed", sub: "Items you dismiss will appear here." }
      : { headline: "No notifications yet", sub: "Alerts from HR, DMS, Payroll, and more will show up here." };

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/60">
        <Bell className="h-7 w-7 text-muted-foreground/50" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{copy.headline}</p>
        <p className="text-xs text-muted-foreground max-w-xs">{copy.sub}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

interface MyNotificationsTableProps {
  notifications: NotificationRowData[];
  onRefresh: () => void;
  activeTab: string;
}

export function MyNotificationsTable({ notifications, onRefresh, activeTab }: MyNotificationsTableProps) {
  const [isPending, startTransition] = useTransition();
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
    return <EmptyState tab={activeTab} />;
  }

  // Pull critical/urgent unread items out as spotlight
  const spotlightItems =
    activeTab === "all"
      ? notifications.filter(
          (n) => (n.severity === "critical" || n.severity === "urgent") && n.status === "unread"
        )
      : [];
  const spotlightIds = new Set(spotlightItems.map((n) => n.id));
  const remaining = notifications.filter((n) => !spotlightIds.has(n.id));

  // Group remaining by date
  const groups: Record<string, NotificationRowData[]> = {};
  for (const n of remaining) {
    const label = groupLabel(n.createdAt ?? n.scheduledFor);
    if (!groups[label]) groups[label] = [];
    groups[label].push(n);
  }
  const orderedGroups = GROUP_ORDER.filter((g) => groups[g]);

  return (
    <div className="space-y-4">
      {/* Spotlight zone for critical/urgent */}
      <SpotlightZone
        items={spotlightItems}
        onAction={handleAction}
        actingId={actingId}
        isPending={isPending}
      />

      {/* Main feed */}
      {orderedGroups.map((groupName) => (
        <div key={groupName} className="space-y-2">
          <div className="flex items-center gap-2 px-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {groupName}
            </span>
            <span className="flex-1 border-t border-border/40" />
            <span className="text-[10px] text-muted-foreground/50">{groups[groupName].length}</span>
          </div>
          <div className="space-y-1.5">
            {groups[groupName].map((n) => (
              <NotificationCard
                key={n.id}
                n={n}
                onAction={handleAction}
                actingId={actingId}
                isPending={isPending}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
