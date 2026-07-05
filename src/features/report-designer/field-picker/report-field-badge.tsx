"use client";

import type { ReportFieldSensitivityLevel } from "@/lib/report-designer/field-registry/types";
import { cn } from "@/lib/utils";

interface ReportFieldBadgeProps {
  sensitivity: ReportFieldSensitivityLevel;
  isPlanned?: boolean;
  className?: string;
}

const SENSITIVITY_CONFIG: Record<
  ReportFieldSensitivityLevel,
  { label: string; className: string }
> = {
  public: {
    label: "Public",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  internal: {
    label: "Internal",
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  restricted: {
    label: "Restricted",
    className: "bg-amber-100 text-amber-700 border-amber-200",
  },
  confidential: {
    label: "Confidential",
    className: "bg-red-100 text-red-700 border-red-200",
  },
};

export function ReportFieldBadge({
  sensitivity,
  isPlanned,
  className,
}: ReportFieldBadgeProps) {
  if (isPlanned) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none",
          "bg-slate-100 text-slate-500 border-slate-200",
          className
        )}
      >
        Soon
      </span>
    );
  }

  const config = SENSITIVITY_CONFIG[sensitivity];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
