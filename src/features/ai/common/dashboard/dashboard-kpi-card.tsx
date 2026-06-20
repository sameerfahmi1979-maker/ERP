"use client";

import type { DashboardKpiCard } from "@/lib/ai/common/dashboard/types";
import { cn } from "@/lib/utils";

interface Props {
  card: DashboardKpiCard;
}

export function DashboardKpiCardComponent({ card }: Props) {
  const severityClass = {
    critical: "border-red-500 bg-red-50 dark:bg-red-950/20",
    warning: "border-amber-500 bg-amber-50 dark:bg-amber-950/20",
    info: "border-blue-500 bg-blue-50 dark:bg-blue-950/20",
    normal: "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900",
  }[card.severity ?? "normal"];

  const valueClass = {
    critical: "text-red-600 dark:text-red-400",
    warning: "text-amber-600 dark:text-amber-400",
    info: "text-blue-600 dark:text-blue-400",
    normal: "text-slate-900 dark:text-slate-100",
  }[card.severity ?? "normal"];

  return (
    <div className={cn("rounded-lg border p-4 flex flex-col gap-1", severityClass)}>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
        {card.label}
      </p>
      <p className={cn("text-2xl font-bold tabular-nums", valueClass)}>
        {card.value}
      </p>
      {card.description && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{card.description}</p>
      )}
    </div>
  );
}
