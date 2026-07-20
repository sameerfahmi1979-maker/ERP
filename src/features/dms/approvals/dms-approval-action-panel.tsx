"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, differenceInDays } from "date-fns";
import {
  Loader2, ShieldCheck, AlertCircle, RefreshCw, Send, CheckCircle2, XCircle, Undo2, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DmsApprovalStatusBadge } from "./dms-approval-status-badge";
import { DmsApprovalHistorySection } from "./dms-approval-history-section";
import {
  DmsApprovalActionDialog,
  type ApprovalDialogMode,
} from "./dms-approval-action-dialog";
import {
  getDocumentApprovalState,
  getDocumentApprovalHistory,
} from "@/server/actions/dms/document-approvals";

interface DmsApprovalActionPanelProps {
  documentId: number;
}

export function DmsApprovalActionPanel({ documentId }: DmsApprovalActionPanelProps) {
  const qc = useQueryClient();
  const [dialogMode, setDialogMode] = useState<ApprovalDialogMode | null>(null);

  const stateQuery = useQuery({
    queryKey: ["dms", "approval-state", documentId] as const,
    queryFn: async () => {
      const r = await getDocumentApprovalState(documentId);
      if (!r.success) throw new Error(r.error ?? "Failed to load approval state");
      return r.data!;
    },
    staleTime: 15_000,
    retry: 1,
  });

  const historyQuery = useQuery({
    queryKey: ["dms", "approval-history", documentId] as const,
    queryFn: async () => {
      const r = await getDocumentApprovalHistory(documentId);
      return r.data ?? [];
    },
    staleTime: 15_000,
    retry: 1,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["dms", "approval-state", documentId] });
    qc.invalidateQueries({ queryKey: ["dms", "approval-history", documentId] });
  }

  if (stateQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading approval state...
      </div>
    );
  }

  if (stateQuery.isError || !stateQuery.data) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-muted-foreground">
        <AlertCircle className="h-6 w-6 opacity-40" />
        <p className="text-sm text-center">
          {stateQuery.error instanceof Error
            ? stateQuery.error.message
            : "Failed to load approval state."}
        </p>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => stateQuery.refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  const state = stateQuery.data;
  const history = historyQuery.data ?? [];

  const daysPending =
    state.approvalStatus === "pending_approval" && state.submittedAt
      ? differenceInDays(new Date(), parseISO(state.submittedAt))
      : null;

  function formatDate(d: string | null) {
    if (!d) return null;
    try { return format(parseISO(d), "dd MMM yyyy HH:mm"); } catch { return d; }
  }

  return (
    <div className="space-y-4">
      {/* Status summary card */}
      <div className="rounded-md border border-border bg-muted/5 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Approval Status</span>
            </div>
            <DmsApprovalStatusBadge status={state.approvalStatus as Parameters<typeof DmsApprovalStatusBadge>[0]["status"]} />
          </div>

          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={invalidate}
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Meta info for pending/approved/rejected/withdrawn */}
        {state.submittedBy && state.submittedAt && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p>
              Submitted by <span className="font-medium text-foreground">{state.submittedByName ?? `User #${state.submittedBy}`}</span>
              {" · "}
              <span>{formatDate(state.submittedAt)}</span>
            </p>
            {daysPending !== null && daysPending > 0 && (
              <p className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {daysPending} day{daysPending !== 1 ? "s" : ""} pending
              </p>
            )}
          </div>
        )}

        {/* Rejection reason */}
        {state.approvalStatus === "rejected" && state.latestReason && (
          <div className="text-xs bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-md px-3 py-2 text-red-700 dark:text-red-400">
            <span className="font-semibold">Rejection reason: </span>
            {state.latestReason}
          </div>
        )}

        {/* Latest comment */}
        {state.latestComments && state.latestComments !== state.latestReason && (
          <p className="text-xs text-muted-foreground italic">{state.latestComments}</p>
        )}

        {/* Self-approval blocked message */}
        {state.selfApprovalBlocked && state.selfApprovalBlockReason && (
          <div className="text-xs bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2 text-amber-700 dark:text-amber-400">
            {state.selfApprovalBlockReason}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-1">
          {state.canSubmit && (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setDialogMode("submit")}
            >
              <Send className="h-3.5 w-3.5" />
              {state.approvalStatus === "rejected" || state.approvalStatus === "withdrawn"
                ? "Resubmit for Approval"
                : "Submit for Approval"}
            </Button>
          )}

          {state.canApprove && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20"
              onClick={() => setDialogMode("approve")}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Approve
            </Button>
          )}

          {state.canReject && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
              onClick={() => setDialogMode("reject")}
            >
              <XCircle className="h-3.5 w-3.5" />
              Reject
            </Button>
          )}

          {state.canWithdraw && (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => setDialogMode("withdraw")}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Withdraw
            </Button>
          )}

          {!state.canSubmit && !state.canApprove && !state.canReject && !state.canWithdraw && !state.approvalStatus && (
            <p className="text-xs text-muted-foreground py-1">
              You do not have permission to submit this document for approval.
            </p>
          )}
        </div>
      </div>

      {/* History timeline */}
      {state.canViewHistory && (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Approval History</p>
            {historyQuery.isLoading ? (
              <div className="flex items-center gap-2 py-3 text-muted-foreground text-xs">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading history...
              </div>
            ) : (
              <DmsApprovalHistorySection rows={history} />
            )}
          </div>
        </>
      )}

      {/* Action dialogs */}
      {dialogMode && (
        <DmsApprovalActionDialog
          open={!!dialogMode}
          onOpenChange={(open) => { if (!open) setDialogMode(null); }}
          mode={dialogMode}
          documentId={documentId}
          approvalId={state.currentApprovalId}
          onSuccess={invalidate}
        />
      )}
    </div>
  );
}
