"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface DmsAiConfidenceBadgeProps {
  label: string | null | undefined;
  score?: number | null;
  className?: string;
}

const LABEL_STYLES: Record<string, string> = {
  high:                "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300",
  medium:              "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300",
  low:                 "bg-orange-100 text-orange-600 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300",
  needs_manual_review: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300",
};

const LABEL_TEXT: Record<string, string> = {
  high:                "High",
  medium:              "Medium",
  low:                 "Low",
  needs_manual_review: "Manual Review",
};

export function DmsAiConfidenceBadge({ label, score, className }: DmsAiConfidenceBadgeProps) {
  const key = (label ?? "needs_manual_review").toLowerCase();
  const style = LABEL_STYLES[key] ?? LABEL_STYLES.needs_manual_review;
  const text = LABEL_TEXT[key] ?? key;
  const pct = score != null ? ` (${Math.round(score * 100)}%)` : "";

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-semibold px-1.5 py-0.5 border", style, className)}
    >
      {text}{pct}
    </Badge>
  );
}
