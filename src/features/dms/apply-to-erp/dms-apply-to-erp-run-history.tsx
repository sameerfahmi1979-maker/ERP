"use client";

import { useState, useEffect, useCallback } from "react";
import { History, ChevronDown, ChevronRight, RefreshCw, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DmsApplyRunStatusBadge, DmsApplyItemStatusBadge } from "./dms-apply-status-badge";
import { listDmsApplyToErpRuns, getDmsApplyToErpRun } from "@/server/actions/dms/apply-to-erp";
import type { DmsErpApplyRun, DmsErpApplyItem } from "@/lib/dms/apply-to-erp/types";
import { formatDistanceToNow, parseISO } from "date-fns";
import { DmsApplyCorrectionDrawer } from "@/features/dms/apply-correction/dms-apply-correction-drawer";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  documentId?:         number;
  className?:          string;
  /**
   * Phase 17 — When true, shows "Propose Correction" button for applied items.
   * Parent must gate this on DMS_AI_APPLY_CORRECTION_PROPOSALS feature flag
   * and dms.apply_correction.create permission.
   */
  correctionEnabled?:  boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DmsApplyToErpRunHistory({ documentId, className, correctionEnabled }: Props) {
  const [runs, setRuns] = useState<DmsErpApplyRun[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);
  const [expandedRun, setExpandedRun] = useState<DmsErpApplyRun | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Phase 17 — Propose Correction drawer state
  const [correctionItemId, setCorrectionItemId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await listDmsApplyToErpRuns({ documentId, pageSize: 20 });
    if (result.success && result.data) {
      setRuns(result.data.runs);
      setTotal(result.data.total);
    }
    setLoading(false);
  }, [documentId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const handleExpand = async (runId: number) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      setExpandedRun(null);
      return;
    }
    setExpandedRunId(runId);
    setExpandedRun(null);
    setLoadingDetail(true);
    const result = await getDmsApplyToErpRun(runId);
    if (result.success && result.data) {
      setExpandedRun(result.data);
    }
    setLoadingDetail(false);
  };

  if (!loading && runs.length === 0) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <History className="h-4 w-4" />
          <span className="font-medium">Apply History</span>
        </div>
        <p className="text-xs text-muted-foreground italic">No apply runs found.</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm">
          <History className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Apply History</span>
          {total > 0 && <span className="text-xs text-muted-foreground">({total})</span>}
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="h-7 gap-1.5 text-xs">
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Phase 17 — Propose Correction drawer */}
      {correctionEnabled && correctionItemId && (
        <DmsApplyCorrectionDrawer
          open={true}
          onOpenChange={(open) => { if (!open) setCorrectionItemId(null); }}
          applyItemId={correctionItemId}
          onProposed={() => {
            // Do NOT clear correctionItemId here — the drawer transitions to the
            // confirmation dialog internally. Clearing it would unmount the drawer
            // and destroy confirmProposal state before the dialog can render.
            // The drawer's onOpenChange closes it only after confirmation is done.
            void load();
          }}
        />
      )}

      <div className="space-y-2">
        {runs.map((run) => (
          <div key={run.id} className="rounded-md border bg-card overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
              onClick={() => handleExpand(run.id)}
            >
              <div className="flex items-center gap-3 min-w-0">
                {expandedRunId === run.id
                  ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                }
                <div className="min-w-0">
                  <div className="text-xs font-mono text-muted-foreground truncate">
                    {run.runCode ?? `RUN #${run.id}`}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {run.targetTable} · {run.sourceType.replace(/_/g, " ")}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <DmsApplyRunStatusBadge status={run.status} />
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(parseISO(run.createdAt), { addSuffix: true })}
                </span>
              </div>
            </button>

            {expandedRunId === run.id && (
              <div className="border-t bg-muted/20 px-3 py-2">
                {loadingDetail && !expandedRun ? (
                  <p className="text-xs text-muted-foreground">Loading…</p>
                ) : expandedRun ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                      <div>Applied: <span className="text-green-700 font-medium">{expandedRun.items.filter(i => i.status === "applied").length}</span></div>
                      <div>Skipped: <span className="font-medium">{expandedRun.items.filter(i => i.status === "skipped").length}</span></div>
                      <div>Conflict: <span className="text-amber-700 font-medium">{expandedRun.items.filter(i => i.status === "conflict").length}</span></div>
                      <div>Failed: <span className="text-red-700 font-medium">{expandedRun.items.filter(i => i.status === "failed").length}</span></div>
                    </div>
                    {expandedRun.items.length > 0 && (
                      <div className="space-y-1">
                        {expandedRun.items.map((item) => (
                          <ApplyItemRow
                            key={item.id}
                            item={item}
                            correctionEnabled={correctionEnabled}
                            onProposeCorrection={(itemId) => setCorrectionItemId(itemId)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Failed to load run details.</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Apply item row (Phase 17: with optional Propose Correction button) ────────

function ApplyItemRow({
  item,
  correctionEnabled,
  onProposeCorrection,
}: {
  item:                DmsErpApplyItem;
  correctionEnabled?:  boolean;
  onProposeCorrection: (itemId: number) => void;
}) {
  const showCorrectionBtn =
    correctionEnabled === true &&
    item.status === "applied";

  return (
    <div className="flex items-center justify-between gap-2 text-xs rounded px-2 py-1 bg-background border">
      <div className="min-w-0 flex-1">
        <span className="font-medium">{item.targetDisplayLabel ?? `${item.targetField}`}</span>
        {item.appliedValueSummary && (
          <span className="text-muted-foreground ml-1.5">→ {item.appliedValueSummary}</span>
        )}
        {item.skipReason && (
          <span className="text-muted-foreground ml-1.5 italic">({item.skipReason})</span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <DmsApplyItemStatusBadge status={item.status} />
        {showCorrectionBtn && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs gap-1 text-slate-600 hover:text-slate-900"
            onClick={() => onProposeCorrection(item.id)}
            title="Propose a correction for this applied field"
          >
            <Pencil className="h-3 w-3" />
            Propose Correction
          </Button>
        )}
      </div>
    </div>
  );
}
