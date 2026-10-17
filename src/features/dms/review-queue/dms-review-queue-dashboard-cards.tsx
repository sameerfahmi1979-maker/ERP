"use client";

import type { ReviewQueueCounts } from "@/server/actions/dms/review-queue";
import { ClipboardList, AlertTriangle, Clock, CheckCircle2, UserCheck, Eye } from "lucide-react";

interface Props {
  counts: ReviewQueueCounts | null;
}

interface CardProps {
  label:   string;
  value:   number;
  icon:    React.ReactNode;
  variant: "default" | "warning" | "danger" | "success" | "info";
}

function DashboardCard({ label, value, icon, variant }: CardProps) {
  const variantClasses: Record<CardProps["variant"], string> = {
    default: "bg-card border-border text-foreground",
    warning: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200",
    danger:  "bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200",
    success: "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-200",
    info:    "bg-sky-50 border-sky-200 text-sky-800 dark:bg-sky-950 dark:border-sky-800 dark:text-sky-200",
  };

  return (
    <div className={`flex items-center gap-3 rounded-lg border p-4 ${variantClasses[variant]}`}>
      <div className="shrink-0 opacity-70">{icon}</div>
      <div>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        <div className="text-xs font-medium opacity-80">{label}</div>
      </div>
    </div>
  );
}

export function DmsReviewQueueDashboardCards({ counts }: Props) {
  if (!counts) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <DashboardCard
        label="Open"
        value={counts.open}
        icon={<ClipboardList className="h-5 w-5" />}
        variant="default"
      />
      <DashboardCard
        label="Assigned to Me"
        value={counts.assignedToMe}
        icon={<UserCheck className="h-5 w-5" />}
        variant="info"
      />
      <DashboardCard
        label="Urgent / High"
        value={counts.urgentHigh}
        icon={<AlertTriangle className="h-5 w-5" />}
        variant={counts.urgentHigh > 0 ? "warning" : "default"}
      />
      <DashboardCard
        label="Overdue"
        value={counts.overdue}
        icon={<Clock className="h-5 w-5" />}
        variant={counts.overdue > 0 ? "danger" : "default"}
      />
      <DashboardCard
        label="Resolved Today"
        value={counts.resolvedToday}
        icon={<CheckCircle2 className="h-5 w-5" />}
        variant="success"
      />
      <DashboardCard
        label="Total Active"
        value={counts.total}
        icon={<Eye className="h-5 w-5" />}
        variant="default"
      />
    </div>
  );
}
