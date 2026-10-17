"use client";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";
import { RecordCollection } from "@/components/erp/table/record-collection";

/**
 * DMS Apply Correction — History
 *
 * Shows correction proposals related to a document or apply item.
 * Read-only display + Cancel action.
 */

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DmsApplyCorrectionStatusBadge } from "./dms-apply-correction-status-badge";
import { DmsApplyCorrectionConfirmDialog } from "./dms-apply-correction-confirm-dialog";
import { queryKeys } from "@/lib/query/query-keys";
import { listApplyCorrectionProposals, cancelApplyCorrectionProposal } from "@/server/actions/dms/apply-correction";
import type { CorrectionProposalHistory } from "@/lib/dms/apply-correction/types";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  documentId?: number | null;
  targetTable?: string;
  targetRecordId?: number | null;
  /** Notify an owning view only after a confirmed apply or cancellation. */
  onChanged?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DmsApplyCorrectionHistory({ documentId, targetTable, targetRecordId, onChanged }: Props) {
  const qc = useQueryClient();
  const [confirmingProposal, setConfirmingProposal] = useState<CorrectionProposalHistory | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const cancelInFlight = useRef(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [uncertainCancelId, setUncertainCancelId] = useState<number | null>(null);

  const uiRead1 = useQuery({
    queryKey: queryKeys.dms.applyCorrectionProposals({ documentId, targetTable, targetRecordId }),
    queryFn: async () => {
      const result = await listApplyCorrectionProposals({
        documentId:    documentId ?? undefined,
        targetTable:   targetTable ?? undefined,
        targetRecordId: targetRecordId ?? undefined,
      });
      if (!result.success) throw new Error(result.error || "Correction history could not be loaded.");
      return result.data ?? [];
    },
    enabled: !!(documentId || (targetTable && targetRecordId)),
    staleTime: 30_000,
  });
 const { data: proposals = [], isLoading, error } = uiRead1;

  const handleCancel = async (proposalId: number) => {
    if(cancelInFlight.current || (uncertainCancelId !== null && uncertainCancelId !== proposalId)) return;
    cancelInFlight.current = true;
    setCancellingId(proposalId);
    setCancelError(null);
    try {
      const result = await cancelApplyCorrectionProposal(proposalId);
      if (result.success) {
        setUncertainCancelId(null);
        void qc.invalidateQueries({
          queryKey: queryKeys.dms.applyCorrectionProposals(),
        });
        onChanged?.();
      } else {
        setUncertainCancelId(result.uncertain ? proposalId : null);
        setCancelError(result.error || "The proposal could not be cancelled. Try again.");
      }
    } catch {
      setUncertainCancelId(proposalId);
      setCancelError("Cancellation is not confirmed. Retry cancellation for this proposal before taking another action.");
    } finally {
      cancelInFlight.current = false;
      setCancellingId(null);
    }
  };

  if (isLoading) {
    return (
      <QueryReadBoundary queries={[uiRead1]}><div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading correction history…
      </div></QueryReadBoundary>
    );
  }

  if (error) {
    return (
      <QueryReadBoundary queries={[uiRead1]}><div className="flex items-center gap-2 text-sm text-destructive py-2">
        <AlertTriangle className="h-4 w-4" />
        Failed to load correction history.
      </div></QueryReadBoundary>
    );
  }

  if (proposals.length === 0) {
    return (
      <QueryReadBoundary queries={[uiRead1]}><p className="text-sm text-muted-foreground py-2">No correction proposals for this item.</p></QueryReadBoundary>
    );
  }

  return (
    <QueryReadBoundary queries={[uiRead1]}><>
      {cancelError && <p role="alert" className="text-sm text-destructive">{cancelError}</p>}
      <div className="space-y-3">
        {<RecordCollection presentation="embedded" id="special.dms-apply-correction-history" rows={proposals} fields={[{"id":"id","path":"id","label":"Proposal"},{"id":"status","path":"status","label":"Status"},{"id":"created_at","path":"created_at","label":"Created"}]} renderRecord={(proposal) => (
          <CorrectionHistoryRow
            key={proposal.id}
            proposal={proposal}
            onReview={() => setConfirmingProposal(proposal)}
            onCancel={() => handleCancel(proposal.id)}
            isCancelling={cancellingId === proposal.id}
            actionPending={cancellingId !== null || uncertainCancelId !== null}
            retryCancel={uncertainCancelId === proposal.id}
          />
        )} />}
      </div>

      {/* Apply confirmation dialog */}
      {confirmingProposal && (
        <DmsApplyCorrectionConfirmDialog
          open={true}
          onOpenChange={(open) => {
            // The confirm dialog closes only after its apply/cancel is confirmed.
            // Both paths change history, including the owning apply-run status.
            if (!open) {
              setConfirmingProposal(null);
              void qc.invalidateQueries({ queryKey: queryKeys.dms.applyCorrectionProposals() });
              onChanged?.();
            }
          }}
          proposal={confirmingProposal}
        />
      )}
    </></QueryReadBoundary>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function CorrectionHistoryRow({
  proposal,
  onReview,
  onCancel,
  isCancelling,
  actionPending,
  retryCancel,
}: {
  proposal:    CorrectionProposalHistory;
  onReview:    () => void;
  onCancel:    () => void;
  isCancelling: boolean;
  actionPending: boolean;
  retryCancel: boolean;
}) {
  const canApply = proposal.status === "draft" || proposal.status === "pending_confirmation";
  const canCancel = canApply;

  return (
    <div className="rounded-md border border-border bg-card text-card-foreground p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <DmsApplyCorrectionStatusBadge status={proposal.status} />
            <span className="text-xs text-muted-foreground font-mono break-all">
              {proposal.proposal_code ?? `#${proposal.id}`}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">{proposal.target_table}.{proposal.target_field}</span>
            {proposal.target_record_id && (
              <span className="ml-1">— Record #{proposal.target_record_id}</span>
            )}
          </p>
          <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 text-xs text-foreground break-words">
            <span>
              <span className="text-muted-foreground">Before:</span>{" "}
              {proposal.original_before_summary ?? "(empty)"}
            </span>
            <span>
              <span className="text-muted-foreground">Correction:</span>{" "}
              {proposal.proposed_correction_summary ?? "(none)"}
            </span>
          </div>
          {proposal.conflict_reason && (
            <p className="mt-1.5 text-xs text-destructive">
              Conflict: {proposal.conflict_reason}
            </p>
          )}
          <p className="mt-1.5 text-xs text-muted-foreground">
            {new Date(proposal.created_at).toLocaleString()}
            {" · "}
            Mode: {proposal.correction_mode.replace(/_/g, " ")}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {canApply && (
            <Button size="sm" variant="outline" onClick={onReview} disabled={actionPending}>
              Review Correction
            </Button>
          )}
          {canCancel && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onCancel}
              disabled={isCancelling || (actionPending && !retryCancel)}
              aria-label={retryCancel ? "Retry cancellation" : "Cancel correction proposal"}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              {isCancelling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
