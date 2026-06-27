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
  draft:               { label: "Draft",                className: "bg-slate-100 text-slate-700 border-slate-200" },
  pending_confirmation: { label: "Pending Confirmation", className: "bg-amber-100 text-amber-800 border-amber-200" },
  applied:             { label: "Applied",              className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  conflict:            { label: "Conflict",             className: "bg-red-100 text-red-800 border-red-200" },
  cancelled:           { label: "Cancelled",            className: "bg-slate-100 text-slate-500 border-slate-200" },
  failed:              { label: "Failed",               className: "bg-red-100 text-red-700 border-red-200" },
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
