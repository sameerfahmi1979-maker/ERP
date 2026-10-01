"use client";
import { DmsListTools, useDmsListView, type DmsListField } from "@/features/dms/dms-list-view";
import { ConfiguredRow } from "@/components/erp/table/list-controls";

import { useState, useTransition, useCallback, useRef } from "react";
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
  sortDir,
  onSort,
  align = "left",
  "data-column": columnId,
}: {
  "data-column"?: string;
  label: string;
  colKey: SortableColKey;
  sortDir: SortDir | null;
  onSort: (key: string) => void;
  align?: "left" | "right";
}) {
  return (
    <th data-column={columnId} aria-sort={sortDir === "asc" ? "ascending" : sortDir === "desc" ? "descending" : "none"}
      className="relative select-none px-3 py-2 font-medium"
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
    </th>
  );
}

const BATCH_FIELDS: DmsListField[] = [{"id":"selection","label":"Selection","required":true,"width":48},{"id":"index","label":"Row","width":48},{"id":"title","label":"File / AI title","path":"searchTitle","required":true,"width":260},{"id":"docNo","label":"Document number","path":"documentNo","width":160},{"id":"type","label":"Type","path":"documentTypeName","width":160},{"id":"confidence","label":"Confidence","path":"confidenceLabel","width":140},{"id":"status","label":"Status","path":"searchStatus","width":160},{"id":"actions","label":"Actions","required":true,"width":180}];

export function DmsBatchReviewQueueClient({ batch, initialDrafts }: Props) {
  const router = useRouter();
  const { openTab } = useWorkspace();
  const batchReviewRoute = `/dms/inbox/batch/${batch.batch_code}`;
  const drafts = initialDrafts;
  const listView = useDmsListView(`batch-review:${batch.id}`, drafts.map(d => ({ ...d, searchTitle: `${d.aiTitle ?? ""} ${d.originalFilename}`, searchStatus: draftStatusSortLabel(d) })), BATCH_FIELDS);
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const flight = useRef(false);
  const [failure, setFailure] = useState<string | null>(null);

  // ── Sorting (click column header) ──────────────────────────────────────
  const draftsTable = useSortPaginate(listView.rows, {
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

  // Width, visibility and ordering use the shared keyboard-accessible column editor.

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
  const discardableIds = listView.rows.filter(isDiscardable).map((d) => d.sessionId);
  const allDiscardableSelected = discardableIds.length > 0 && discardableIds.every((id) => selected.has(id));

  const selectedCount = discardableIds.filter(id => selected.has(id)).length;
  const [isOrchRunning, setIsOrchRunning] = useState(false);

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  const handleRunBatchOrchestration = useCallback(async () => {
    if (flight.current) return;
    flight.current = true; setFailure(null);
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
        setFailure("The AI pipeline did not complete. Refresh the batch before retrying.");
      }
    } catch {
      setFailure("The AI pipeline could not be confirmed. Refresh the batch before retrying.");
    } finally {
      setIsOrchRunning(false);
      flight.current = false;
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
    if (flight.current) return;
    const ids = Array.from(selected).filter((id) => discardableIds.includes(id));
    if (ids.length === 0) return;
    if (!window.confirm(`Discard ${ids.length} selected draft${ids.length === 1 ? "" : "s"}? This permanently removes the draft document(s) and uploaded file(s) and cannot be undone.`)) {
      return;
    }
    startTransition(async () => {
      flight.current = true; setFailure(null);
      try {
      const res = await discardDraftIntakeBulk({ uploadSessionIds: ids });
      if (res.success && res.data) {
        const { discarded: ok, failed: bad } = res.data;
        if (bad > 0) toast.warning(`Discarded ${ok}, ${bad} failed`);
        else toast.success(`Discarded ${ok} draft${ok === 1 ? "" : "s"}`);
        setSelected(new Set());
        router.refresh();
      } else {
        setFailure("Selected drafts were not discarded. Refresh the batch and check your access.");
      }
      } catch { setFailure("Discard could not be confirmed. Refresh the batch before retrying."); }
      finally { flight.current = false; }
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
    if (flight.current) return;
    flight.current = true; setFailure(null);
    setBusyId(-1);
    startTransition(async () => {
      try {
      const res = await getNextPendingDraftInBatch(batch.id);
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
        setFailure("Could not load the next draft. Try refreshing the batch.");
      }
      } catch { setFailure("Could not load the next draft. Try refreshing the batch."); }
      finally { flight.current = false; setBusyId(null); }
    });
  }, [batch.id, openTab, batchReviewRoute]);

  const handleDiscard = useCallback((sessionId: number) => {
    if (flight.current || !window.confirm("Discard this draft and its uploaded file? This cannot be undone.")) return;
    flight.current = true; setFailure(null);
    setBusyId(sessionId);
    startTransition(async () => {
      try {
      const res = await discardDraftIntake({ uploadSessionId: sessionId });
      if (res.success) {
        toast.success("Draft discarded");
        router.refresh();
      } else {
        setFailure("The draft was not discarded. Refresh the batch and check your access.");
      }
      } catch { setFailure("Discard could not be confirmed. Refresh the batch before retrying."); }
      finally { flight.current = false; setBusyId(null); }
    });
  }, [router]);

  const handleRerun = useCallback((sessionId: number) => {
    if (flight.current) return;
    flight.current = true; setFailure(null);
    setBusyId(sessionId);
    startTransition(async () => {
      try {
      const res = await rerunBatchDraftAi(sessionId);
      if (res.success) {
        toast.success("AI re-run started");
        router.refresh();
      } else {
        setFailure("AI could not be restarted. Refresh the batch and check your access.");
      }
      } catch { setFailure("The AI request could not be confirmed. Refresh the batch before retrying."); }
      finally { flight.current = false; setBusyId(null); }
    });
  }, [router]);

  return (
    <div className="space-y-5">
      {failure && <p role="alert" className="rounded-sm border border-destructive p-3 text-sm text-destructive">{failure}</p>}
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
            <Button aria-label="Run full AI pipeline (summary, intelligence, embedding, tags, links) on all pending drafts. One-by-one approval is still required."
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

            {selectedCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={handleBulkDiscard}
                disabled={isPending}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Discard Selected ({selectedCount})
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
      <DmsListTools view={listView} search />
      <div role="region" aria-label="Batch drafts" tabIndex={0} className="rounded-sm border bg-card max-w-full overflow-x-auto">
        <table className="w-full text-sm table-fixed" style={{ minWidth: listView.visible.reduce((sum,c)=>sum+c.width,0) }}>
          <colgroup>{listView.visible.map(c=><col key={c.id} style={{width:c.width}} />)}</colgroup>
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <ConfiguredRow columns={listView.columns}>
              <th data-column="selection" className="px-3 py-2">
                <Checkbox
                  checked={allDiscardableSelected}
                  onCheckedChange={(checked) => toggleAll(checked === true)}
                  disabled={isPending || discardableIds.length === 0}
                  aria-label="Select all discardable drafts"
                />
              </th>
              <th data-column="index" className="text-left font-medium px-3 py-2">#</th>
              <SortableTh data-column="title"
                label="File / AI Title"
                colKey="title"
                sortDir={draftsTable.sortDirFor("title")}
                onSort={draftsTable.toggleSort}
              />
              <SortableTh data-column="docNo"
                label="Doc No."
                colKey="docNo"
                sortDir={draftsTable.sortDirFor("docNo")}
                onSort={draftsTable.toggleSort}
              />
              <SortableTh data-column="type"
                label="Type"
                colKey="type"
                sortDir={draftsTable.sortDirFor("type")}
                onSort={draftsTable.toggleSort}
              />
              <SortableTh data-column="confidence"
                label="Confidence"
                colKey="confidence"
                sortDir={draftsTable.sortDirFor("confidence")}
                onSort={draftsTable.toggleSort}
              />
              <SortableTh data-column="status"
                label="Status"
                colKey="status"
                sortDir={draftsTable.sortDirFor("status")}
                onSort={draftsTable.toggleSort}
              />
              <th data-column="actions" className="text-right font-medium px-3 py-2">Actions</th>
            </ConfiguredRow>
          </thead>
          <tbody>
            {sortedDrafts.length === 0 && (
              <tr>
                <td colSpan={listView.visible.length} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {drafts.length ? "No loaded drafts match your filters." : "No files in this batch."}
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
                <ConfiguredRow columns={listView.columns} key={d.sessionId} className="border-t hover:bg-muted/20">
                  <td data-column="selection" className="px-3 py-2">
                    <Checkbox
                      checked={selected.has(d.sessionId)}
                      onCheckedChange={(checked) => toggleOne(d.sessionId, checked === true)}
                      disabled={isPending || !canDiscardRow}
                      aria-label={`Select ${d.originalFilename}`}
                    />
                  </td>
                  <td data-column="index" className="px-3 py-2 text-xs text-muted-foreground">{i + 1}</td>
                  <td data-column="title" className="px-3 py-2 min-w-0">
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
                  <td data-column="docNo" className="px-3 py-2 font-mono text-xs truncate" title={d.documentNo ?? ""}>{d.documentNo ?? "—"}</td>
                  <td data-column="type" className="px-3 py-2 text-xs truncate" title={d.documentTypeName ?? ""}>{d.documentTypeName ?? "—"}</td>
                  <td data-column="confidence" className="px-3 py-2">
                    {d.confidenceLabel ? (
                      <DmsAiConfidenceBadge label={d.confidenceLabel} score={null} />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td data-column="status" className="px-3 py-2">
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
                  <td data-column="actions" className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {isPendingReview && (
                        <Button aria-label="Review & Approve this draft"
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
                        <Button aria-label="Re-run AI for this draft"
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
                        <Button aria-label="Discard this draft"
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
                </ConfiguredRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
