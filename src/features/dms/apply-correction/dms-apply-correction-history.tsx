"use client";

/**
 * DMS Apply Correction — History
 *
 * Shows correction proposals related to a document or apply item.
 * Read-only display + Cancel action.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DmsApplyCorrectionStatusBadge } from "./dms-apply-correction-status-badge";
import { DmsApplyCorrectionConfirmDialog } from "./dms-apply-correction-confirm-dialog";
import { queryKeys } from "@/lib/query/query-keys";
import { listApplyCorrectionProposals, cancelApplyCorrectionProposal } from "@/server/actions/dms/apply-correction";
import type { CorrectionProposalRow } from "@/lib/dms/apply-correction/types";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  documentId?: number | null;
  targetTable?: string;
  targetRecordId?: number | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DmsApplyCorrectionHistory({ documentId, targetTable, targetRecordId }: Props) {
  const qc = useQueryClient();
  const [confirmingProposal, setConfirmingProposal] = useState<CorrectionProposalRow | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const { data: proposals = [], isLoading, error } = useQuery({
    queryKey: queryKeys.dms.applyCorrectionProposals({ documentId, targetTable, targetRecordId }),
    queryFn: async () => {
      const result = await listApplyCorrectionProposals({
        documentId:    documentId ?? undefined,
        targetTable:   targetTable ?? undefined,
        targetRecordId: targetRecordId ?? undefined,
      });
      if (!result.success) return [];
      return result.data as CorrectionProposalRow[];
    },
    enabled: !!(documentId || (targetTable && targetRecordId)),
    staleTime: 30_000,
  });

  const handleCancel = async (proposalId: number) => {
    setCancellingId(proposalId);
    try {
      const result = await cancelApplyCorrectionProposal(proposalId);
      if (result.success) {
        void qc.invalidateQueries({
          queryKey: queryKeys.dms.applyCorrectionProposals({}),
        });
      }
    } finally {
      setCancellingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading correction history…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600 py-2">
        <AlertTriangle className="h-4 w-4" />
        Failed to load correction history.
      </div>
    );
  }

  if (proposals.length === 0) {
    return (
      <p className="text-sm text-slate-500 py-2">No correction proposals for this item.</p>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {proposals.map((proposal) => (
          <CorrectionHistoryRow
            key={proposal.id}
            proposal={proposal}
            onReview={() => setConfirmingProposal(proposal)}
            onCancel={() => handleCancel(proposal.id)}
            isCancelling={cancellingId === proposal.id}
          />
        ))}
      </div>

      {/* Apply confirmation dialog */}
      {confirmingProposal && (
        <DmsApplyCorrectionConfirmDialog
          open={true}
          onOpenChange={(open) => { if (!open) setConfirmingProposal(null); }}
          proposal={confirmingProposal}
          onApplied={() => {
            setConfirmingProposal(null);
            void qc.invalidateQueries({
              queryKey: queryKeys.dms.applyCorrectionProposals({}),
            });
          }}
        />
      )}
    </>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function CorrectionHistoryRow({
  proposal,
  onReview,
  onCancel,
  isCancelling,
}: {
  proposal:    CorrectionProposalRow;
  onReview:    () => void;
  onCancel:    () => void;
  isCancelling: boolean;
}) {
  const canApply = proposal.status === "draft" || proposal.status === "pending_confirmation";
  const canCancel = canApply;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <DmsApplyCorrectionStatusBadge status={proposal.status} />
            <span className="text-xs text-slate-400 font-mono">
              {proposal.proposal_code ?? `#${proposal.id}`}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            <span className="font-mono">{proposal.target_table}.{proposal.target_field}</span>
            {proposal.target_record_id && (
              <span className="ml-1">— Record #{proposal.target_record_id}</span>
            )}
          </p>
          <div className="mt-1.5 grid grid-cols-2 gap-x-4 text-xs text-slate-600">
            <span>
              <span className="text-slate-400">Before:</span>{" "}
              {proposal.original_before_summary ?? "(empty)"}
            </span>
            <span>
              <span className="text-slate-400">Correction:</span>{" "}
              {proposal.proposed_correction_summary ?? "(none)"}
            </span>
          </div>
          {proposal.conflict_reason && (
            <p className="mt-1.5 text-xs text-red-600">
              Conflict: {proposal.conflict_reason}
            </p>
          )}
          <p className="mt-1.5 text-xs text-slate-400">
            {new Date(proposal.created_at).toLocaleString()}
            {" · "}
            Mode: {proposal.correction_mode.replace(/_/g, " ")}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {canApply && (
            <Button size="sm" variant="outline" onClick={onReview}>
              Review Correction
            </Button>
          )}
          {canCancel && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onCancel}
              disabled={isCancelling}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
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
