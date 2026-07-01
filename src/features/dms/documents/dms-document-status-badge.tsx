"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DmsDocumentStatus } from "./dms-document-constants";

const STATUS_STYLES: Record<DmsDocumentStatus, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300",
  pending_review: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300",
  approved: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300",
  active: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300",
  expired: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300",
  archived: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400",
  superseded: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300",
  deleted: "bg-red-50 text-red-400 border-red-100 dark:bg-red-900/20 dark:text-red-400",
};

const STATUS_LABELS: Record<DmsDocumentStatus, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
  active: "Active",
  expired: "Expired",
  archived: "Archived",
  superseded: "Renewed",
  deleted: "Deleted",
};

interface DmsDocumentStatusBadgeProps {
  status: string;
  className?: string;
}

// DMS 13 — AI-draft documents (pending_ai_review) are NOT part of the canonical
// lifecycle type, but must be clearly distinguishable from active documents.
const AI_DRAFT_STYLE = "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300";

export function DmsDocumentStatusBadge({ status, className }: DmsDocumentStatusBadgeProps) {
  if (status === "pending_ai_review") {
    return (
      <Badge
        variant="outline"
        className={cn("text-[10px] font-semibold px-1.5 py-0.5 border", AI_DRAFT_STYLE, className)}
      >
        AI Draft
      </Badge>
    );
  }

  const s = status as DmsDocumentStatus;
  const style = STATUS_STYLES[s] ?? "bg-slate-100 text-slate-700 border-slate-200";
  const label = STATUS_LABELS[s] ?? status;

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-semibold px-1.5 py-0.5 border", style, className)}
    >
      {label}
    </Badge>
  );
}
