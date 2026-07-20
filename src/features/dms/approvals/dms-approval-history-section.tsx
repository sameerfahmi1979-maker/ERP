"use client";

import { format, parseISO } from "date-fns";
import {
  CheckCircle2, XCircle, Send, Undo2, Clock, GitCommitVertical, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApprovalHistoryRow } from "@/server/actions/dms/document-approvals";

interface DmsApprovalHistorySectionProps {
  rows: ApprovalHistoryRow[];
  className?: string;
}

const ACTION_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  submitted: {
    icon: <Send className="h-3.5 w-3.5" />,
    label: "Submitted for Approval",
    color: "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400",
  },
  approved: {
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    label: "Approved",
    color: "text-green-600 bg-green-50 border-green-200 dark:bg-green-900/20 dark:text-green-400",
  },
  rejected: {
    icon: <XCircle className="h-3.5 w-3.5" />,
    label: "Rejected",
    color: "text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20 dark:text-red-400",
  },
  withdrawn: {
    icon: <Undo2 className="h-3.5 w-3.5" />,
    label: "Withdrawn",
    color: "text-slate-600 bg-slate-50 border-slate-200 dark:bg-slate-800/40 dark:text-slate-400",
  },
  returned: {
    icon: <GitCommitVertical className="h-3.5 w-3.5" />,
    label: "Returned",
    color: "text-orange-600 bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400",
  },
  escalated: {
    icon: <AlertCircle className="h-3.5 w-3.5" />,
    label: "Escalated",
    color: "text-purple-600 bg-purple-50 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400",
  },
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return format(parseISO(dateStr), "dd MMM yyyy HH:mm");
  } catch {
    return dateStr;
  }
}

export function DmsApprovalHistorySection({ rows, className }: DmsApprovalHistorySectionProps) {
  if (rows.length === 0) {
    return (
      <div className={cn("flex flex-col items-center gap-2 py-6 text-muted-foreground", className)}>
        <Clock className="h-5 w-5 opacity-40" />
        <p className="text-xs">No approval history yet.</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {rows.map((row, idx) => {
        const meta = ACTION_META[row.action] ?? {
          icon: <Clock className="h-3.5 w-3.5" />,
          label: row.action,
          color: "text-slate-600 bg-slate-50 border-slate-200",
        };

        const actorName = row.actionedByName ?? row.submittedByName ?? `User #${row.actionedBy ?? row.submittedBy}`;
        const dateStr = formatDate(row.actionedAt);

        return (
          <div
            key={row.id}
            className={cn(
              "flex gap-3 rounded-md border p-3 text-xs",
              meta.color,
              idx === 0 && row.isCurrent && "ring-1 ring-offset-0 ring-current/30",
            )}
          >
            <div className="mt-0.5 shrink-0">{meta.icon}</div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-semibold">{meta.label}</span>
                <span className="text-[10px] opacity-70 shrink-0">{dateStr}</span>
              </div>
              <p className="opacity-80">
                By <span className="font-medium">{actorName}</span>
                {row.submittedAt && row.action === "submitted" && (
                  <span className="ml-1 opacity-60">· submitted {formatDate(row.submittedAt)}</span>
                )}
              </p>
              {row.reason && (
                <p className="opacity-80 italic">
                  Reason: <span className="not-italic font-medium">{row.reason}</span>
                </p>
              )}
              {row.comments && row.comments !== row.reason && (
                <p className="opacity-70">{row.comments}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
