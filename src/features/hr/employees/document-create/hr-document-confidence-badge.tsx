"use client";

import { cn } from "@/lib/utils";

type Props = {
  confidence: number;
  className?: string;
};

export function HrDocumentConfidenceBadge({ confidence, className }: Props) {
  const pct = Math.round(confidence * 100);

  const color =
    pct >= 80
      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
      : pct >= 55
        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
        : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        color,
        className
      )}
    >
      {pct}%
    </span>
  );
}
