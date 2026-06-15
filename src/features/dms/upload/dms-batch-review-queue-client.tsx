"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ArrowRight,
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

export function DmsBatchReviewQueueClient({ batch, initialDrafts }: Props) {
  const router = useRouter();
  const [drafts] = useState<DmsBatchDraftRow[]>(initialDrafts);
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

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

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

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

  const handleReview = useCallback((sessionCode: string) => {
    router.push(`/dms/intake/${sessionCode}`);
  }, [router]);

  const handleReviewNext = useCallback(() => {
    setBusyId(-1);
    startTransition(async () => {
      const res = await getNextPendingDraftInBatch(batch.id);
      setBusyId(null);
      if (res.success && res.data) {
        router.push(`/dms/intake/${res.data.sessionCode}`);
      } else if (res.success && !res.data) {
        toast.info("No pending drafts remaining in this batch.");
      } else {
        toast.error(res.error ?? "Could not load the next draft");
      }
    });
  }, [batch.id, router]);

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
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 w-8">
                <Checkbox
                  checked={allDiscardableSelected}
                  onCheckedChange={(checked) => toggleAll(checked === true)}
                  disabled={isPending || discardableIds.length === 0}
                  aria-label="Select all discardable drafts"
                />
              </th>
              <th className="text-left font-medium px-3 py-2 w-8">#</th>
              <th className="text-left font-medium px-3 py-2">File / AI Title</th>
              <th className="text-left font-medium px-3 py-2">Doc No.</th>
              <th className="text-left font-medium px-3 py-2">Type</th>
              <th className="text-left font-medium px-3 py-2">Confidence</th>
              <th className="text-left font-medium px-3 py-2">Status</th>
              <th className="text-right font-medium px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {drafts.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No files in this batch.
                </td>
              </tr>
            )}
            {drafts.map((d, i) => {
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
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{d.aiTitle ?? d.originalFilename}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{d.originalFilename}</p>
                      </div>
                      {d.isDuplicate && (
                        <Badge variant="outline" className="text-[9px] border-orange-300 text-orange-700 bg-orange-50 shrink-0">
                          Duplicate
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{d.documentNo ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{d.documentTypeName ?? "—"}</td>
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
                    <div className="flex items-center justify-end gap-1.5">
                      {isPendingReview && (
                        <Button
                          size="sm"
                          className="h-7 bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => handleReview(d.sessionCode)}
                          disabled={isPending}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                          Review &amp; Approve
                        </Button>
                      )}
                      {(isPendingReview || isFailed) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7"
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
                          className="h-7 text-destructive hover:text-destructive"
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
                          className="h-7"
                          onClick={() => router.push(`/dms/documents/record/${d.documentId}`)}
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
