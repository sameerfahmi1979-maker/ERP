"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DmsConfidentialityLevel } from "./dms-document-constants";

const CONF_STYLES: Record<DmsConfidentialityLevel, string> = {
  internal: "bg-slate-100 text-slate-600 border-slate-200",
  company: "bg-blue-50 text-blue-600 border-blue-200",
  hr: "bg-violet-50 text-violet-600 border-violet-200",
  finance: "bg-green-50 text-green-700 border-green-200",
  legal: "bg-amber-50 text-amber-700 border-amber-200",
  executive: "bg-red-50 text-red-700 border-red-200",
};

const CONF_LABELS: Record<DmsConfidentialityLevel, string> = {
  internal: "Internal",
  company: "Company",
  hr: "HR",
  finance: "Finance",
  legal: "Legal",
  executive: "Executive",
};

interface DmsConfidentialityBadgeProps {
  level: string;
  className?: string;
}

export function DmsConfidentialityBadge({ level, className }: DmsConfidentialityBadgeProps) {
  const l = level as DmsConfidentialityLevel;
  const style = CONF_STYLES[l] ?? "bg-slate-100 text-slate-600 border-slate-200";
  const label = CONF_LABELS[l] ?? level;

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-medium px-1.5 py-0.5 border", style, className)}
    >
      {label}
    </Badge>
  );
}
