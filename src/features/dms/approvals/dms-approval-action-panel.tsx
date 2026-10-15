"use client";

import { useContext, useState } from "react";
import {DmsSectionActivity} from "@/features/dms/documents/section-activity";
import {useRecordReadActive} from "@/hooks/use-record-read-active";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO, differenceInDays } from "date-fns";
import {
  Loader2, ShieldCheck, AlertCircle, RefreshCw, Send, CheckCircle2, XCircle, Undo2, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DmsLoadError } from "@/features/dms/dms-load-error";
import { DmsApprovalStatusBadge } from "./dms-approval-status-badge";
import { DmsApprovalHistorySection } from "./dms-approval-history-section";
import {
  DmsApprovalActionDialog,
  type ApprovalDialogMode,
} from "./dms-approval-action-dialog";
import type {AuthContext} from "@/lib/rbac/check";
import {dmsApprovalReadIdentity} from "@/lib/reads/dms-approvals-schema";
import {useDmsApprovalState, useDmsApprovalHistory} from "@/hooks/use-dms-approvals";
import {invalidateDmsApprovalOutcome} from "@/lib/query/invalidation";

interface DmsApprovalActionPanelProps {
  documentId: number;
  authContext: AuthContext;
}

export function DmsApprovalActionPanel(props: DmsApprovalActionPanelProps) {
  return <DmsApprovalActionSession key={JSON.stringify([dmsApprovalReadIdentity(props.authContext), props.documentId])} {...props}/>;
}
function DmsApprovalActionSession({ documentId, authContext }: DmsApprovalActionPanelProps) {
  const recordActive=useRecordReadActive();
  const sectionActive = useContext(DmsSectionActivity)&&recordActive;
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{mode: ApprovalDialogMode; approvalId: number | null} | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false), [historyPage, setHistoryPage] = useState(1);
  const stateQuery = useDmsApprovalState(authContext, documentId, sectionActive);
  const historyQuery = useDmsApprovalHistory(authContext, documentId, historyPage, sectionActive && historyOpen && stateQuery.data?.record.canViewHistory === true);

  function refresh() {
    // History admission follows the refreshed state. Eagerly retrying it here
    // would dispatch a read that state retirement immediately cancels.
    stateQuery.retry();
  }
  const current = stateQuery.data?.record;
  const canConfirm = !!dialog && stateQuery.ready && !!current && current.currentApprovalId === dialog.approvalId
    && (dialog.mode === "submit" ? current.canSubmit : dialog.mode === "approve" ? current.canApprove : dialog.mode === "reject" ? current.canReject : current.canWithdraw);
  const dialogNode = dialog ? <DmsApprovalActionDialog key={JSON.stringify([dialog.mode, dialog.approvalId])} authContext={authContext}
    open visible={sectionActive} canConfirm={canConfirm} isActionCurrent={stateQuery.isCurrent}
    onRefreshStatus={stateQuery.retry} statusRefreshing={stateQuery.busy} statusRefreshDisabled={stateQuery.denied || stateQuery.invalid}
    onOpenChange={open => {if (!open) setDialog(null);}} mode={dialog.mode} documentId={documentId} approvalId={dialog.approvalId} onSuccess={() => invalidateDmsApprovalOutcome(qc, documentId)}/> : null;
  function openDialog(mode: ApprovalDialogMode) {if (stateQuery.isCurrent()) setDialog({mode, approvalId: stateQuery.data?.record.currentApprovalId ?? null});}

  if (stateQuery.busy) {
    return (
      <>{dialogNode}
      <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading approval state...
      </div></>
    );
  }

  if (!stateQuery.ready || !stateQuery.data) {
    return (
      <>{stateQuery.denied ? null : dialogNode}
      <div className="flex flex-col items-center gap-3 py-6 text-muted-foreground">
        <AlertCircle className="h-6 w-6 opacity-40" />
        <p className="text-sm text-center">
          Approval details could not be loaded. Check your connection and access, then retry.
        </p>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={stateQuery.retry} disabled={stateQuery.denied || stateQuery.invalid}>
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div></>
    );
  }

  const state = stateQuery.data.record;
  const history = historyQuery.data?.rows ?? [];

  const daysPending =
    state.approvalStatus === "pending_approval" && state.submittedAt
      ? differenceInDays(new Date(), parseISO(state.submittedAt))
      : null;

  function formatDate(d: string | null) {
    if (!d) return null;
    try { return format(parseISO(d), "dd MMM yyyy HH:mm"); } catch { return d; }
  }

  return (
    <>{dialogNode}
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

          <Button aria-label="Refresh"
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={refresh}
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
        {state.actionUnavailableReason && <p role="status" className="text-sm text-muted-foreground">{state.actionUnavailableReason}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          {state.canSubmit && (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => openDialog("submit")}
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
              onClick={() => openDialog("approve")}
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
              onClick={() => openDialog("reject")}
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
              onClick={() => openDialog("withdraw")}
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
            <Button type="button" variant="outline" size="sm" aria-expanded={historyOpen} onClick={() => setHistoryOpen(value => !value)}>
              {historyOpen ? "Hide approval history" : "Show approval history"}
            </Button>
            {historyOpen && (historyQuery.busy ? (
              <div className="flex items-center gap-2 py-3 text-muted-foreground text-xs">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading history...
              </div>
            ) : (
              historyQuery.ready ? <DmsApprovalHistorySection rows={history} page={historyPage} totalCount={historyQuery.data!.totalCount} pageSize={20}
                onPageChange={page => {if (historyQuery.isCurrent()) setHistoryPage(page);}} />
                : <DmsLoadError subject="approval history" retry={historyQuery.retry} pending={historyQuery.denied || historyQuery.invalid} />
            ))}
          </div>
        </>
      )}

    </div></>
  );
}
