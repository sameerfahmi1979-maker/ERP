"use client";

import { useState, useTransition, useCallback, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useWorkspace } from "@/hooks/use-workspace";
import { useSortPaginate, type SortDir } from "@/hooks/use-sort-paginate";
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ArrowRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileText,
  AlertTriangle,
  Layers,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DmsDocumentStatusBadge } from "@/features/dms/documents/dms-document-status-badge";
import { DmsAiConfidenceBadge } from "@/features/dms/ai/dms-ai-confidence-badge";
import { cn } from "@/lib/utils";
import {
  discardDraftIntake,
  discardDraftIntakeBulk,
  rerunBatchDraftAi,
  getNextPendingDraftInBatch,
  type DmsUploadBatchRow,
  type DmsBatchDraftRow,
} from "@/server/actions/dms/batch-intake";
import { runDmsBatchOrchestration } from "@/server/actions/dms/orchestration";
import { Sparkles } from "lucide-react";

interface Props {
  batch: DmsUploadBatchRow;
  initialDrafts: DmsBatchDraftRow[];
}

const BATCH_STATUS_STYLES: Record<string, string> = {
  processing: "bg-blue-100 text-blue-700 border-blue-200",
  ready_for_review: "bg-amber-100 text-amber-700 border-amber-200",
  partially_approved: "bg-violet-100 text-violet-700 border-violet-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-200",
};

function StatCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", tone)}>{value}</p>
    </div>
  );
}

// ── Resizable / sortable column widths ──────────────────────────────────────
// Draft rows: File/AI Title, Doc No., Type, Confidence, Status are user-
// resizable and sortable. Checkbox / # / Actions stay fixed-width.
type SortableColKey = "title" | "docNo" | "type" | "confidence" | "status";

const DEFAULT_COL_WIDTHS: Record<SortableColKey, number> = {
  title: 200,
  docNo: 110,
  type: 130,
  confidence: 100,
  status: 120,
};

const MIN_COL_WIDTH = 70;

const CONFIDENCE_RANK: Record<string, number> = {
  needs_manual_review: 0,
  low: 1,
  medium: 2,
  high: 3,
};

function draftStatusSortLabel(d: DmsBatchDraftRow): string {
  if (d.intakeStatus === "failed") return "Failed";
  if (d.intakeStatus === "discarded") return "Discarded";
  if (d.documentStatus) return d.documentStatus;
  return "Processing";
}

function SortableTh({
  label,
  colKey,
  width,
  sortDir,
  onSort,
  onResizeStart,
  align = "left",
}: {
  label: string;
  colKey: SortableColKey;
  width: number;
  sortDir: SortDir | null;
  onSort: (key: string) => void;
  onResizeStart: (key: SortableColKey, e: ReactMouseEvent) => void;
  align?: "left" | "right";
}) {
  return (
    <th
      className="relative select-none px-3 py-2 font-medium"
      style={{ width }}
    >
      <button
        type="button"
        onClick={() => onSort(colKey)}
        className={cn(
          "flex items-center gap-1 hover:text-foreground transition-colors",
          align === "right" ? "ml-auto" : "text-left"
        )}
      >
        {label}
        {sortDir === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : sortDir === "desc" ? (
          <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
      <div
        onMouseDown={(e) => onResizeStart(colKey, e)}
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none hover:bg-primary/50"
      />
    </th>
  );
}

export function DmsBatchReviewQueueClient({ batch, initialDrafts }: Props) {
  const router = useRouter();
  const { openTab } = useWorkspace();
  const batchReviewRoute = `/dms/inbox/batch/${batch.batch_code}`;
  const [drafts] = useState<DmsBatchDraftRow[]>(initialDrafts);
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // ── Sorting (click column header) ──────────────────────────────────────
  const draftsTable = useSortPaginate(drafts, {
    defaultPageSize: 1000,
    comparators: {
      title: (a, b) => (a.aiTitle ?? a.originalFilename).localeCompare(b.aiTitle ?? b.originalFilename),
      docNo: (a, b) => (a.documentNo ?? "").localeCompare(b.documentNo ?? ""),
      type: (a, b) => (a.documentTypeName ?? "").localeCompare(b.documentTypeName ?? ""),
      confidence: (a, b) =>
        (CONFIDENCE_RANK[(a.confidenceLabel ?? "").toLowerCase()] ?? -1) -
        (CONFIDENCE_RANK[(b.confidenceLabel ?? "").toLowerCase()] ?? -1),
      status: (a, b) => draftStatusSortLabel(a).localeCompare(draftStatusSortLabel(b)),
    },
  });
  const sortedDrafts = draftsTable.rows;

  // ── Column width adjust (drag the right edge of a header) ───────────────
  const [colWidths, setColWidths] = useState<Record<SortableColKey, number>>(DEFAULT_COL_WIDTHS);
  const resizingCol = useRef<{ key: SortableColKey; startX: number; startWidth: number } | null>(null);

  const handleResizeStart = useCallback((key: SortableColKey, e: ReactMouseEvent) => {
    e.preventDefault();
    resizingCol.current = { key, startX: e.clientX, startWidth: colWidths[key] };

    const onMove = (ev: MouseEvent) => {
      const active = resizingCol.current;
      if (!active) return;
      const nextWidth = Math.max(MIN_COL_WIDTH, active.startWidth + (ev.clientX - active.startX));
      setColWidths((prev) => ({ ...prev, [active.key]: nextWidth }));
    };
    const onUp = () => {
      resizingCol.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [colWidths]);

  const pending = drafts.filter((d) => d.documentStatus === "pending_ai_review").length;
  const approved = drafts.filter((d) => d.documentStatus === "active").length;
  const discarded = drafts.filter((d) => d.intakeStatus === "discarded").length;
  const failed = drafts.filter((d) => d.intakeStatus === "failed").length;

  // A draft can be discarded unless it's already approved (active) or discarded.
  const isDiscardable = useCallback(
    (d: DmsBatchDraftRow) =>
      d.intakeStatus !== "approved" && d.intakeStatus !== "discarded" && d.documentStatus !== "active",
    []
  );
  const discardableIds = drafts.filter(isDiscardable).map((d) => d.sessionId);
  const allDiscardableSelected = discardableIds.length > 0 && discardableIds.every((id) => selected.has(id));

  const [isOrchRunning, setIsOrchRunning] = useState(false);

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  const handleRunBatchOrchestration = useCallback(async () => {
    setIsOrchRunning(true);
    try {
      const result = await runDmsBatchOrchestration({ batchCode: batch.batch_code });
      if (result.success && result.data) {
        const { processedCount, results } = result.data;
        const completed = results.filter((r) => r.orchestrationStatus === "complete").length;
        const warnings = results.filter((r) => r.orchestrationStatus === "complete_with_warnings").length;
        const failed = results.filter((r) => r.orchestrationStatus === "failed").length;
        toast.success(`AI pipeline: ${processedCount} draft(s) processed. ${completed} complete, ${warnings} with warnings, ${failed} failed.`);
        refresh();
      } else if (result.error?.includes("not enabled")) {
        toast.info("DMS AI Orchestration is not enabled. Contact your administrator.");
      } else {
        toast.error(result.error ?? "Batch orchestration failed.");
      }
    } catch {
      toast.error("Batch AI pipeline failed.");
    } finally {
      setIsOrchRunning(false);
    }
  }, [batch.batch_code, refresh]);

  const toggleOne = useCallback((sessionId: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(sessionId);
      else next.delete(sessionId);
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (checked: boolean) => {
      setSelected(checked ? new Set(discardableIds) : new Set());
    },
    [discardableIds]
  );

  const handleBulkDiscard = useCallback(() => {
    const ids = Array.from(selected).filter((id) => discardableIds.includes(id));
    if (ids.length === 0) return;
    if (!window.confirm(`Discard ${ids.length} selected draft${ids.length === 1 ? "" : "s"}? This permanently removes the draft document(s) and uploaded file(s) and cannot be undone.`)) {
      return;
    }
    startTransition(async () => {
      const res = await discardDraftIntakeBulk({ uploadSessionIds: ids });
      if (res.success && res.data) {
        const { discarded: ok, failed: bad } = res.data;
        if (bad > 0) toast.warning(`Discarded ${ok}, ${bad} failed`);
        else toast.success(`Discarded ${ok} draft${ok === 1 ? "" : "s"}`);
        setSelected(new Set());
        router.refresh();
      } else {
        toast.error(res.error ?? "Failed to discard selected drafts");
      }
    });
  }, [selected, discardableIds, router]);

  // Opens the intake review screen in a new tab that remembers this Batch
  // Review Queue as its "return route" — so closing it (after approve or
  // discard) always comes back here instead of the Upload Inbox.
  const handleReview = useCallback((sessionCode: string) => {
    openTab({
      route: `/dms/intake/${sessionCode}`,
      tabKind: "record",
      entityType: "dms_intake_session",
      entityId: sessionCode,
      returnRoute: batchReviewRoute,
    });
  }, [openTab, batchReviewRoute]);

  const handleReviewNext = useCallback(() => {
    setBusyId(-1);
    startTransition(async () => {
      const res = await getNextPendingDraftInBatch(batch.id);
      setBusyId(null);
      if (res.success && res.data) {
        openTab({
          route: `/dms/intake/${res.data.sessionCode}`,
          tabKind: "record",
          entityType: "dms_intake_session",
          entityId: res.data.sessionCode,
          returnRoute: batchReviewRoute,
        });
      } else if (res.success && !res.data) {
        toast.info("No pending drafts remaining in this batch.");
      } else {
        toast.error(res.error ?? "Could not load the next draft");
      }
    });
  }, [batch.id, openTab, batchReviewRoute]);

  const handleDiscard = useCallback((sessionId: number) => {
    setBusyId(sessionId);
    startTransition(async () => {
      const res = await discardDraftIntake({ uploadSessionId: sessionId });
      setBusyId(null);
      if (res.success) {
        toast.success("Draft discarded");
        router.refresh();
      } else {
        toast.error(res.error ?? "Failed to discard draft");
      }
    });
  }, [router]);

  const handleRerun = useCallback((sessionId: number) => {
    setBusyId(sessionId);
    startTransition(async () => {
      const res = await rerunBatchDraftAi(sessionId);
      setBusyId(null);
      if (res.success) {
        toast.success("AI re-run started");
        router.refresh();
      } else {
        toast.error(res.error ?? "Failed to re-run AI");
      }
    });
  }, [router]);

  return (
    <div className="space-y-5">
      {/* Header / counts */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-violet-600" />
            <span className="font-mono text-sm font-semibold">{batch.batch_code}</span>
            <Badge
              variant="outline"
              className={cn("text-[10px] border", BATCH_STATUS_STYLES[batch.status] ?? "bg-slate-100 text-slate-700 border-slate-200")}
            >
              {batch.status.replace(/_/g, " ")}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {/* AI Pipeline button (ORCH.1) — runs best-effort AI on all drafts */}
            <Button
              size="sm"
              variant="outline"
              onClick={handleRunBatchOrchestration}
              disabled={isOrchRunning || isPending}
              className="border-violet-200 text-violet-700 hover:bg-violet-50 gap-1.5"
              title="Run full AI pipeline (summary, intelligence, embedding, tags, links) on all pending drafts. One-by-one approval is still required."
            >
              {isOrchRunning
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                : <Sparkles className="h-3.5 w-3.5" />
              }
              {isOrchRunning ? "Running AI…" : "Run AI Pipeline"}
            </Button>

            {selected.size > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={handleBulkDiscard}
                disabled={isPending}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Discard Selected ({selected.size})
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={handleReviewNext} disabled={isPending || pending === 0}>
              {busyId === -1 && isPending ? (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <ArrowRight className="h-3.5 w-3.5 mr-1.5" />
              )}
              Review Next Pending Draft
            </Button>
            <Button size="sm" variant="outline" onClick={refresh} disabled={isPending}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isPending && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <StatCard label="Total" value={batch.total_files} />
          <StatCard label="Processed" value={batch.processed_files} />
          <StatCard label="Pending Review" value={pending} tone="text-amber-600" />
          <StatCard label="Approved" value={approved} tone="text-green-600" />
          <StatCard label="Failed" value={failed} tone="text-destructive" />
          <StatCard label="Discarded" value={discarded} tone="text-muted-foreground" />
        </div>

        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            One-by-one approval only. Open each draft with <strong>Review &amp; Approve</strong>, verify the AI-filled
            fields, then click <strong>Approve &amp; Save</strong> inside the review screen. There is no bulk approval.
            Multi-select is available for <strong>discarding</strong> drafts only.
          </p>
        </div>
      </div>

      {/* Drafts table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-8" />
            <col className="w-8" />
            <col style={{ width: colWidths.title }} />
            <col style={{ width: colWidths.docNo }} />
            <col style={{ width: colWidths.type }} />
            <col style={{ width: colWidths.confidence }} />
            <col style={{ width: colWidths.status }} />
            <col className="w-[160px]" />
          </colgroup>
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">
                <Checkbox
                  checked={allDiscardableSelected}
                  onCheckedChange={(checked) => toggleAll(checked === true)}
                  disabled={isPending || discardableIds.length === 0}
                  aria-label="Select all discardable drafts"
                />
              </th>
              <th className="text-left font-medium px-3 py-2">#</th>
              <SortableTh
                label="File / AI Title"
                colKey="title"
                width={colWidths.title}
                sortDir={draftsTable.sortDirFor("title")}
                onSort={draftsTable.toggleSort}
                onResizeStart={handleResizeStart}
              />
              <SortableTh
                label="Doc No."
                colKey="docNo"
                width={colWidths.docNo}
                sortDir={draftsTable.sortDirFor("docNo")}
                onSort={draftsTable.toggleSort}
                onResizeStart={handleResizeStart}
              />
              <SortableTh
                label="Type"
                colKey="type"
                width={colWidths.type}
                sortDir={draftsTable.sortDirFor("type")}
                onSort={draftsTable.toggleSort}
                onResizeStart={handleResizeStart}
              />
              <SortableTh
                label="Confidence"
                colKey="confidence"
                width={colWidths.confidence}
                sortDir={draftsTable.sortDirFor("confidence")}
                onSort={draftsTable.toggleSort}
                onResizeStart={handleResizeStart}
              />
              <SortableTh
                label="Status"
                colKey="status"
                width={colWidths.status}
                sortDir={draftsTable.sortDirFor("status")}
                onSort={draftsTable.toggleSort}
                onResizeStart={handleResizeStart}
              />
              <th className="text-right font-medium px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedDrafts.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No files in this batch.
                </td>
              </tr>
            )}
            {sortedDrafts.map((d, i) => {
              const isPendingReview = d.documentStatus === "pending_ai_review";
              const isFailed = d.intakeStatus === "failed";
              const isDiscarded = d.intakeStatus === "discarded";
              const rowBusy = busyId === d.sessionId && isPending;
              const canDiscardRow = isDiscardable(d);
              return (
                <tr key={d.sessionId} className="border-t hover:bg-muted/20">
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={selected.has(d.sessionId)}
                      onCheckedChange={(checked) => toggleOne(d.sessionId, checked === true)}
                      disabled={isPending || !canDiscardRow}
                      aria-label={`Select ${d.originalFilename}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate text-xs" title={d.aiTitle ?? d.originalFilename}>
                          {d.aiTitle ?? d.originalFilename}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate" title={d.originalFilename}>
                          {d.originalFilename}
                        </p>
                      </div>
                      {d.isDuplicate && (
                        <Badge variant="outline" className="text-[9px] border-orange-300 text-orange-700 bg-orange-50 shrink-0">
                          Dup
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs truncate" title={d.documentNo ?? ""}>{d.documentNo ?? "—"}</td>
                  <td className="px-3 py-2 text-xs truncate" title={d.documentTypeName ?? ""}>{d.documentTypeName ?? "—"}</td>
                  <td className="px-3 py-2">
                    {d.confidenceLabel ? (
                      <DmsAiConfidenceBadge label={d.confidenceLabel} score={null} />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isFailed ? (
                      <Badge variant="outline" className="text-[10px] border-red-200 text-red-700 bg-red-50">Failed</Badge>
                    ) : isDiscarded ? (
                      <Badge variant="outline" className="text-[10px] border-gray-200 text-gray-600 bg-gray-50">Discarded</Badge>
                    ) : d.documentStatus ? (
                      <DmsDocumentStatusBadge status={d.documentStatus} />
                    ) : (
                      <Badge variant="outline" className="text-[10px]">Processing</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {isPendingReview && (
                        <Button
                          size="sm"
                          className="h-7 px-2 bg-green-600 hover:bg-green-700 text-white text-xs"
                          onClick={() => handleReview(d.sessionCode)}
                          disabled={isPending}
                          title="Review & Approve this draft"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Review
                        </Button>
                      )}
                      {(isPendingReview || isFailed) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 w-7 p-0"
                          onClick={() => handleRerun(d.sessionId)}
                          disabled={isPending}
                          title="Re-run AI for this draft"
                        >
                          {rowBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                      {!isDiscarded && d.documentStatus !== "active" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => handleDiscard(d.sessionId)}
                          disabled={isPending}
                          title="Discard this draft"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {d.documentStatus === "active" && d.documentId && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => openTab({
                            route: `/dms/documents/record/${d.documentId}?mode=edit`,
                            tabKind: "record",
                            entityType: "dms_document",
                            entityId: d.documentId!,
                            returnRoute: batchReviewRoute,
                          })}
                        >
                          Open
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
