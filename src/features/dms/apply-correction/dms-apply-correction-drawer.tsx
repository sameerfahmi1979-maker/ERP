"use client";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";

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

import { useRef, useState } from "react";
import {useWorkspaceSaveSession} from '@/hooks/use-workspace-save-session';
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
  const session=useWorkspaceSaveSession(`dms-party-correction:${applyItemId}`,null,undefined);
  const inFlight = useRef(false);
  const [uncertain,setUncertain] = useState(false);

  // Confirmation step
  const [confirmProposal, setConfirmProposal] = useState<Pick<
    CorrectionProposalRow,
    | "id" | "proposal_code" | "target_table" | "target_field"
    | "target_record_id" | "current_value_summary"
    | "proposed_correction_summary" | "correction_mode"
  > | null>(null);

  // ── Load source ─────────────────────────────────────────────────────────
  const uiRead1 = useQuery<CorrectionSourceData | null>({
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
 const {
    data: source,
    isLoading: sourceLoading,
    error: sourceError,
  } = uiRead1;

  // ── Handle propose ──────────────────────────────────────────────────────
  const handlePropose = async () => {
    if (!source || inFlight.current) return;
    if (!correctionValue.trim()) {
      setSubmitError("Please enter a correction value.");
      return;
    }

    inFlight.current=true;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const requestId=session.begin({source,correctionMode,correctionValue}).operationId;
      const result = await createApplyCorrectionProposal({
        requestId,
        originalApplyItemId: source.originalApplyItemId,
        correctionMode,
        rawCorrectionValue: correctionValue,
        sourceSnapshot: source,
      });

      if (!result.success) {
        setUncertain(result.uncertain===true);
        if(!result.uncertain)session.rejected();
        setSubmitError(result.error ?? "Failed to create correction proposal.");
        return;
      }

      const proposalId = result.data!.proposalId;
      setUncertain(false);
      session.rejected();
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
        proposed_correction_summary: source.targetField==='tax_registration_number'?'*'.repeat(Math.max(0,correctionValue.length-4))+correctionValue.slice(-4):correctionValue.slice(0,200),
        correction_mode:            correctionMode,
      });
    } catch {
      setUncertain(true);
      setSubmitError('The outcome is unconfirmed. Retry this same proposal to recover its result.');
    } finally {
      inFlight.current=false;
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if(inFlight.current||uncertain){setSubmitError('Recover the pending proposal before closing this review.');return;}
    session.rejected();
    setCorrectionValue("");
    setCorrectionMode("manual");
    setSubmitError(null);
    onOpenChange(false);
  };

  // ── Render loading ───────────────────────────────────────────────────────
  if (sourceLoading) {
    return (
      <QueryReadBoundary queries={[uiRead1]}><ERPChildDialogForm
        open={open}
        onOpenChange={onOpenChange}
        title="Propose Correction"
        icon={<Pencil className="h-5 w-5" />}
        mode="add"
        size="lg"
        isSubmitting={false}
      >
        <div className="flex items-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading correction source…</span>
        </div>
      </ERPChildDialogForm></QueryReadBoundary>
    );
  }

  // ── Render error ─────────────────────────────────────────────────────────
  if (sourceError || !source) {
    return (
      <QueryReadBoundary queries={[uiRead1]}><ERPChildDialogForm
        open={open}
        onOpenChange={onOpenChange}
        title="Propose Correction"
        icon={<Pencil className="h-5 w-5" />}
        mode="add"
        size="lg"
        isSubmitting={false}
      >
        <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          {sourceError instanceof Error
            ? sourceError.message
            : "Could not load correction source. The apply item may not be applicable."}
        </div>
      </ERPChildDialogForm></QueryReadBoundary>
    );
  }

  return (
    <QueryReadBoundary queries={[uiRead1]}><>
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
        closeDisabled={isSubmitting||uncertain}
        submitLabel="Propose Correction"
        cancelLabel="Cancel"
      >
        <div className="space-y-5">
          {/* Source context */}
          <DmsApplyCorrectionSourceCard source={source} />

          {/* Proposal form */}
          <DmsApplyCorrectionProposalForm
            hideActions
            outcomeUncertain={uncertain}
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
              // A single close owns refresh for both confirmed apply and cancel.
              void qc.invalidateQueries({queryKey:queryKeys.dms.applyCorrectionSource(applyItemId)});
              void qc.invalidateQueries({queryKey:queryKeys.dms.applyCorrectionProposals()});
              void qc.invalidateQueries({queryKey:queryKeys.dms.applyToErpRuns()});
              onOpenChange(false);
            }
          }}
          proposal={confirmProposal}
        />
      )}
    </></QueryReadBoundary>
  );
}
