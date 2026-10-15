"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import type {AuthContext} from "@/lib/rbac/check";
import {dmsApprovalReadIdentity} from "@/lib/reads/dms-approvals-schema";
import { Loader2, CheckCircle2, XCircle, Send, Undo2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  submitDocumentForApproval,
  approveDocument,
  rejectDocument,
  withdrawDocumentApproval,
} from "@/server/actions/dms/document-approvals";

export type ApprovalDialogMode = "submit" | "approve" | "reject" | "withdraw";

interface DmsApprovalActionDialogProps {
  open: boolean;
  /** Keep the same-owner draft mounted while a retained record is inactive. */
  visible?: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ApprovalDialogMode;
  documentId: number;
  approvalId?: number | null;
  onSuccess: () => void;
  authContext: AuthContext;
  canConfirm: boolean;
  isActionCurrent: () => boolean;
  onRefreshStatus?: () => void;
  statusRefreshing?: boolean;
  statusRefreshDisabled?: boolean;
}

const DIALOG_META: Record<ApprovalDialogMode, { title: string; subtitle: string; submitLabel: string; icon: React.ReactNode }> = {
  submit: {
    title: "Submit for Approval",
    subtitle: "Submit this document to the approval queue. You may add an optional note.",
    submitLabel: "Submit for Approval",
    icon: <Send className="h-5 w-5" />,
  },
  approve: {
    title: "Approve Document",
    subtitle: "Approve the current workflow step. The document is final only after its last required step. You may add an optional comment.",
    submitLabel: "Approve",
    icon: <CheckCircle2 className="h-5 w-5" />,
  },
  reject: {
    title: "Reject Document",
    subtitle: "Provide a reason for rejection. This is required.",
    submitLabel: "Reject",
    icon: <XCircle className="h-5 w-5" />,
  },
  withdraw: {
    title: "Withdraw Approval Request",
    subtitle: "Withdraw the pending approval request and return the document to draft. You may add an optional reason.",
    submitLabel: "Withdraw",
    icon: <Undo2 className="h-5 w-5" />,
  },
};

export function DmsApprovalActionDialog(props: DmsApprovalActionDialogProps) {
  if (!props.open) return null;
  return <DmsApprovalActionDialogSession key={JSON.stringify([dmsApprovalReadIdentity(props.authContext), props.documentId, props.approvalId, props.mode])} {...props}/>;
}
function DmsApprovalActionDialogSession({
  open,
  visible = true,
  onOpenChange,
  mode,
  documentId,
  approvalId,
  onSuccess,
  canConfirm,
  isActionCurrent,
  onRefreshStatus,
  statusRefreshing = false,
  statusRefreshDisabled = false,
}: DmsApprovalActionDialogProps) {
  const live = useRef(false), saving = useRef(false);
  const admission = useRef({canConfirm, isActionCurrent, onRefreshStatus, statusRefreshing, statusRefreshDisabled,visible});
  useLayoutEffect(() => {admission.current = {canConfirm, isActionCurrent, onRefreshStatus, statusRefreshing, statusRefreshDisabled,visible};});
  useLayoutEffect(() => {live.current = true; return () => {live.current = false;};}, []);
  const [reason, setReason] = useState("");
  const fieldId = useId();
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const meta = DIALOG_META[mode];

  function handleRefreshStatus() {
    if (!live.current || !admission.current.visible || saving.current || admission.current.statusRefreshing || admission.current.statusRefreshDisabled) return;
    // The owning read guards its lifetime and coalesces same-tick refreshes.
    // This refresh never invokes or retries a business mutation.
    admission.current.onRefreshStatus?.();
  }

  function handleClose(open: boolean) {
    if(!live.current||!admission.current.visible)return;
    if (!open && !submitting) {
      setReason("");
      setComment("");
      setValidationError(null);
      onOpenChange(false);
    }
  }

  async function handleSubmit() {
    if (!live.current || !admission.current.visible || saving.current || admission.current.statusRefreshing || !admission.current.canConfirm || !admission.current.isActionCurrent()) return;
    setValidationError(null);

    if (mode === "reject" && reason.trim().length < 5) {
      setValidationError("Rejection reason must be at least 5 characters.");
      return;
    }

    saving.current = true;
    setSubmitting(true);
    try {
      let result: { success: boolean; error?: string; data?: unknown };

      if (mode === "submit") {
        result = await submitDocumentForApproval(documentId, { comment: comment.trim() || undefined });
      } else if (mode === "approve") {
        if (!approvalId) { setValidationError("Approval request is not ready for action."); setSubmitting(false); return; }
        result = await approveDocument(documentId, approvalId, { comment: comment.trim() || undefined });
      } else if (mode === "reject") {
        if (!approvalId) { setValidationError("Approval request is not ready for action."); setSubmitting(false); return; }
        result = await rejectDocument(documentId, approvalId, { reason: reason.trim(), comment: comment.trim() || undefined });
      } else {
        if (!approvalId) { setValidationError("Approval request is not ready for action."); setSubmitting(false); return; }
        result = await withdrawDocumentApproval(documentId, approvalId, { reason: reason.trim() || undefined });
      }

      if (!live.current) return;
      if (result.success) {
        toast.success(
          mode === "submit" ? "Document submitted for approval." :
          mode === "approve" ? (result.data && typeof result.data === "object" && "pending" in result.data && result.data.pending ? "Step approved. Awaiting the next approval step." : "Document approved.") :
          mode === "reject" ? "Document rejected." :
          "Approval request withdrawn.",
        );
        setReason("");
        setComment("");
        onOpenChange(false);
        onSuccess();
      } else {
        setValidationError("The action was not completed. Your entries are retained. Refresh the document status and check your access before retrying.");
      }
    } catch {
      if (live.current) setValidationError("The result could not be confirmed. Your entries are retained. Check the document status before retrying to avoid repeating an approval action.");
    } finally {
      saving.current = false;
      if (live.current) setSubmitting(false);
    }
  }

  const needsReason = mode === "reject";
  const hasCommentField = mode === "submit" || mode === "approve";
  const hasReasonField = mode === "reject" || mode === "withdraw";

  return (
    <ERPChildDialogForm
      open={open&&visible}
      onOpenChange={handleClose}
      title={meta.title}
      subtitle={meta.subtitle}
      icon={meta.icon}
      mode={mode === "submit" ? "add" : "edit"}
      size="sm"
      isSubmitting={submitting}
      submitDisabled={!canConfirm || statusRefreshing}
      onSubmit={handleSubmit}
      submitLabel={meta.submitLabel}
    >
      <div className="grid grid-cols-12 gap-4">
        {!canConfirm && <p role="status" className="col-span-12 text-sm text-muted-foreground">
          This action is not currently available. Your notes are retained. Refresh the approval status and reopen the action if the request changed.
        </p>}
        {onRefreshStatus && <div className="col-span-12 flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={handleRefreshStatus}
            disabled={submitting || statusRefreshing || statusRefreshDisabled}>
            <RefreshCw aria-hidden="true" className={`mr-1.5 h-3.5 w-3.5${statusRefreshing ? " animate-spin" : ""}`} />
            Refresh approval status
          </Button>
          {statusRefreshing && <span role="status" className="text-xs text-muted-foreground">Refreshing approval status...</span>}
        </div>}
        {hasCommentField && (
          <div className="col-span-12">
            <Label htmlFor={`${fieldId}-comment`} className="text-xs text-muted-foreground mb-1 block">
              Comment <span className="text-muted-foreground/60">(optional)</span>
            </Label>
            <Textarea
              id={`${fieldId}-comment`} name="comment"
              placeholder="Add an optional comment..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="text-sm resize-none"
              disabled={submitting}
            />
          </div>
        )}

        {hasReasonField && (
          <>
            <div className="col-span-12">
              <Label htmlFor={`${fieldId}-reason`} className="text-xs text-muted-foreground mb-1 block">
                {needsReason ? (
                  <span>Reason <span className="text-destructive">*</span></span>
                ) : (
                  <span>Reason <span className="text-muted-foreground/60">(optional)</span></span>
                )}
              </Label>
              <Textarea
                id={`${fieldId}-reason`} name="reason" required={needsReason} minLength={needsReason ? 5 : undefined}
                placeholder={needsReason ? "Enter a reason (required, min 5 characters)..." : "Enter a reason (optional)..."}
                value={reason}
                onChange={(e) => { setReason(e.target.value); setValidationError(null); }}
                rows={3}
                className="text-sm resize-none"
                disabled={submitting}
              />
            </div>
          </>
        )}

        {validationError && (
          <div className="col-span-12">
            <p role="alert" className="text-xs text-destructive">{validationError}</p>
          </div>
        )}

        {submitting && (
          <div className="col-span-12 flex items-center gap-2 text-muted-foreground text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Processing...
          </div>
        )}
      </div>
    </ERPChildDialogForm>
  );
}
