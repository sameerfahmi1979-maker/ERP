"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  uploaded:         { label: "Uploaded", className: "bg-slate-100 text-slate-700 border-slate-200" },
  ocr_pending:      { label: "OCR Pending", className: "bg-blue-100 text-blue-700 border-blue-200" },
  ocr_processing:   { label: "OCR Processing…", className: "bg-blue-100 text-blue-700 border-blue-200 animate-pulse" },
  ocr_complete:     { label: "OCR Complete", className: "bg-blue-100 text-blue-700 border-blue-200" },
  ai_pending:       { label: "AI Pending", className: "bg-violet-100 text-violet-700 border-violet-200" },
  ai_processing:    { label: "AI Processing…", className: "bg-violet-100 text-violet-700 border-violet-200 animate-pulse" },
  ai_complete:      { label: "AI Complete", className: "bg-violet-100 text-violet-700 border-violet-200" },
  review_pending:   { label: "Awaiting Review", className: "bg-amber-100 text-amber-700 border-amber-200" },
  review_in_progress: { label: "In Review", className: "bg-amber-100 text-amber-700 border-amber-200" },
  approved:         { label: "Approved", className: "bg-green-100 text-green-700 border-green-200" },
  discarded:        { label: "Discarded", className: "bg-slate-100 text-slate-500 border-slate-200" },
  failed:           { label: "Failed", className: "bg-red-100 text-red-700 border-red-200" },
};

interface DmsAiIntakeStatusBadgeProps {
  status: string;
  className?: string;
}

export function DmsAiIntakeStatusBadge({ status, className }: DmsAiIntakeStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: "bg-slate-100 text-slate-700 border-slate-200" };
  return (
    <Badge variant="outline" className={cn("text-xs font-medium border", config.className, className)}>
      {config.label}
    </Badge>
  );
}
