"use client";

import { useState, useTransition } from "react";
import { Wand2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DmsApplyToErpConfirmDialog } from "./dms-apply-to-erp-confirm-dialog";
import type { ApplyItemProposal, ApplyRunResult, ApplyTargetModule, PartyApplyTargetKind } from "@/lib/dms/apply-to-erp/types";
import { getDmsApplyToErpPreview } from "@/server/actions/dms/apply-to-erp";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  documentId:         number;
  reviewQueueItemId?: number | null;
  sourceType:         ApplyItemProposal["sourceType"];
  sourceId?:          number | null;
  proposals:          ApplyItemProposal[];
  targetModule:       ApplyTargetModule;
  targetTable:        string;
  targetRecordId?:    number | null;
  /** Tier 2 Party context */
  partyId?:           number | null;
  partyName?:         string | null;
  targetKind?:        PartyApplyTargetKind | null;
  /** Called after a successful apply run. */
  onApplied?:         (result: ApplyRunResult) => void;
  /** Shows "Preview Apply" entry button inline. */
  label?:             string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DmsApplyToErpPreview({
  documentId, reviewQueueItemId, sourceType, sourceId,
  proposals, targetModule, targetTable, targetRecordId,
  partyId, partyName, targetKind,
  onApplied, label = "Preview Apply",
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [validatedProposals, setValidatedProposals] = useState<ApplyItemProposal[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handlePreview = () => {
    setError(null);
    startTransition(async () => {
      const result = await getDmsApplyToErpPreview(proposals);
      if (!result.success) {
        setError(result.error ?? "Preview unavailable");
        return;
      }
      if (!result.data || result.data.length === 0) {
        setError("No eligible fields available for apply.");
        return;
      }
      setValidatedProposals(result.data);
      setDialogOpen(true);
    });
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePreview}
          disabled={isPending || proposals.length === 0}
          className="gap-2"
        >
          <Wand2 className="h-4 w-4" />
          {isPending ? "Loading Preview…" : label}
          {!isPending && <ChevronRight className="h-3 w-3" />}
        </Button>
        {error && (
          <p className="text-xs text-red-600">{error}</p>
        )}
      </div>

      {validatedProposals.length > 0 && (
        <DmsApplyToErpConfirmDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          documentId={documentId}
          reviewQueueItemId={reviewQueueItemId}
          sourceType={sourceType}
          sourceId={sourceId}
          proposals={validatedProposals}
          targetModule={targetModule}
          targetTable={targetTable}
          targetRecordId={targetRecordId}
          partyId={partyId}
          partyName={partyName}
          targetKind={targetKind}
          onApplied={(result) => {
            setDialogOpen(false);
            onApplied?.(result);
          }}
        />
      )}
    </>
  );
}
