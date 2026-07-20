"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, XCircle, Send, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  submitDocumentForApproval,
  approveDocument,
  rejectDocument,
  withdrawDocumentApproval,
} from "@/server/actions/dms/document-approvals";

export type ApprovalDialogMode = "submit" | "approve" | "reject" | "withdraw";

interface DmsApprovalActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ApprovalDialogMode;
  documentId: number;
  approvalId?: number | null;
  onSuccess: () => void;
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
    subtitle: "Confirm approval of this document. You may add an optional comment.",
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

export function DmsApprovalActionDialog({
  open,
  onOpenChange,
  mode,
  documentId,
  approvalId,
  onSuccess,
}: DmsApprovalActionDialogProps) {
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const meta = DIALOG_META[mode];

  function handleClose(open: boolean) {
    if (!open && !submitting) {
      setReason("");
      setComment("");
      setValidationError(null);
      onOpenChange(false);
    }
  }

  async function handleSubmit() {
    setValidationError(null);

    if (mode === "reject" && reason.trim().length < 5) {
      setValidationError("Rejection reason must be at least 5 characters.");
      return;
    }

    setSubmitting(true);
    try {
      let result: { success: boolean; error?: string };

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

      if (result.success) {
        toast.success(
          mode === "submit" ? "Document submitted for approval." :
          mode === "approve" ? "Document approved." :
          mode === "reject" ? "Document rejected." :
          "Approval request withdrawn.",
        );
        setReason("");
        setComment("");
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error(result.error ?? "Action failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const needsReason = mode === "reject";
  const hasCommentField = mode === "submit" || mode === "approve";
  const hasReasonField = mode === "reject" || mode === "withdraw";

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={handleClose}
      title={meta.title}
      subtitle={meta.subtitle}
      icon={meta.icon}
      mode={mode === "submit" ? "add" : "edit"}
      size="sm"
      isSubmitting={submitting}
      onSubmit={handleSubmit}
      submitLabel={meta.submitLabel}
    >
      <div className="grid grid-cols-12 gap-4">
        {hasCommentField && (
          <div className="col-span-12">
            <Label className="text-xs text-muted-foreground mb-1 block">
              Comment <span className="text-muted-foreground/60">(optional)</span>
            </Label>
            <Textarea
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
              <Label className="text-xs text-muted-foreground mb-1 block">
                {needsReason ? (
                  <span>Reason <span className="text-destructive">*</span></span>
                ) : (
                  <span>Reason <span className="text-muted-foreground/60">(optional)</span></span>
                )}
              </Label>
              <Textarea
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
            <p className="text-xs text-destructive">{validationError}</p>
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
