"use client";

import type { DailyDashboardScope } from "@/lib/ai/common/dashboard/types";
import { cn } from "@/lib/utils";

const SCOPES: { value: DailyDashboardScope; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "last_30_days", label: "Last 30 Days" },
];

interface Props {
  scope: DailyDashboardScope;
  onChange: (scope: DailyDashboardScope) => void;
  disabled?: boolean;
}

export function DashboardScopeSelector({ scope, onChange, disabled }: Props) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-1 gap-1">
      {SCOPES.map((s) => (
        <button
          key={s.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(s.value)}
          className={cn(
            "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
            scope === s.value
              ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm border border-slate-200 dark:border-slate-700"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
