"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface DmsOcrStatusBadgeProps {
  status: string | null | undefined;
  className?: string;
}

const STATUS_STYLES: Record<string, string> = {
  not_started:              "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300",
  not_required:             "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400",
  pending:                  "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300",
  processing:               "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300",
  complete:                 "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300",
  failed:                   "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300",
  skipped:                  "bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400",
  not_supported:            "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400",
  provider_not_configured:  "bg-orange-100 text-orange-600 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300",
};

const STATUS_LABELS: Record<string, string> = {
  not_started:              "Not Started",
  not_required:             "Not Required",
  pending:                  "Pending",
  processing:               "Processing…",
  complete:                 "Complete",
  failed:                   "Failed",
  skipped:                  "Skipped",
  not_supported:            "Not Supported",
  provider_not_configured:  "No Provider",
};

export function DmsOcrStatusBadge({ status, className }: DmsOcrStatusBadgeProps) {
  const key = status ?? "not_started";
  const style = STATUS_STYLES[key] ?? STATUS_STYLES.not_started;
  const label = STATUS_LABELS[key] ?? key;

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-semibold px-1.5 py-0.5 border", style, className)}
    >
      {label}
    </Badge>
  );
}
