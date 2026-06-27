"use client";

/**
 * DMS Apply Correction — Propose Correction Drawer
 *
 * Full correction proposal workflow:
 *   Step 1 — Load source (applies source card + proposal form)
 *   Step 2 — Create proposal (confirmed by server)
 *   Step 3 — Apply correction (confirm dialog)
 *
 * Uses ERPChildDialogForm for the dialog wrapper.
 *
 * Allowed labels: Propose Correction, Review Correction, Apply Correction,
 *   Cancel Correction, Use Previous Value, Use Applied Value, Enter Correction Manually
 * FORBIDDEN: Undo, Rollback, Auto Revert, Restore Automatically, One-click Revert
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertTriangle, Pencil } from "lucide-react";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { DmsApplyCorrectionSourceCard } from "./dms-apply-correction-source-card";
import { DmsApplyCorrectionProposalForm } from "./dms-apply-correction-proposal-form";
import { DmsApplyCorrectionConfirmDialog } from "./dms-apply-correction-confirm-dialog";
import { queryKeys } from "@/lib/query/query-keys";
import {
  getApplyCorrectionSource,
  createApplyCorrectionProposal,
} from "@/server/actions/dms/apply-correction";
import type {
  CorrectionMode,
  CorrectionProposalRow,
  CorrectionSourceData,
} from "@/lib/dms/apply-correction/types";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  applyItemId:  number;
  onProposed?:  (proposalId: number) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DmsApplyCorrectionDrawer({
  open,
  onOpenChange,
  applyItemId,
  onProposed,
}: Props) {
  const qc = useQueryClient();

  // Form state
  const [correctionValue, setCorrectionValue] = useState("");
  const [correctionMode, setCorrectionMode] = useState<CorrectionMode>("manual");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Confirmation step
  const [confirmProposal, setConfirmProposal] = useState<Pick<
    CorrectionProposalRow,
    | "id" | "proposal_code" | "target_table" | "target_field"
    | "target_record_id" | "current_value_summary"
    | "proposed_correction_summary" | "correction_mode"
  > | null>(null);

  // ── Load source ─────────────────────────────────────────────────────────
  const {
    data: source,
    isLoading: sourceLoading,
    error: sourceError,
  } = useQuery<CorrectionSourceData | null>({
    queryKey: queryKeys.dms.applyCorrectionSource(applyItemId),
    queryFn: async () => {
      const result = await getApplyCorrectionSource(applyItemId);
      if (!result.success) throw new Error(result.error ?? "Failed to load correction source");
      return result.data ?? null;
    },
    enabled: open && !!applyItemId,
    staleTime: 30_000,
    retry: false,
  });

  // ── Handle propose ──────────────────────────────────────────────────────
  const handlePropose = async () => {
    if (!source) return;
    if (!correctionValue.trim()) {
      setSubmitError("Please enter a correction value.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await createApplyCorrectionProposal({
        originalApplyItemId: source.originalApplyItemId,
        correctionMode,
        rawCorrectionValue: correctionValue,
        sourceSnapshot: source,
      });

      if (!result.success) {
        setSubmitError(result.error ?? "Failed to create correction proposal.");
        return;
      }

      const proposalId = result.data!.proposalId;
      onProposed?.(proposalId);

      // Invalidate queries
      void qc.invalidateQueries({
        queryKey: queryKeys.dms.applyCorrectionProposals({}),
      });

      // Move to confirm step
      setConfirmProposal({
        id:                         proposalId,
        proposal_code:              null,
        target_table:               source.targetTable,
        target_field:               source.targetField,
        target_record_id:           source.targetRecordId,
        current_value_summary:      source.currentValueSummary,
        proposed_correction_summary: correctionValue.slice(0, 200),
        correction_mode:            correctionMode,
      });
    } catch (err) {
      setSubmitError(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setCorrectionValue("");
    setCorrectionMode("manual");
    setSubmitError(null);
    onOpenChange(false);
  };

  // ── Render loading ───────────────────────────────────────────────────────
  if (sourceLoading) {
    return (
      <ERPChildDialogForm
        open={open}
        onOpenChange={onOpenChange}
        title="Propose Correction"
        icon={<Pencil className="h-5 w-5" />}
        mode="add"
        size="lg"
        isSubmitting={false}
      >
        <div className="flex items-center gap-2 py-8 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading correction source…</span>
        </div>
      </ERPChildDialogForm>
    );
  }

  // ── Render error ─────────────────────────────────────────────────────────
  if (sourceError || !source) {
    return (
      <ERPChildDialogForm
        open={open}
        onOpenChange={onOpenChange}
        title="Propose Correction"
        icon={<Pencil className="h-5 w-5" />}
        mode="add"
        size="lg"
        isSubmitting={false}
      >
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          {sourceError instanceof Error
            ? sourceError.message
            : "Could not load correction source. The apply item may not be applicable."}
        </div>
      </ERPChildDialogForm>
    );
  }

  return (
    <>
      <ERPChildDialogForm
        open={open && !confirmProposal}
        onOpenChange={(o) => { if (!o) handleCancel(); }}
        title="Propose Correction"
        subtitle={`${source.targetTable}.${source.targetField}`}
        icon={<Pencil className="h-5 w-5" />}
        mode="add"
        size="lg"
        isSubmitting={isSubmitting}
        onSubmit={handlePropose}
        submitLabel="Propose Correction"
        cancelLabel="Cancel"
      >
        <div className="space-y-5">
          {/* Source context */}
          <DmsApplyCorrectionSourceCard source={source} />

          {/* Proposal form */}
          <DmsApplyCorrectionProposalForm
            source={source}
            value={correctionValue}
            onChange={setCorrectionValue}
            mode={correctionMode}
            onModeChange={setCorrectionMode}
            isSubmitting={isSubmitting}
            onSubmit={handlePropose}
            onCancel={handleCancel}
            error={submitError}
          />
        </div>
      </ERPChildDialogForm>

      {/* Apply confirmation dialog */}
      {confirmProposal && (
        <DmsApplyCorrectionConfirmDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setConfirmProposal(null);
              onOpenChange(false);
            }
          }}
          proposal={confirmProposal}
          onApplied={() => {
            setConfirmProposal(null);
            void qc.invalidateQueries({
              queryKey: queryKeys.dms.applyCorrectionProposals({}),
            });
            void qc.invalidateQueries({
              queryKey: queryKeys.dms.applyToErpRuns(),
            });
            onOpenChange(false);
          }}
        />
      )}
    </>
  );
}
