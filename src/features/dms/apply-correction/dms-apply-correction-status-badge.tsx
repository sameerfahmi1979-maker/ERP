"use client";

import { cn } from "@/lib/utils";
import type { CorrectionProposalStatus } from "@/lib/dms/apply-correction/types";

interface Props {
  status: CorrectionProposalStatus;
  className?: string;
}

const STATUS_CONFIG: Record<
  CorrectionProposalStatus,
  { label: string; className: string }
> = {
  draft:               { label: "Draft",                className: "bg-muted text-foreground border-border" },
  pending_confirmation: { label: "Pending Confirmation", className: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800" },
  applied:             { label: "Applied",              className: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800" },
  conflict:            { label: "Conflict",             className: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800" },
  cancelled:           { label: "Cancelled",            className: "bg-muted text-muted-foreground border-border" },
  failed:              { label: "Failed",               className: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800" },
};

export function DmsApplyCorrectionStatusBadge({ status, className }: Props) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
