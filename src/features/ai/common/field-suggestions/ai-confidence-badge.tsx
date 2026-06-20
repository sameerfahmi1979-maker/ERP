"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Maps confidence score (0–1) to a label level. */
function confidenceLevel(score: number | null): "high" | "medium" | "low" | "needs_review" {
  if (score === null) return "needs_review";
  if (score >= 0.85) return "high";
  if (score >= 0.65) return "medium";
  if (score >= 0.40) return "low";
  return "needs_review";
}

const LEVEL_STYLES: Record<string, string> = {
  high:         "bg-green-100 text-green-700 border-green-200",
  medium:       "bg-amber-100 text-amber-700 border-amber-200",
  low:          "bg-orange-100 text-orange-600 border-orange-200",
  needs_review: "bg-red-100 text-red-700 border-red-200",
};

const LEVEL_LABELS: Record<string, string> = {
  high:         "High",
  medium:       "Medium",
  low:          "Low",
  needs_review: "Needs Review",
};

interface AiConfidenceBadgeProps {
  score: number | null;
  className?: string;
}

export function AiConfidenceBadge({ score, className }: AiConfidenceBadgeProps) {
  const level = confidenceLevel(score);
  const pct = score !== null ? ` (${Math.round(score * 100)}%)` : "";

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-semibold px-1.5 py-0.5 border", LEVEL_STYLES[level], className)}
    >
      {LEVEL_LABELS[level]}{pct}
    </Badge>
  );
}
