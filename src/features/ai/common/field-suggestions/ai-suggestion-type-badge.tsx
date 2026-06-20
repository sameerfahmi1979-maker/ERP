"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = {
  fill_missing:     "Fill Missing",
  correct_value:    "Correct Value",
  update_existing:  "Update",
  clear_wrong_value:"Clear Wrong",
  conflict_detected:"Conflict",
  needs_human_review:"Needs Review",
};

const TYPE_STYLES: Record<string, string> = {
  fill_missing:      "bg-blue-50 text-blue-700 border-blue-200",
  correct_value:     "bg-amber-50 text-amber-700 border-amber-200",
  update_existing:   "bg-sky-50 text-sky-700 border-sky-200",
  clear_wrong_value: "bg-orange-50 text-orange-700 border-orange-200",
  conflict_detected: "bg-red-50 text-red-700 border-red-200",
  needs_human_review:"bg-slate-50 text-slate-600 border-slate-200",
};

interface AiSuggestionTypeBadgeProps {
  type: string;
  className?: string;
}

export function AiSuggestionTypeBadge({ type, className }: AiSuggestionTypeBadgeProps) {
  const label = TYPE_LABELS[type] ?? type;
  const style = TYPE_STYLES[type] ?? TYPE_STYLES.needs_human_review;

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-medium px-1.5 py-0.5 border", style, className)}
    >
      {label}
    </Badge>
  );
}
