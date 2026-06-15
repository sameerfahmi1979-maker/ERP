"use client";

/**
 * DMS.10 — DmsDocumentAiSection
 *
 * Shows AI classification and extraction suggestions for a document.
 * AI results are SUGGESTIONS only — nothing is auto-saved.
 * Human review and final save happens in DMS.11.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Brain,
  RefreshCw,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/lib/query/query-keys";
import { invalidateDmsAiAnalysis } from "@/lib/query/invalidation";
import {
  getDmsAiAnalysisStatus,
  getDmsAiExtractionResults,
  runDmsAiAnalysisForDocument,
  retryDmsAiAnalysisJob,
  markDmsAiResultSuperseded,
  type DmsAiResultRow,
} from "@/server/actions/dms/ai-analysis";
import { DmsAiConfidenceBadge } from "@/features/dms/ai/dms-ai-confidence-badge";
import { format, parseISO } from "date-fns";

interface DmsDocumentAiSectionProps {
  documentId: number;
  canRun?: boolean;
  canView?: boolean;
}

export function DmsDocumentAiSection({
  documentId,
  canRun = false,
  canView = true,
}: DmsDocumentAiSectionProps) {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [expandedResult, setExpandedResult] = useState<number | null>(null);

  // AI status query
  const { data: aiStatus, isLoading: statusLoading } = useQuery({
    queryKey: queryKeys.dms.documentAiStatus(documentId),
    queryFn: async () => {
      const r = await getDmsAiAnalysisStatus(documentId);
      if (!r.success) throw new Error(r.error);
      return r.data!;
    },
    staleTime: 15_000,
  });

  // AI results query
  const { data: results = [], isLoading: resultsLoading } = useQuery({
    queryKey: queryKeys.dms.documentAiResults(documentId),
    queryFn: async () => {
      const r = await getDmsAiExtractionResults(documentId);
      if (!r.success) throw new Error(r.error);
      return r.data ?? [];
    },
    enabled: canView,
    staleTime: 15_000,
  });

  const handleRunAnalysis = async () => {
    setRunning(true);
    try {
      const result = await runDmsAiAnalysisForDocument({ documentId, jobType: "classify_extract" });
      if (result.success) {
        toast.success(result.data?.message ?? "AI analysis complete");
      } else {
        toast.error(result.error ?? "AI analysis failed");
      }
      invalidateDmsAiAnalysis(queryClient, documentId);
    } finally {
      setRunning(false);
    }
  };

  const handleRetry = async (jobId: number) => {
    const r = await retryDmsAiAnalysisJob(jobId);
    if (r.success) {
      toast.success(r.data?.message ?? "AI analysis retried");
    } else {
      toast.error(r.error ?? "Retry failed");
    }
    invalidateDmsAiAnalysis(queryClient, documentId);
  };

  const handleSupersede = async (resultId: number) => {
    const r = await markDmsAiResultSuperseded(resultId);
    if (r.success) {
      toast.success("AI result marked as superseded");
    } else {
      toast.error(r.error ?? "Failed to supersede result");
    }
    invalidateDmsAiAnalysis(queryClient, documentId);
  };

  if (statusLoading || resultsLoading) {
    return (
      <div className="py-8 flex items-center justify-center text-sm text-muted-foreground">
        Loading AI analysis…
      </div>
    );
  }

  const latestResult = aiStatus?.latest_result ?? null;
  const hasPendingJob = (aiStatus?.pending_jobs ?? 0) > 0;

  return (
    <div className="space-y-5">
      {/* ── Header bar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-xs text-muted-foreground">AI Analysis Status</p>
            <div className="flex items-center gap-2 mt-0.5">
              <AiStatusBadge status={aiStatus?.ai_status} />
              {hasPendingJob && (
                <span className="text-[11px] text-blue-600 dark:text-blue-400 animate-pulse">
                  Analysis running…
                </span>
              )}
            </div>
          </div>
        </div>

        {canRun && (
          <Button
            size="sm"
            variant="outline"
            disabled={running || hasPendingJob}
            onClick={handleRunAnalysis}
            className="gap-2"
          >
            {running
              ? <div className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
              : <Brain className="h-3.5 w-3.5" />}
            {running ? "Analyzing…" : latestResult ? "Re-run AI Analysis" : "Run AI Analysis"}
          </Button>
        )}
      </div>

      {/* ── No results yet ── */}
      {!latestResult && !hasPendingJob && (
        <div className="rounded-md border border-border p-6 flex flex-col items-center gap-2 text-sm text-muted-foreground">
          <Brain className="h-8 w-8 opacity-20" />
          <p className="font-medium">No AI analysis results yet</p>
          <p className="text-xs text-center max-w-sm">
            {canRun
              ? "Click \"Run AI Analysis\" — the AI will read the uploaded files, classify the document type, and suggest metadata field values in one step."
              : "AI analysis has not been run for this document."}
          </p>
          {!aiStatus?.has_results && !canView && null}
        </div>
      )}

      {/* ── Latest Result card ── */}
      {latestResult && (
        <AiResultCard
          result={latestResult}
          expanded={expandedResult === latestResult.id}
          onToggle={() => setExpandedResult(expandedResult === latestResult.id ? null : latestResult.id)}
          onRetry={canRun ? () => handleRetry(latestResult.job_id) : undefined}
          onSupersede={canRun ? () => handleSupersede(latestResult.id) : undefined}
          isLatest
        />
      )}

      {/* ── Historical results (collapsed list) ── */}
      {results.length > 1 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Previous Results ({results.length - 1})
          </p>
          {results.slice(1).map((r) => (
            <AiResultCard
              key={r.id}
              result={r}
              expanded={expandedResult === r.id}
              onToggle={() => setExpandedResult(expandedResult === r.id ? null : r.id)}
              onSupersede={canRun && r.ai_status === "pending_review" ? () => handleSupersede(r.id) : undefined}
            />
          ))}
        </div>
      )}

      {/* ── Info notice ── */}
      <div className="flex items-start gap-2 rounded-md border border-border/50 bg-muted/20 px-3 py-2">
        <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          The AI reads uploaded files directly — no separate OCR step needed.
          Results are <strong>suggestions only</strong> and are never saved automatically.
          Accept and apply suggestions in the DMS.11 AI Review Queue (coming next).
        </p>
      </div>
    </div>
  );
}

// ── AiStatusBadge ─────────────────────────────────────────────────────────────

function AiStatusBadge({ status }: { status: string | undefined }) {
  const styles: Record<string, string> = {
    not_required: "bg-slate-100 text-slate-500 border-slate-200",
    pending:      "bg-amber-100 text-amber-700 border-amber-200",
    processing:   "bg-blue-100 text-blue-700 border-blue-200",
    completed:    "bg-green-100 text-green-700 border-green-200",
    failed:       "bg-red-100 text-red-700 border-red-200",
  };
  const labels: Record<string, string> = {
    not_required: "Not Run",
    pending:      "Pending",
    processing:   "Processing",
    completed:    "Completed",
    failed:       "Failed",
  };
  const key = status ?? "not_required";
  const style = styles[key] ?? styles.not_required;
  const label = labels[key] ?? key;

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style}`}>
      {label}
    </span>
  );
}

// ── AiResultCard ──────────────────────────────────────────────────────────────

interface AiResultCardProps {
  result: DmsAiResultRow;
  expanded: boolean;
  onToggle: () => void;
  onRetry?: () => void;
  onSupersede?: () => void;
  isLatest?: boolean;
}

function AiResultCard({ result, expanded, onToggle, onRetry, onSupersede, isLatest }: AiResultCardProps) {
  const fields = Object.entries(result.extracted_fields_json ?? {});
  const confidence = result.field_confidence_json as Record<string, { score: number; label: string; source_snippet: string | null }> | null;
  const links = (result.suggested_links_json ?? []) as Array<{ entityType?: string; entityName?: string | null; reason?: string; confidenceScore?: number; confidence_score?: number }>;
  const warnings = (result.raw_response_json as { warnings?: string[] } | null)?.warnings ?? [];

  return (
    <div className={`rounded-md border overflow-hidden ${result.ai_status === "superseded" ? "opacity-50 border-border/40" : "border-border"}`}>
      {/* Card header — split into a clickable toggle area + separate action buttons to avoid nested <button> */}
      <div className="w-full flex items-center justify-between bg-muted/20 hover:bg-muted/30 transition-colors">
        {/* Toggle region */}
        <div
          role="button"
          tabIndex={0}
          className="flex-1 flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer min-w-0"
          onClick={onToggle}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        >
          <Brain className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {isLatest && <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">Latest</span>}
              <span className="text-sm font-medium">
                {result.suggested_type?.name_en
                  ? `Suggested: ${result.suggested_type.name_en}`
                  : "AI Result"}
              </span>
              {result.classification_confidence && (
                <DmsAiConfidenceBadge
                  label={result.classification_confidence}
                  score={result.classification_score}
                />
              )}
              <AiResultStatusBadge status={result.ai_status} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {format(parseISO(result.created_at), "dd MMM yyyy HH:mm")}
              {fields.length > 0 && ` · ${fields.length} field${fields.length !== 1 ? "s" : ""} extracted`}
            </p>
          </div>
        </div>
        {/* Action buttons — outside the toggle div to avoid nested interactive elements */}
        <div className="flex items-center gap-1 px-2 shrink-0">
          {onRetry && result.ai_status !== "superseded" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1"
              onClick={onRetry}
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </Button>
          )}
          {onSupersede && result.ai_status === "pending_review" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1 text-muted-foreground"
              onClick={onSupersede}
            >
              Supersede
            </Button>
          )}
          <div
            role="button"
            tabIndex={-1}
            aria-hidden
            className="p-1 cursor-pointer"
            onClick={onToggle}
          >
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
      </div>

      {/* Card body */}
      {expanded && (
        <div className="p-3 space-y-4 border-t border-border/50">
          {/* Classification */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Classification</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{result.suggested_type?.name_en ?? result.suggested_type?.type_code ?? "No suggestion"}</span>
              {result.classification_confidence && (
                <DmsAiConfidenceBadge label={result.classification_confidence} score={result.classification_score} />
              )}
            </div>
            {result.classification_reason && (
              <p className="text-xs text-muted-foreground italic">{result.classification_reason}</p>
            )}
          </div>

          {/* Suggested title / description */}
          {(result.suggested_title || result.suggested_description) && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Suggested Content</p>
              {result.suggested_title && (
                <div className="flex items-start gap-2">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">Title</span>
                  <span className="text-xs font-medium">{result.suggested_title}</span>
                </div>
              )}
              {result.suggested_description && (
                <div className="flex items-start gap-2">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">Description</span>
                  <span className="text-xs">{result.suggested_description}</span>
                </div>
              )}
            </div>
          )}

          {/* Extracted fields */}
          {fields.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Suggested Field Values ({fields.length})
              </p>
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Field</th>
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Suggested Value</th>
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Confidence</th>
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {fields.map(([fieldCode, value]) => {
                      const conf = confidence?.[fieldCode];
                      return (
                        <tr key={fieldCode} className="hover:bg-muted/10">
                          <td className="px-3 py-1.5 font-mono text-muted-foreground">{fieldCode}</td>
                          <td className="px-3 py-1.5 font-medium">{String(value)}</td>
                          <td className="px-3 py-1.5">
                            {conf ? (
                              <DmsAiConfidenceBadge label={conf.label} score={conf.score} />
                            ) : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground italic truncate max-w-[160px]">
                            {conf?.source_snippet ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                These are AI suggestions. Accept them in DMS.11 to save them to this document.
              </p>
            </div>
          )}

          {/* Expiry date suggestion */}
          {result.expiry_date_suggestion && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Suggested Expiry:</span>
              <span className="text-xs font-medium">{result.expiry_date_suggestion}</span>
              <DmsAiConfidenceBadge label="medium" />
            </div>
          )}

          {/* Suggested links */}
          {links.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Suggested Links</p>
              <ul className="space-y-0.5">
                {links.map((l, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <RefreshCw className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{l.entityType}: {l.entityName ?? "—"}</span>
                    <DmsAiConfidenceBadge label="medium" score={l.confidenceScore ?? l.confidence_score} />
                    <span className="text-muted-foreground italic">{l.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">Warnings</p>
              <ul className="space-y-0.5">
                {warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                    <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AiResultStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending_review: "bg-amber-100 text-amber-700 border-amber-200",
    accepted:       "bg-green-100 text-green-700 border-green-200",
    rejected:       "bg-red-100 text-red-700 border-red-200",
    superseded:     "bg-gray-100 text-gray-500 border-gray-200",
  };
  const labels: Record<string, string> = {
    pending_review: "Pending Review",
    accepted:       "Accepted",
    rejected:       "Rejected",
    superseded:     "Superseded",
  };
  const style = styles[status] ?? styles.pending_review;
  const label = labels[status] ?? status;
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${style}`}>
      {label}
    </span>
  );
}
