"use client";

import { Badge } from "@/components/ui/badge";
import type { RiskLevel } from "@/server/actions/dms/ai-risk";

interface DmsRiskBadgeProps {
  level: RiskLevel | string | null | undefined;
  className?: string;
}

export function DmsRiskBadge({ level, className }: DmsRiskBadgeProps) {
  if (!level) return null;

  const config: Record<string, { label: string; className: string }> = {
    none: { label: "No Risk", className: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800" },
    low: { label: "Low Risk", className: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800" },
    medium: { label: "Medium Risk", className: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800" },
    high: { label: "High Risk", className: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800" },
    critical: { label: "Critical Risk", className: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800" },
  };

  const c = config[level] ?? { label: level, className: "" };
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-medium border ${c.className} ${className ?? ""}`}>
      {c.label}
    </Badge>
  );
}
