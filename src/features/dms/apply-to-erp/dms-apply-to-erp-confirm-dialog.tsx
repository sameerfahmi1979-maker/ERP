"use client";

import { useState } from "react";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { DmsApplyToErpItemTable } from "./dms-apply-to-erp-item-table";
import type { ApplyItemProposal, ApplyRunResult, ApplyTargetModule, PartyApplyTargetKind } from "@/lib/dms/apply-to-erp/types";
import { createDmsApplyToErpRun, applyDmsApplyToErpRun } from "@/server/actions/dms/apply-to-erp";
import { cn } from "@/lib/utils";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open:              boolean;
  onOpenChange:      (open: boolean) => void;
  documentId:        number;
  reviewQueueItemId?: number | null;
  sourceType:        ApplyItemProposal["sourceType"];
  sourceId?:         number | null;
  proposals:         ApplyItemProposal[];
  targetModule:      ApplyTargetModule;
  targetTable:       string;
  targetRecordId?:   number | null;
  /** Tier 2 Party context */
  partyId?:          number | null;
  partyName?:        string | null;
  targetKind?:       PartyApplyTargetKind | null;
  onApplied?:        (result: ApplyRunResult) => void;
}

// ── Confirm dialog ────────────────────────────────────────────────────────────

export function DmsApplyToErpConfirmDialog({
  open, onOpenChange,
  documentId, reviewQueueItemId, sourceType, sourceId,
  proposals, targetModule, targetTable, targetRecordId,
  partyId, partyName, targetKind,
  onApplied,
}: Props) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    () => new Set(proposals.map((_, i) => i))
  );
  const [humanReviewConfirmed, setHumanReviewConfirmed] = useState(false);
  const [replaceExistingConfirmed, setReplaceExistingConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasConflictRisk = proposals.some((p, i) => selectedIndices.has(i) && p.conflictRisk);
  const selectedCount = selectedIndices.size;

  const handleToggle = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleApply = async () => {
    if (!humanReviewConfirmed) {
      setError("You must confirm you have reviewed each field before applying.");
      return;
    }
    if (selectedCount === 0) {
      setError("Select at least one field to apply.");
      return;
    }
    if (hasConflictRisk && !replaceExistingConfirmed) {
      setError("Some fields already have values. Check 'I confirm replacing existing values' to proceed.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Step 1: Create apply run (history only, no target writes)
      const selectedProposals = proposals.filter((_, i) => selectedIndices.has(i));

      const runResult = await createDmsApplyToErpRun({
        sourceType,
        sourceId: sourceId ?? null,
        documentId,
        reviewQueueItemId: reviewQueueItemId ?? null,
        targetModule,
        targetTable,
        targetRecordId: targetRecordId ?? null,
        items: selectedProposals,
        // Tier 2 Party context (only sent when applicable)
        ...(targetModule === "party" && partyId != null ? {
          partyId,
          targetKind: targetKind ?? undefined,
        } : {}),
      });

      if (!runResult.success || !runResult.data) {
        setError(runResult.error ?? "Failed to create apply run.");
        setIsSubmitting(false);
        return;
      }

      const { runId } = runResult.data;

      // Step 2: Execute — retrieve confirmed item IDs from the created run
      const detailResult = await import("@/server/actions/dms/apply-to-erp").then(m =>
        m.getDmsApplyToErpRun(runId)
      );

      if (!detailResult.success || !detailResult.data) {
        setError("Failed to load apply run items.");
        setIsSubmitting(false);
        return;
      }

      const confirmedItemIds = detailResult.data.items.map(item => item.id);

      // Step 3: Apply confirmed items
      const applyResult = await applyDmsApplyToErpRun(runId, {
        confirmedItemIds,
        humanReviewConfirmed: true,
        replaceExistingConfirmed,
      });

      if (!applyResult.success || !applyResult.data) {
        setError(applyResult.error ?? "Apply failed.");
        setIsSubmitting(false);
        return;
      }

      onApplied?.(applyResult.data);
      onOpenChange(false);
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={onOpenChange}
      title={
        targetModule === "party"
          ? targetKind === "party_licenses"
            ? "Apply Selected to Party License"
            : "Apply Selected to Party Tax Registration"
          : "Apply to DMS Document"
      }
      subtitle={
        targetModule === "party" && partyName
          ? `Party: ${partyName} — Human review required before writing to Party Master`
          : "Review each field carefully before applying. This writes to the document record."
      }
      icon={<ShieldCheck className="h-5 w-5" />}
      mode="add"
      size="xl"
      isSubmitting={isSubmitting}
      onSubmit={handleApply}
      submitLabel={
        targetModule === "party"
          ? targetKind === "party_licenses"
            ? "Confirm Party Write-back"
            : "Confirm Party Write-back"
          : "Apply Selected"
      }
      cancelLabel="Cancel"
    >
      <div className="space-y-4">
        {/* Safety warning */}
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <div className="text-amber-800">
            <strong>Human review required.</strong> These values were suggested by AI.
            Verify each field before applying. This action writes directly to{" "}
            {targetModule === "party"
              ? `the Party Master ${targetKind === "party_licenses" ? "license" : "tax registration"} record`
              : "the document record"
            } and cannot be auto-reversed.
          </div>
        </div>

        {/* Party context banner */}
        {targetModule === "party" && partyName && (
          <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">
            <span className="font-semibold">Target Party:</span> {partyName}
            {targetKind === "party_licenses" && " → Party License"}
            {targetKind === "party_tax_registrations" && " → Tax Registration"}
          </div>
        )}

        {/* Item table with checkboxes */}
        <div className="space-y-1.5">
          <div className="text-sm font-medium text-foreground">
            Select fields to apply ({selectedCount} of {proposals.length} selected)
          </div>
          <DmsApplyToErpItemTable
            items={proposals}
            selectedIndices={selectedIndices}
            onToggle={handleToggle}
            disabled={isSubmitting}
          />
        </div>

        {/* Human review confirmation */}
        <label className={cn(
          "flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors",
          humanReviewConfirmed ? "border-primary/40 bg-primary/5" : "border-border"
        )}>
          <input
            type="checkbox"
            className="h-4 w-4 mt-0.5 rounded border-gray-300 text-primary"
            checked={humanReviewConfirmed}
            onChange={(e) => setHumanReviewConfirmed(e.target.checked)}
            disabled={isSubmitting}
          />
          <div className="text-sm">
            <div className="font-medium text-foreground">I have reviewed each selected field</div>
            <div className="text-muted-foreground text-xs mt-0.5">
              I confirm the proposed values are correct and I want to apply them to the{" "}
              {targetModule === "party"
                ? `Party Master ${targetKind === "party_licenses" ? "license" : "tax registration"} record`
                : "document record"
              }.
            </div>
          </div>
        </label>

        {/* Replace existing confirmation (only shown when needed) */}
        {hasConflictRisk && (
          <label className={cn(
            "flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors",
            replaceExistingConfirmed ? "border-amber-400/60 bg-amber-50/60" : "border-amber-200 bg-amber-50/30"
          )}>
            <input
              type="checkbox"
              className="h-4 w-4 mt-0.5 rounded border-gray-300 text-amber-600"
              checked={replaceExistingConfirmed}
              onChange={(e) => setReplaceExistingConfirmed(e.target.checked)}
              disabled={isSubmitting}
            />
            <div className="text-sm">
              <div className="font-medium text-amber-800 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                I confirm replacing existing values
              </div>
              <div className="text-amber-700 text-xs mt-0.5">
                Some selected fields already have values. Enabling this will overwrite them.
                Verify each field is correct before proceeding.
              </div>
            </div>
          </label>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </ERPChildDialogForm>
  );
}
