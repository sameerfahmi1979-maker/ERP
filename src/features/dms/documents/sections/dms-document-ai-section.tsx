"use client";

/**
 * DMS.10 / Phase 6 — DmsDocumentAiSection
 *
 * Shows AI classification and extraction suggestions for a document.
 * Phase 6 adds AiMetadataDiffTable: users can select AI-suggested field values
 * and apply them to approved metadata with explicit human confirmation.
 *
 * Hard rules:
 *  - AI results are SUGGESTIONS only.
 *  - Nothing is auto-saved to metadata.
 *  - Human must select fields and confirm before any write occurs.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getApplyCorrectionAccess } from "@/server/actions/dms/apply-correction";
import { toast } from "sonner";
import {
  Brain,
  RefreshCw,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Wand2,
  Check,
  AlertTriangle,
  MinusCircle,
  Loader2,
  History,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { queryKeys } from "@/lib/query/query-keys";
import { invalidateDmsAiAnalysis } from "@/lib/query/invalidation";
import {
  getDmsAiAnalysisStatus,
  getDmsAiExtractionResults,
  runDmsAiAnalysisForDocument,
  retryDmsAiAnalysisJob,
  markDmsAiResultSuperseded,
  applyAiAnalysisToMetadata,
  getDmsAiMetadataApplyHistory,
  type DmsAiResultRow,
  type ApplyAiMetadataSelection,
  type DmsAiMetadataApplyHistoryRun,
} from "@/server/actions/dms/ai-analysis";
import { ErpMappingPreviewPanel } from "@/features/dms/documents/sections/dms-erp-mapping-preview-panel";
// Phase 16 — Apply-to-ERP history (DMS document field runs)
import { DmsApplyToErpRunHistory } from "@/features/dms/apply-to-erp";
import {
  getMetadataDefinitionsForType,
  getDmsDocumentMetadataValues,
} from "@/server/actions/dms/document-metadata-values";
import { DmsAiConfidenceBadge } from "@/features/dms/ai/dms-ai-confidence-badge";
import {
  buildMetadataDiff,
  type MetadataDiffRow,
  type MetadataDiffState,
  type CurrentMetadataValueRow,
  type ConfidenceEntry,
} from "@/lib/dms/metadata/metadata-diff";
import type { DmsMetadataDefinitionBase } from "@/lib/dms/metadata/metadata-definition-shared";
import { format, parseISO } from "date-fns";

// ── Props ────────────────────────────────────────────────────────────────────

interface DmsDocumentAiSectionProps {
  documentId: number;
  documentTypeId?: number | null;
  canRun?: boolean;
  canView?: boolean;
  canApplyMetadata?: boolean;
  /** Phase 17 — When true, shows "Propose Correction" on applied apply items (feature flag + permission gated). */
  canProposeCorrection?: boolean;
}

// ── Main component ────────────────────────────────────────────────────────────

export function DmsDocumentAiSection({
  documentId,
  documentTypeId,
  canRun = false,
  canView = true,
  canApplyMetadata = false,
  canProposeCorrection = false,
}: DmsDocumentAiSectionProps) {
  const queryClient = useQueryClient();

  const { data: correctionAccess } = useQuery({
    queryKey: ["dms", "apply-correction-access"],
    queryFn: async () => {
      const r = await getApplyCorrectionAccess();
      return r.data ?? { proposalsEnabled: false, restorePreviousEnabled: false };
    },
    staleTime: 60_000,
    enabled: canProposeCorrection,
  });
  const correctionEnabled = canProposeCorrection && (correctionAccess?.proposalsEnabled ?? false);
  const [running, setRunning] = useState(false);
  const [expandedResult, setExpandedResult] = useState<number | null>(null);

  const { data: aiStatus, isLoading: statusLoading } = useQuery({
    queryKey: queryKeys.dms.documentAiStatus(documentId),
    queryFn: async () => {
      const r = await getDmsAiAnalysisStatus(documentId);
      if (!r.success) throw new Error(r.error);
      return r.data!;
    },
    staleTime: 15_000,
  });

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

  const handleMetadataApplied = () => {
    invalidateDmsAiAnalysis(queryClient, documentId);
    queryClient.invalidateQueries({ queryKey: queryKeys.dms.documentMetadata(documentId) });
    if (documentTypeId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.dms.documentMetadataDefs(documentTypeId) });
    }
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
        </div>
      )}

      {/* ── Latest Result card ── */}
      {latestResult && (
        <AiResultCard
          result={latestResult}
          documentId={documentId}
          documentTypeId={documentTypeId ?? null}
          expanded={expandedResult === latestResult.id}
          onToggle={() => setExpandedResult(expandedResult === latestResult.id ? null : latestResult.id)}
          onRetry={canRun ? () => handleRetry(latestResult.job_id) : undefined}
          onSupersede={canRun ? () => handleSupersede(latestResult.id) : undefined}
          canApplyMetadata={canApplyMetadata}
          onMetadataApplied={handleMetadataApplied}
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
              documentId={documentId}
              documentTypeId={documentTypeId ?? null}
              expanded={expandedResult === r.id}
              onToggle={() => setExpandedResult(expandedResult === r.id ? null : r.id)}
              onSupersede={canRun && r.ai_status === "pending_review" ? () => handleSupersede(r.id) : undefined}
              canApplyMetadata={false}
              onMetadataApplied={handleMetadataApplied}
            />
          ))}
        </div>
      )}

      {/* ── Info notice (Phase 6 updated) ── */}
      <div className="flex items-start gap-2 rounded-md border border-border/50 bg-muted/20 px-3 py-2">
        <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          The AI reads uploaded files directly — no separate OCR step needed.
          Results are <strong>suggestions only</strong> and are never applied automatically.
          {canApplyMetadata
            ? " Use Apply Selected Fields below to write chosen values to metadata with your explicit confirmation."
            : " Contact a DMS editor or admin to apply AI suggestions to this document's metadata."}
        </p>
      </div>

      {/* ── Phase 16/17 — Apply-to-ERP Run History + Phase 17 Correction Proposals ── */}
      <DmsApplyToErpRunHistory
        documentId={documentId}
        className="pt-2 border-t border-border/50"
        correctionEnabled={correctionEnabled}
      />
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
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${styles[key] ?? styles.not_required}`}>
      {labels[key] ?? key}
    </span>
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
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${styles[status] ?? styles.pending_review}`}>
      {labels[status] ?? status}
    </span>
  );
}

// ── DiffStateBadge ────────────────────────────────────────────────────────────

function DiffStateBadge({ state }: { state: MetadataDiffState }) {
  const configs: Record<MetadataDiffState, { label: string; className: string }> = {
    new:             { label: "New",           className: "bg-green-100 text-green-700 border-green-200" },
    same:            { label: "Unchanged",     className: "bg-slate-100 text-slate-500 border-slate-200" },
    changed:         { label: "Replace",       className: "bg-amber-100 text-amber-700 border-amber-200" },
    conflict:        { label: "Invalid",       className: "bg-red-100 text-red-700 border-red-200" },
    low_confidence:  { label: "Low Conf",      className: "bg-orange-100 text-orange-700 border-orange-200" },
    no_ai_value:     { label: "No Suggestion", className: "bg-slate-100 text-slate-400 border-slate-200" },
    not_extractable: { label: "N/A",           className: "bg-slate-100 text-slate-400 border-slate-200" },
  };
  const cfg = configs[state] ?? configs.no_ai_value;
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

// ── AiResultCard ──────────────────────────────────────────────────────────────

interface AiResultCardProps {
  result: DmsAiResultRow;
  documentId: number;
  documentTypeId: number | null;
  expanded: boolean;
  onToggle: () => void;
  onRetry?: () => void;
  onSupersede?: () => void;
  canApplyMetadata: boolean;
  onMetadataApplied: () => void;
  isLatest?: boolean;
}

function AiResultCard({
  result,
  documentId,
  documentTypeId,
  expanded,
  onToggle,
  onRetry,
  onSupersede,
  canApplyMetadata,
  onMetadataApplied,
  isLatest,
}: AiResultCardProps) {
  const fields = Object.entries(result.extracted_fields_json ?? {});
  const confidence = result.field_confidence_json as Record<string, { score: number; label: string; source_snippet: string | null }> | null;
  const links = (result.suggested_links_json ?? []) as Array<{ entityType?: string; entityName?: string | null; reason?: string; confidenceScore?: number; confidence_score?: number }>;
  const warnings = (result.raw_response_json as { warnings?: string[] } | null)?.warnings ?? [];

  const showApplySection =
    canApplyMetadata &&
    isLatest &&
    result.ai_status === "pending_review" &&
    !!documentTypeId &&
    fields.length > 0;

  return (
    <div className={`rounded-md border overflow-hidden ${result.ai_status === "superseded" ? "opacity-50 border-border/40" : "border-border"}`}>
      {/* Card header */}
      <div className="w-full flex items-center justify-between bg-muted/20 hover:bg-muted/30 transition-colors">
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
                {result.suggested_type?.name_en ? `Suggested: ${result.suggested_type.name_en}` : "AI Result"}
              </span>
              {result.classification_confidence && (
                <DmsAiConfidenceBadge label={result.classification_confidence} score={result.classification_score} />
              )}
              <AiResultStatusBadge status={result.ai_status} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {format(parseISO(result.created_at), "dd MMM yyyy HH:mm")}
              {fields.length > 0 && ` · ${fields.length} field${fields.length !== 1 ? "s" : ""} extracted`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 px-2 shrink-0">
          {onRetry && result.ai_status !== "superseded" && (
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onRetry}>
              <RotateCcw className="h-3 w-3" />
              Retry
            </Button>
          )}
          {onSupersede && result.ai_status === "pending_review" && (
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground" onClick={onSupersede}>
              Supersede
            </Button>
          )}
          <div
            role="button" tabIndex={-1} aria-hidden
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

          {/* Extracted fields (read-only summary) */}
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
                            {conf ? <DmsAiConfidenceBadge label={conf.label} score={conf.score} /> : "—"}
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
            </div>
          )}

          {/* Phase 6 — Apply to Metadata diff section */}
          {showApplySection && (
            <AiMetadataDiffSection
              documentId={documentId}
              documentTypeId={documentTypeId}
              result={result}
              onApplied={onMetadataApplied}
            />
          )}

          {/* Phase 7 — Apply History panel */}
          <ApplyHistoryPanel documentId={documentId} aiResultId={result.id} />

          {/* Phase 8 — ERP Mapping Preview panel (read-only, no ERP writes) */}
          <ErpMappingPreviewPanel documentId={documentId} />

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

// ── AiMetadataDiffSection ─────────────────────────────────────────────────────

interface AiMetadataDiffSectionProps {
  documentId: number;
  documentTypeId: number;
  result: DmsAiResultRow;
  onApplied: () => void;
}

function AiMetadataDiffSection({ documentId, documentTypeId, result, onApplied }: AiMetadataDiffSectionProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [lowConfConfirmed, setLowConfConfirmed] = useState(false);

  // Load definitions and current values
  const { data: defs = [], isLoading: defsLoading } = useQuery({
    queryKey: queryKeys.dms.documentMetadataDefs(documentTypeId),
    queryFn: async () => {
      const r = await getMetadataDefinitionsForType(documentTypeId, "all");
      return (r.data ?? []) as DmsMetadataDefinitionBase[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: currentValues = [], isLoading: valuesLoading } = useQuery({
    queryKey: queryKeys.dms.documentMetadata(documentId),
    queryFn: async () => {
      const r = await getDmsDocumentMetadataValues(documentId);
      return r.data ?? [];
    },
    staleTime: 30 * 1000,
  });

  if (defsLoading || valuesLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground border-t border-border/50 pt-4">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading diff…
      </div>
    );
  }

  const mappedCurrentValues: CurrentMetadataValueRow[] = currentValues.map((v) => ({
    definition_id: v.definition_id,
    value_text: v.value_text,
    value_number: v.value_number,
    value_date: v.value_date,
    value_datetime: v.value_datetime,
    value_boolean: v.value_boolean,
    value_json: v.value_json,
    updated_at: null,
  }));

  const extractedFields = (result.extracted_fields_json as Record<string, unknown> | null) ?? null;
  const fieldConf = (result.field_confidence_json as Record<string, ConfidenceEntry> | null) ?? null;

  const diffRows = buildMetadataDiff(defs, mappedCurrentValues, extractedFields, fieldConf);
  const applicableRows = diffRows.filter((r) => r.canApply);

  if (applicableRows.length === 0) {
    return (
      <div className="border-t border-border/50 pt-4 space-y-2">
        <div className="flex items-center gap-2">
          <Wand2 className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Apply to Metadata</p>
        </div>
        <p className="text-xs text-muted-foreground">
          {diffRows.some((r) => r.diffState === "same")
            ? "All AI-suggested values already match current metadata."
            : "No applicable AI suggestions for this document type's metadata fields."}
        </p>
      </div>
    );
  }

  const selectedRows = applicableRows.filter((r) => selectedIds.has(r.definitionId));
  const hasReplacements = selectedRows.some((r) => r.diffState === "changed");
  const hasLowConf = selectedRows.some((r) => r.diffState === "low_confidence");
  const confirmReady =
    (!hasReplacements || replaceConfirmed) &&
    (!hasLowConf || lowConfConfirmed);

  const handleToggle = (defId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(defId)) next.delete(defId);
      else next.add(defId);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(applicableRows.map((r) => r.definitionId)));
  };

  const handleSelectNone = () => setSelectedIds(new Set());

  const handleOpenConfirm = () => {
    setReplaceConfirmed(false);
    setLowConfConfirmed(false);
    setConfirmOpen(true);
  };

  const handleApply = async () => {
    setConfirmOpen(false);
    setApplying(true);
    try {
      const selections: ApplyAiMetadataSelection[] = selectedRows.map((row) => ({
        definitionId: row.definitionId,
        fieldCode: row.fieldCode,
        applyMode: row.currentValueRaw ? "replace_selected" : "fill_missing_only",
        expectedCurrentValue: row.currentValueRaw,
        expectedUpdatedAt: row.currentUpdatedAt ?? undefined,
      }));

      const r = await applyAiAnalysisToMetadata({
        documentId,
        aiResultId: result.id,
        selections,
        confirmation: {
          replaceExistingConfirmed: replaceConfirmed,
          lowConfidenceConfirmed: lowConfConfirmed,
        },
      });

      if (r.success && r.data) {
        const { appliedCount, skippedCount, skippedFields } = r.data;
        if (appliedCount > 0) {
          toast.success(`${appliedCount} field${appliedCount !== 1 ? "s" : ""} applied to metadata.`);
        }
        if (skippedCount > 0) {
          toast.warning(`${skippedCount} field${skippedCount !== 1 ? "s" : ""} skipped: ${skippedFields.map((s) => s.fieldCode).join(", ")}`);
        }
        setSelectedIds(new Set());
        onApplied();
      } else {
        toast.error(r.error ?? "Failed to apply metadata");
      }
    } finally {
      setApplying(false);
    }
  };

  // Pre-select "new" rows by default on first render
  // (use initialisation pattern: only if selectedIds is empty and we haven't set anything)
  const newRowIds = applicableRows.filter((r) => r.diffState === "new").map((r) => r.definitionId);
  if (selectedIds.size === 0 && newRowIds.length > 0) {
    // Defer to avoid setState-during-render
    setTimeout(() => setSelectedIds(new Set(newRowIds)), 0);
  }

  return (
    <div className="border-t border-border/50 pt-4 space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wand2 className="h-3.5 w-3.5 text-purple-500" />
          <p className="text-xs font-semibold text-foreground">Apply to Metadata</p>
          <span className="text-[10px] text-muted-foreground">
            ({applicableRows.length} field{applicableRows.length !== 1 ? "s" : ""} available)
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleSelectAll}
            className="text-[10px] text-blue-600 hover:underline"
          >
            All
          </button>
          <span className="text-[10px] text-muted-foreground">/</span>
          <button
            type="button"
            onClick={handleSelectNone}
            className="text-[10px] text-blue-600 hover:underline"
          >
            None
          </button>
        </div>
      </div>

      {/* Diff table */}
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="px-2 py-1.5 w-8"></th>
              <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Field</th>
              <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Current</th>
              <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">AI Suggestion</th>
              <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Confidence</th>
              <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {diffRows
              .filter((r) => r.diffState !== "not_extractable" && r.diffState !== "no_ai_value" && r.diffState !== "same")
              .map((row) => {
                const isDisabled = !row.canApply;
                const isChecked = selectedIds.has(row.definitionId);
                return (
                  <tr
                    key={row.definitionId}
                    className={`${isDisabled ? "opacity-50" : "hover:bg-muted/10"}`}
                  >
                    <td className="px-2 py-1.5 text-center">
                      {row.canApply ? (
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggle(row.definitionId)}
                          className="h-3.5 w-3.5 cursor-pointer accent-primary"
                          title={row.fieldCode}
                        />
                      ) : (
                        <MinusCircle className="h-3.5 w-3.5 text-muted-foreground mx-auto" aria-label={row.validationError ?? "Cannot apply"} />
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="font-medium text-foreground">{row.fieldLabelEn}</div>
                      {row.fieldGroup && (
                        <div className="text-[9px] text-muted-foreground">{row.fieldGroup}</div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {row.currentValueRaw ?? <span className="text-slate-400 italic">—</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      {row.aiValueRaw ?? "—"}
                      {row.validationError && (
                        <p className="text-[9px] text-red-600 mt-0.5">{row.validationError}</p>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {row.confidenceScore !== null ? (
                        <DmsAiConfidenceBadge label={row.confidenceLabel ?? "low"} score={row.confidenceScore} />
                      ) : "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      <DiffStateBadge state={row.diffState} />
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Apply button */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={selectedIds.size === 0 || applying}
          onClick={handleOpenConfirm}
          className="gap-1.5"
        >
          {applying ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          {applying ? "Applying…" : `Apply Selected (${selectedIds.size})`}
        </Button>
        {selectedIds.size > 0 && (
          <p className="text-[10px] text-muted-foreground">
            {selectedRows.filter((r) => !r.currentValueRaw).length > 0 &&
              `${selectedRows.filter((r) => !r.currentValueRaw).length} new value(s)`}
            {hasReplacements && `, ${selectedRows.filter((r) => r.diffState === "changed").length} replacement(s)`}
            {hasLowConf && `, ${selectedRows.filter((r) => r.diffState === "low_confidence").length} low-confidence`}
          </p>
        )}
      </div>

      {/* Confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply Selected Metadata</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  You are about to apply <strong>{selectedIds.size} AI-suggested field value{selectedIds.size !== 1 ? "s" : ""}</strong> to this document&apos;s metadata.
                </p>

                {hasReplacements && (
                  <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-sm text-amber-800">
                      {selectedRows.filter((r) => r.diffState === "changed").length} field{selectedRows.filter((r) => r.diffState === "changed").length !== 1 ? "s" : ""} will <strong>replace existing approved values</strong>.
                    </p>
                  </div>
                )}
                {hasLowConf && (
                  <div className="flex items-start gap-2 rounded-md bg-orange-50 border border-orange-200 p-2">
                    <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
                    <p className="text-sm text-orange-800">
                      {selectedRows.filter((r) => r.diffState === "low_confidence").length} field{selectedRows.filter((r) => r.diffState === "low_confidence").length !== 1 ? "s" : ""} have <strong>low confidence scores</strong>.
                    </p>
                  </div>
                )}

                {hasReplacements && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={replaceConfirmed}
                      onChange={(e) => setReplaceConfirmed(e.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="text-sm">I confirm replacement of existing field values</span>
                  </label>
                )}
                {hasLowConf && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={lowConfConfirmed}
                      onChange={(e) => setLowConfConfirmed(e.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="text-sm">I confirm applying low-confidence suggested values</span>
                  </label>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={!confirmReady} onClick={handleApply}>
              Apply Selected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── ApplyHistoryPanel ─────────────────────────────────────────────────────────

interface ApplyHistoryPanelProps {
  documentId: number;
  aiResultId: number;
}

function ApplyHistoryPanel({ documentId, aiResultId }: ApplyHistoryPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [expandedRunIds, setExpandedRunIds] = useState<Set<number>>(new Set());

  const { data: runs, isLoading, error } = useQuery({
    queryKey: queryKeys.dms.documentAiApplyHistory(documentId),
    queryFn: async () => {
      const r = await getDmsAiMetadataApplyHistory(documentId);
      if (!r.success) throw new Error(r.error);
      return r.data ?? [];
    },
    staleTime: 30_000,
    enabled: expanded,
  });

  // Filter runs belonging to this AI result
  const relevantRuns = (runs ?? []).filter(
    (r) => r.aiResultId === aiResultId || r.aiResultId === null
  );

  const toggleRun = (runId: number) => {
    setExpandedRunIds((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  };

  return (
    <div className="border-t border-border/50 pt-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left"
      >
        <History className="h-3.5 w-3.5 shrink-0" />
        <span className="font-semibold uppercase tracking-wide">Apply History</span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 ml-auto" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 ml-auto" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading apply history…
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 py-2">
              <AlertCircle className="h-3.5 w-3.5" />
              Failed to load history
            </div>
          )}

          {!isLoading && !error && relevantRuns.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">No apply runs recorded for this result.</p>
          )}

          {relevantRuns.map((run) => (
            <ApplyHistoryRunRow
              key={run.id}
              run={run}
              isExpanded={expandedRunIds.has(run.id)}
              onToggle={() => toggleRun(run.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── ApplyHistoryRunRow ────────────────────────────────────────────────────────

function ApplyHistoryRunRow({
  run,
  isExpanded,
  onToggle,
}: {
  run: DmsAiMetadataApplyHistoryRun;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const statusColors: Record<string, string> = {
    completed: "text-green-600 border-green-200 bg-green-50",
    partial:   "text-amber-600 border-amber-200 bg-amber-50",
    failed:    "text-red-600 border-red-200 bg-red-50",
    started:   "text-blue-600 border-blue-200 bg-blue-50",
  };
  const statusColor = statusColors[run.applyStatus] ?? statusColors.partial;

  return (
    <div className="rounded-md border border-border overflow-hidden text-xs">
      {/* Run header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/10 hover:bg-muted/20 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${statusColor}`}>
            {run.applyStatus}
          </span>
          <span className="font-medium text-foreground truncate">
            {run.appliedByName ?? `User #${run.appliedBy}`}
          </span>
          <span className="text-muted-foreground shrink-0">
            {format(parseISO(run.createdAt), "dd MMM yyyy HH:mm")}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-2">
          <span className="text-green-600 font-medium">{run.appliedCount} applied</span>
          {run.skippedCount > 0 && (
            <span className="text-muted-foreground">{run.skippedCount} skipped</span>
          )}
          {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {/* Run items */}
      {isExpanded && (
        <div className="border-t border-border/50">
          {run.items.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground italic">No item details recorded.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50 bg-muted/10">
                  <th className="px-2 py-1.5 w-6"></th>
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Field</th>
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Before</th>
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">After</th>
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Confidence</th>
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {run.items.map((item) => (
                  <tr key={item.id} className={item.itemStatus !== "applied" ? "opacity-60" : ""}>
                    <td className="px-2 py-1.5 text-center">
                      {item.itemStatus === "applied" ? (
                        <CheckCircle2 className="h-3 w-3 text-green-600 mx-auto" />
                      ) : (
                        <XCircle className="h-3 w-3 text-muted-foreground mx-auto" />
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-muted-foreground">{item.fieldCode}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {item.oldValueSummary ?? <span className="italic text-slate-400">—</span>}
                    </td>
                    <td className="px-2 py-1.5 font-medium">
                      {item.newValueSummary ?? <span className="italic text-slate-400">—</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      {item.confidenceScore !== null ? (
                        <DmsAiConfidenceBadge
                          label={item.confidenceLabel ?? "low"}
                          score={item.confidenceScore}
                        />
                      ) : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground italic">
                      {item.skipReason ?? (item.applyMode === "fill_missing_only" ? "fill only" : item.applyMode ?? "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
