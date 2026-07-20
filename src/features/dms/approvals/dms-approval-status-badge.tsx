"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ApprovalStatus = "pending_approval" | "approved" | "rejected" | "withdrawn" | null | undefined;

const STATUS_CONFIG: Record<string, { label: string; style: string }> = {
  pending_approval: {
    label: "Pending Approval",
    style: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300",
  },
  approved: {
    label: "Approved",
    style: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300",
  },
  rejected: {
    label: "Rejected",
    style: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300",
  },
  withdrawn: {
    label: "Withdrawn",
    style: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400",
  },
};

const NOT_SUBMITTED_STYLE =
  "bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800/40 dark:text-slate-400";

interface DmsApprovalStatusBadgeProps {
  status: ApprovalStatus;
  className?: string;
}

export function DmsApprovalStatusBadge({ status, className }: DmsApprovalStatusBadgeProps) {
  if (!status) {
    return (
      <Badge
        variant="outline"
        className={cn("text-[10px] font-semibold px-1.5 py-0.5 border", NOT_SUBMITTED_STYLE, className)}
      >
        Not Submitted
      </Badge>
    );
  }

  const config = STATUS_CONFIG[status] ?? { label: status, style: NOT_SUBMITTED_STYLE };

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-semibold px-1.5 py-0.5 border", config.style, className)}
    >
      {config.label}
    </Badge>
  );
}
