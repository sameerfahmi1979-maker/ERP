"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  pending:    "Pending",
  accepted:   "Accepted",
  rejected:   "Rejected",
  superseded: "Superseded",
  applied:    "Applied",
  failed:     "Failed",
};

const STATUS_STYLES: Record<string, string> = {
  pending:    "bg-yellow-50 text-yellow-700 border-yellow-300",
  accepted:   "bg-blue-50 text-blue-700 border-blue-300",
  rejected:   "bg-slate-50 text-slate-500 border-slate-200",
  superseded: "bg-slate-50 text-slate-400 border-slate-200 line-through",
  applied:    "bg-green-50 text-green-700 border-green-300",
  failed:     "bg-red-50 text-red-600 border-red-300",
};

interface AiSuggestionStatusBadgeProps {
  status: string;
  className?: string;
}

export function AiSuggestionStatusBadge({ status, className }: AiSuggestionStatusBadgeProps) {
  const label = STATUS_LABELS[status] ?? status;
  const style = STATUS_STYLES[status] ?? "bg-slate-50 text-slate-500 border-slate-200";

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-medium px-1.5 py-0.5 border", style, className)}
    >
      {label}
    </Badge>
  );
}
