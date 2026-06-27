"use client";

/**
 * DMS Apply Correction — Confirm Dialog
 *
 * Confirmation step before applying a correction proposal.
 * Uses ERPChildDialogForm for consistent modal UX.
 *
 * Required confirmations:
 *   - humanReviewConfirmed
 *   - replaceExistingConfirmed (if target field has a value)
 *
 * UI labels: Apply Correction, Cancel Correction
 * FORBIDDEN: Undo, Rollback, Auto Revert, Restore Automatically, One-click Revert
 */

import { useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { cn } from "@/lib/utils";
import type { CorrectionProposalRow } from "@/lib/dms/apply-correction/types";
import { applyCorrectionProposal } from "@/server/actions/dms/apply-correction";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open:          boolean;
  onOpenChange:  (open: boolean) => void;
  proposal:      Pick<
    CorrectionProposalRow,
    | "id"
    | "proposal_code"
    | "target_table"
    | "target_field"
    | "target_record_id"
    | "current_value_summary"
    | "proposed_correction_summary"
    | "correction_mode"
  >;
  onApplied?: (proposalId: number) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DmsApplyCorrectionConfirmDialog({
  open,
  onOpenChange,
  proposal,
  onApplied,
}: Props) {
  const [humanReviewConfirmed, setHumanReviewConfirmed] = useState(false);
  const [replaceExistingConfirmed, setReplaceExistingConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCurrentValue =
    proposal.current_value_summary != null &&
    proposal.current_value_summary !== "";

  const handleApply = async () => {
    if (!humanReviewConfirmed) {
      setError("You must confirm you have reviewed the correction.");
      return;
    }
    if (hasCurrentValue && !replaceExistingConfirmed) {
      setError("You must confirm you want to replace the existing value.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await applyCorrectionProposal({
        proposalId:               proposal.id,
        humanReviewConfirmed:     true,
        replaceExistingConfirmed: replaceExistingConfirmed,
      });

      if (!result.success) {
        setError(result.error ?? "Failed to apply correction.");
        return;
      }

      onApplied?.(proposal.id);
      onOpenChange(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={onOpenChange}
      title="Apply Correction"
      subtitle={`Proposal ${proposal.proposal_code ?? `#${proposal.id}`}`}
      icon={<ShieldCheck className="h-5 w-5 text-blue-600" />}
      mode="edit"
      size="md"
      isSubmitting={isSubmitting}
      onSubmit={handleApply}
      submitLabel="Apply Correction"
      cancelLabel="Cancel Correction"
    >
      <div className="space-y-5">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          <ValueDisplay label="Target Field" value={`${proposal.target_table}.${proposal.target_field}`} mono />
          <ValueDisplay label="Target Record" value={proposal.target_record_id ? `#${proposal.target_record_id}` : "N/A"} />
          <ValueDisplay
            label="Current Value"
            value={proposal.current_value_summary}
            emptyLabel="(empty)"
            variant="neutral"
          />
          <ValueDisplay
            label="Correction Value"
            value={proposal.proposed_correction_summary}
            emptyLabel="(none)"
            variant="info"
          />
        </div>

        {/* Correction mode info */}
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <span>Mode:</span>
          <span className="font-mono capitalize bg-slate-100 px-1.5 py-0.5 rounded">
            {proposal.correction_mode.replace(/_/g, " ")}
          </span>
        </div>

        {/* Human review confirmation */}
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-slate-300"
            checked={humanReviewConfirmed}
            onChange={(e) => setHumanReviewConfirmed(e.target.checked)}
            disabled={isSubmitting}
          />
          <span className="text-sm text-slate-700">
            I confirm I have reviewed the correction value and take responsibility
            for this change.
          </span>
        </label>

        {/* Replace existing confirmation */}
        {hasCurrentValue && (
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-300"
              checked={replaceExistingConfirmed}
              onChange={(e) => setReplaceExistingConfirmed(e.target.checked)}
              disabled={isSubmitting}
            />
            <span className="text-sm text-slate-700">
              I confirm I want to replace the existing value:{" "}
              <span className="font-mono text-xs bg-slate-100 px-1 rounded">
                {proposal.current_value_summary}
              </span>
            </span>
          </label>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Responsibility notice */}
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
          This correction will write directly to the ERP target field. The action
          will be audited. No automatic reversal is available after applying.
        </div>
      </div>
    </ERPChildDialogForm>
  );
}

// ── Value display ─────────────────────────────────────────────────────────────

function ValueDisplay({
  label,
  value,
  emptyLabel = "(empty)",
  variant = "neutral",
  mono = false,
}: {
  label:       string;
  value:       string | null | undefined;
  emptyLabel?: string;
  variant?:    "neutral" | "info";
  mono?:       boolean;
}) {
  const variantClass = variant === "info"
    ? "bg-blue-50 border-blue-200 text-blue-800"
    : "bg-white border-slate-200 text-slate-700";

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <div className={cn(
        "rounded border px-2.5 py-1.5 text-sm min-h-[2rem] break-words",
        variantClass,
        mono && "font-mono text-xs"
      )}>
        {value != null && value !== "" ? value : (
          <span className="text-slate-400 italic">{emptyLabel}</span>
        )}
      </div>
    </div>
  );
}
