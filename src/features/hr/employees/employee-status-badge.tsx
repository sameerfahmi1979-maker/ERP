"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300",
  probation: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300",
  on_leave: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300",
  inactive: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400",
  suspended: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300",
  terminated: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300",
  archived: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  probation: "Probation",
  on_leave: "On Leave",
  inactive: "Inactive",
  suspended: "Suspended",
  terminated: "Terminated",
  archived: "Archived",
};

interface EmployeeStatusBadgeProps {
  status: string;
  className?: string;
}

export function EmployeeStatusBadge({ status, className }: EmployeeStatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700 border-slate-200";
  const label = STATUS_LABELS[status] ?? status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-semibold px-1.5 py-0.5 border", style, className)}
    >
      {label}
    </Badge>
  );
}

export const EMPLOYEE_STATUS_FILTER_VALUES = [
  "active",
  "probation",
  "on_leave",
  "inactive",
  "suspended",
  "terminated",
  "archived",
] as const;
