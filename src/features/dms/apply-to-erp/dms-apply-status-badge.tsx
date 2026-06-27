"use client";

import type { ApplyRunStatus, ApplyItemStatus } from "@/lib/dms/apply-to-erp/types";
import { cn } from "@/lib/utils";

// ── Run status badge ──────────────────────────────────────────────────────────

const RUN_STATUS_CONFIG: Record<ApplyRunStatus, { label: string; className: string }> = {
  pending:                { label: "Pending",             className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  confirmed:              { label: "Confirmed",           className: "bg-blue-100 text-blue-800 border-blue-200" },
  in_progress:            { label: "In Progress",         className: "bg-blue-100 text-blue-800 border-blue-200" },
  completed:              { label: "Completed",           className: "bg-green-100 text-green-800 border-green-200" },
  completed_with_warnings:{ label: "Completed w/ Issues", className: "bg-amber-100 text-amber-800 border-amber-200" },
  failed:                 { label: "Failed",              className: "bg-red-100 text-red-800 border-red-200" },
  cancelled:              { label: "Cancelled",           className: "bg-slate-100 text-slate-600 border-slate-200" },
};

const ITEM_STATUS_CONFIG: Record<ApplyItemStatus, { label: string; className: string }> = {
  proposed:  { label: "Proposed",  className: "bg-slate-100 text-slate-700 border-slate-200" },
  applied:   { label: "Applied",   className: "bg-green-100 text-green-800 border-green-200" },
  skipped:   { label: "Skipped",   className: "bg-slate-100 text-slate-600 border-slate-200" },
  conflict:  { label: "Conflict",  className: "bg-amber-100 text-amber-800 border-amber-200" },
  failed:    { label: "Failed",    className: "bg-red-100 text-red-800 border-red-200" },
  forbidden: { label: "Forbidden", className: "bg-red-100 text-red-900 border-red-300" },
};

interface RunStatusBadgeProps {
  status: ApplyRunStatus;
  className?: string;
}

export function DmsApplyRunStatusBadge({ status, className }: RunStatusBadgeProps) {
  const config = RUN_STATUS_CONFIG[status] ?? { label: status, className: "bg-slate-100 text-slate-700 border-slate-200" };
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
      config.className,
      className
    )}>
      {config.label}
    </span>
  );
}

interface ItemStatusBadgeProps {
  status: ApplyItemStatus;
  className?: string;
}

export function DmsApplyItemStatusBadge({ status, className }: ItemStatusBadgeProps) {
  const config = ITEM_STATUS_CONFIG[status] ?? { label: status, className: "bg-slate-100 text-slate-700 border-slate-200" };
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
      config.className,
      className
    )}>
      {config.label}
    </span>
  );
}
