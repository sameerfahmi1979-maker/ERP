"use client";

/**
 * ERP COMMON AI.2 — Document Understanding Section
 *
 * Tab content for the "Understanding" section in the DMS document record.
 * Aggregates all DMS AI intelligence into one professional read-only view.
 *
 * Security rules:
 * - Never displays raw OCR text, content_text, prompts, AI responses, or vectors.
 * - AI summary text is server-redacted for non-admin on confidential documents.
 * - All data comes from getDmsDocumentUnderstanding() — read-only aggregation.
 * - Feature flag ERP_AI_DOC_UNDERSTANDING must be enabled; shows disabled notice otherwise.
 */

import { useQuery } from "@tanstack/react-query";
import { Brain, Sparkles, AlertCircle, ExternalLink, CheckCircle2, XCircle,
  Clock, SkipForward, FileText, Link2, Tag, Zap, RefreshCw, Info, GitMerge, Scale, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { queryKeys } from "@/lib/query/query-keys";
import { getDmsDocumentUnderstanding } from "@/server/actions/dms/document-understanding";
import { RiskLevelBadge } from "@/features/ai/common/risk-scoring";
import type {
  DmsDocumentUnderstanding,
  DmsUnderstandingAction,
  DmsUnderstandingHealth,
} from "@/lib/dms/understanding/types";

// ── Props ─────────────────────────────────────────────────────────────────────

interface DmsDocumentUnderstandingSectionProps {
  documentId: number | null;
  /** Called when a Recommended Action "Open" button targets an in-page tab. */
  onNavigateToSection?: (section: string) => void;
}

// ── Helper components ─────────────────────────────────────────────────────────

function StatusBadge({ ok, label, variant }: { ok: boolean; label: string; variant?: string }) {
  return (
    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0",
      ok ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-50 text-slate-500 border-slate-200"
    )}>
      {ok ? <CheckCircle2 className="h-2.5 w-2.5 mr-0.5 inline" /> : <Clock className="h-2.5 w-2.5 mr-0.5 inline" />}
      {label}
    </Badge>
  );
}

function RiskBadge({ level }: { level: string | null }) {
  const colors: Record<string, string> = {
    none: "bg-green-50 text-green-700 border-green-200",
    low: "bg-blue-50 text-blue-700 border-blue-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    high: "bg-orange-50 text-orange-700 border-orange-200",
    critical: "bg-red-50 text-red-700 border-red-200",
  };
  const key = (level ?? "none").toLowerCase();
  return (
    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 font-semibold capitalize", colors[key] ?? colors.none)}>
      {level ?? "Unknown"}
    </Badge>
  );
}

function ExpiryBadge({ status, days }: { status: string; days: number | null }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    valid: { cls: "bg-green-50 text-green-700 border-green-200", label: `Valid (${days}d)` },
    expiring_soon: { cls: "bg-amber-50 text-amber-700 border-amber-200", label: `Expiring in ${days}d` },
    expired: { cls: "bg-red-50 text-red-700 border-red-200", label: "Expired" },
    unknown: { cls: "bg-slate-50 text-slate-500 border-slate-200", label: "No expiry" },
  };
  const c = cfg[status] ?? cfg.unknown;
  return <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", c.cls)}>{c.label}</Badge>;
}

function SectionCard({ title, icon, children, className }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <Card className={cn("border-slate-200", className)}>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 uppercase tracking-wide">
          {icon}{title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">{children}</CardContent>
    </Card>
  );
}

// ── Health Card ───────────────────────────────────────────────────────────────

function HealthCard({ health }: { health: DmsUnderstandingHealth }) {
  const colors = {
    "Excellent": "text-green-700 bg-green-50 border-green-200",
    "Good": "text-blue-700 bg-blue-50 border-blue-200",
    "Needs Attention": "text-amber-700 bg-amber-50 border-amber-200",
    "Critical": "text-red-700 bg-red-50 border-red-200",
  };
  const barColors = {
    "Excellent": "bg-green-500",
    "Good": "bg-blue-500",
    "Needs Attention": "bg-amber-500",
    "Critical": "bg-red-500",
  };
  return (
    <Card className={cn("border", colors[health.label] ?? colors["Needs Attention"])}>
      <CardContent className="px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <span className="font-semibold text-sm">Document Intelligence Health</span>
            <Badge variant="outline" className={cn("text-[11px] px-2 py-0 font-bold border", colors[health.label])}>
              {health.label}
            </Badge>
          </div>
          <span className="text-xl font-bold">{health.score}<span className="text-sm font-normal opacity-60">/100</span></span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-1.5 mb-3">
          <div className="h-1.5 rounded-full transition-all" style={{ width: `${health.score}%`, background: health.score >= 85 ? "#22c55e" : health.score >= 65 ? "#3b82f6" : health.score >= 40 ? "#f59e0b" : "#ef4444" }} />
        </div>
        <div className="flex items-center gap-3 flex-wrap text-[11px]">
          {[
            { ok: health.hasOcr, label: "OCR" },
            { ok: health.hasSummary, label: "Summary" },
            { ok: health.hasIntelligence, label: "Intelligence" },
            { ok: health.hasEmbedding, label: "Embedding" },
            { ok: health.hasLinks, label: "Linked" },
          ].map((item) => (
            <span key={item.label} className="flex items-center gap-0.5">
              {item.ok
                ? <CheckCircle2 className="h-3 w-3 text-green-600" />
                : <XCircle className="h-3 w-3 text-slate-300" />}
              <span className={item.ok ? "text-slate-700" : "text-slate-400"}>{item.label}</span>
            </span>
          ))}
          {health.warningCount > 0 && (
            <span className="text-amber-600 ml-auto">{health.warningCount} warning{health.warningCount > 1 ? "s" : ""}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

export function DmsDocumentUnderstandingSection({
  documentId,
  onNavigateToSection,
}: DmsDocumentUnderstandingSectionProps) {
  const { data: result, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: queryKeys.dms.documentUnderstanding(documentId ?? 0),
    queryFn: () => getDmsDocumentUnderstanding(documentId!),
    enabled: !!documentId,
    staleTime: 60_000,
  });

  if (!documentId) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Save the document first before using AI Understanding.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full rounded-lg" />
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4,5,6].map((i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (!result?.success) {
    const isDisabled = result?.code === "FEATURE_DISABLED";
    return (
      <div className="py-6">
        {isDisabled ? (
          <Alert className="border-slate-200 bg-slate-50">
            <Brain className="h-4 w-4 text-slate-500" />
            <AlertDescription className="text-sm text-slate-600">
              <strong>AI Document Understanding is not enabled.</strong><br />
              Enable <code className="text-xs bg-slate-100 px-1 rounded">ERP_AI_DOC_UNDERSTANDING</code> in{" "}
              <a href="/admin/settings/ai" className="text-blue-600 underline">Admin → AI Settings</a> to use this feature.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{result?.error ?? error?.message ?? "Failed to load document understanding."}</AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  const u = result.data!;

  return (
    <div className="space-y-3">
      {/* Refresh button */}
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isRefetching} className="h-6 text-xs px-2 text-slate-500">
          <RefreshCw className={cn("h-3 w-3 mr-1", isRefetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Health */}
      <HealthCard health={u.health} />

      {/* 2-column grid for status cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

        {/* Identity */}
        <SectionCard title="Document" icon={<FileText className="h-3 w-3" />}>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">No.</span>
              <span className="font-mono font-medium">{u.identity.documentNo ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Type</span>
              <span className="text-right max-w-[160px] truncate">{u.identity.typeName ?? "—"}{u.identity.typeNameAr && <span className="text-slate-400 ml-1">({u.identity.typeNameAr})</span>}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Status</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{u.identity.status ?? "—"}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Expiry</span>
              <ExpiryBadge status={u.identity.expiryStatus} days={u.identity.daysUntilExpiry} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Confidentiality</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{u.identity.confidentialityLevel}</Badge>
            </div>
          </div>
        </SectionCard>

        {/* OCR Status */}
        <SectionCard title="OCR & Text" icon={<FileText className="h-3 w-3" />}>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">OCR processed</span>
              <StatusBadge
                ok={u.ocrStatus.ocrRunComplete}
                label={u.ocrStatus.ocrRunComplete ? "Complete" : "Not run"}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">OCR text</span>
              <StatusBadge
                ok={u.ocrStatus.ocrTextAvailable}
                label={u.ocrStatus.ocrTextAvailable ? "Available" : "Missing"}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Files with OCR</span>
              <span>{u.ocrStatus.filesWithOcr} / {u.ocrStatus.fileCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Content text</span>
              <StatusBadge ok={u.ocrStatus.contentTextAvailable} label={u.ocrStatus.contentTextAvailable ? `${u.ocrStatus.contentTextCharCount?.toLocaleString() ?? "?"} chars` : "Missing"} />
            </div>
            {u.ocrStatus.contentTextTruncated && (
              <p className="text-amber-600">⚠ Content was truncated (very long document)</p>
            )}
            {u.ocrStatus.ocrRunComplete && !u.ocrStatus.ocrTextAvailable && !u.ocrStatus.contentTextAvailable && (
              <p className="text-amber-600">OCR finished but no text was found in this file.</p>
            )}
            {!u.ocrStatus.ocrRunComplete && (
              <a href="?section=ocr" className="block mt-1 text-center text-[10px] text-blue-600 underline hover:text-blue-800 py-1 border border-slate-200 rounded">
                Run OCR → OCR/Text tab
              </a>
            )}
          </div>
        </SectionCard>

        {/* AI Summary */}
        <SectionCard title="AI Summary" icon={<Brain className="h-3 w-3" />}>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Status</span>
              <StatusBadge ok={u.summaryStatus.status === "complete"} label={u.summaryStatus.status ?? "Not run"} />
            </div>
            {u.summaryStatus.summaryModel && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Model</span>
                <span className="font-mono text-[10px]">{u.summaryStatus.summaryModel}</span>
              </div>
            )}
            {u.summaryStatus.isConfidentialRedacted && (
              <Alert className="py-1.5 border-amber-200 bg-amber-50">
                <AlertDescription className="text-[11px] text-amber-700">Summary restricted — confidential document.</AlertDescription>
              </Alert>
            )}
            {u.summaryStatus.summaryText && !u.summaryStatus.isConfidentialRedacted && (
              <p className="text-slate-700 leading-relaxed line-clamp-4 border-l-2 border-violet-200 pl-2">
                {u.summaryStatus.summaryText}
              </p>
            )}
          </div>
        </SectionCard>

        {/* Completeness */}
        <SectionCard title="Completeness" icon={<CheckCircle2 className="h-3 w-3" />}>
          <div className="space-y-1.5 text-xs">
            {u.completeness.score !== null ? (
              <>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-500">Score</span>
                  <span className="font-bold text-sm">{Math.round(u.completeness.score * 100)}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-1.5 mb-2"><div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${Math.round((u.completeness.score ?? 0) * 100)}%` }} /></div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Metadata fields</span>
                  <span>{u.completeness.filledMetadataFields} / {u.completeness.totalMetadataFields} filled</span>
                </div>
                {u.completeness.missingFieldLabels.length > 0 && (
                  <div>
                    <span className="text-slate-500">Missing: </span>
                    <span className="text-amber-700">{u.completeness.missingFieldLabels.slice(0, 4).join(", ")}{u.completeness.missingFieldLabels.length > 4 && ` +${u.completeness.missingFieldLabels.length - 4} more`}</span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-slate-400">Not evaluated yet. Run Intelligence evaluation.</p>
            )}
          </div>
        </SectionCard>

        {/* Risk */}
        <SectionCard title="Risk" icon={<AlertCircle className="h-3 w-3" />}>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Risk level</span>
              <RiskBadge level={u.risk.riskLevel} />
            </div>
            {u.risk.riskScore !== null && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Score</span>
                <span>{Math.round(u.risk.riskScore * 100)}%</span>
              </div>
            )}
            {u.risk.riskReasonLabels.length > 0 && (
              <ul className="space-y-0.5 mt-1">
                {u.risk.riskReasonLabels.slice(0, 4).map((r, i) => (
                  <li key={i} className="text-slate-600 flex items-start gap-1">
                    <span className="text-amber-500 mt-0.5">•</span>{r}
                  </li>
                ))}
              </ul>
            )}
            {u.risk.riskLevel === null && <p className="text-slate-400">Not evaluated yet.</p>}
          </div>
        </SectionCard>

        {/* Embedding */}
        <SectionCard title="Semantic Embedding" icon={<Zap className="h-3 w-3" />}>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Status</span>
              <StatusBadge ok={u.embedding.readyForSemanticSearch} label={u.embedding.status ?? "Not generated"} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Semantic search</span>
              <span className={u.embedding.readyForSemanticSearch ? "text-green-700 font-medium" : "text-slate-400"}>
                {u.embedding.readyForSemanticSearch ? "Ready ✓" : "Not ready"}
              </span>
            </div>
            {u.embedding.model && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Model</span>
                <span className="font-mono text-[10px]">{u.embedding.model}</span>
              </div>
            )}
            {u.embedding.source && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Source</span>
                <span className="capitalize">{u.embedding.source.replace("_", " ")}</span>
              </div>
            )}
          </div>
        </SectionCard>

        {/* Tags & Links */}
        <SectionCard title="Tags & Links" icon={<Tag className="h-3 w-3" />}>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Tags</span>
              <span>{u.tagsLinks.tagCount} applied{u.tagsLinks.pendingTagSuggestions > 0 && ` · ${u.tagsLinks.pendingTagSuggestions} pending`}</span>
            </div>
            {u.tagsLinks.tagNames.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {u.tagsLinks.tagNames.slice(0, 5).map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0">#{t}</Badge>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between mt-1">
              <span className="text-slate-500">Linked entities</span>
              <span>{u.tagsLinks.linkCount}{u.tagsLinks.pendingLinkSuggestions > 0 && ` · ${u.tagsLinks.pendingLinkSuggestions} AI suggestions`}</span>
            </div>
            {u.tagsLinks.linkedEntities.map((e) => (
              <div key={`${e.entityType}-${e.entityId}`} className="flex items-center gap-1.5">
                <Link2 className="h-2.5 w-2.5 text-slate-400" />
                <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                  {e.entityTypeLabel}
                </Badge>
                <span className="truncate max-w-[180px] font-medium text-slate-700">
                  {e.entityDisplayName}
                </span>
                {e.isPrimary && <Badge variant="outline" className="text-[9px] px-1 py-0">Primary</Badge>}
              </div>
            ))}
            {u.tagsLinks.linkCount === 0 && (
              <p className="text-slate-400">No entity linked. Link to an organization or party.</p>
            )}
          </div>
        </SectionCard>

        {/* AI Extraction */}
        <SectionCard title="AI Classification" icon={<Brain className="h-3 w-3" />}>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Status</span>
              <StatusBadge ok={u.extractionStatus.aiStatus === "complete"} label={u.extractionStatus.aiStatus ?? "Not run"} />
            </div>
            {u.extractionStatus.classificationConfidence !== null && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Confidence</span>
                <span className="font-medium">{Math.round((u.extractionStatus.classificationConfidence ?? 0) * 100)}%</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Fields extracted</span>
              <span>{u.extractionStatus.extractedFieldCount}</span>
            </div>
            {u.extractionStatus.lowConfidenceFieldCount > 0 && (
              <p className="text-amber-600">{u.extractionStatus.lowConfidenceFieldCount} field(s) need review</p>
            )}
            {!u.extractionStatus.hasResult && (
              <p className="text-slate-400">No AI analysis run yet. Use the AI Analysis tab.</p>
            )}
          </div>
        </SectionCard>

      </div>{/* end grid */}

      {/* ORCH.1 Pipeline (if available) */}
      {u.orchestrationStatus.available && (
        <SectionCard title="AI Pipeline (ORCH.1)" icon={<Zap className="h-3 w-3" />}>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0",
              u.orchestrationStatus.status === "complete" ? "bg-green-50 text-green-700 border-green-200" :
              u.orchestrationStatus.status === "complete_with_warnings" ? "bg-amber-50 text-amber-700 border-amber-200" :
              u.orchestrationStatus.status === "failed" ? "bg-red-50 text-red-700 border-red-200" :
              "bg-slate-50 text-slate-500 border-slate-200"
            )}>
              {u.orchestrationStatus.status?.replace(/_/g, " ") ?? "Unknown"}
            </Badge>
            <span className="text-xs text-slate-500">{u.orchestrationStatus.completedSteps} steps complete{u.orchestrationStatus.failedSteps > 0 && `, ${u.orchestrationStatus.failedSteps} failed`}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {u.orchestrationStatus.steps.slice(0, 10).map((step) => {
              const icons: Record<string, React.ReactNode> = {
                completed: <CheckCircle2 className="h-2.5 w-2.5 text-green-500" />,
                failed: <XCircle className="h-2.5 w-2.5 text-red-400" />,
                skipped: <SkipForward className="h-2.5 w-2.5 text-slate-300" />,
              };
              return (
                <div key={step.step} className="flex items-center gap-0.5 text-[10px] text-slate-600">
                  {icons[step.status] ?? <Clock className="h-2.5 w-2.5 text-slate-300" />}
                  <span className="capitalize">{step.step.replace(/_/g, " ")}</span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Field Update Candidates */}
      <SectionCard title="Field Update Candidates (COMMON AI)" icon={<Sparkles className="h-3 w-3" />}>
        {!u.fieldCandidates.registryAvailable ? (
          <div className="text-xs text-slate-400">
            {u.tagsLinks.linkCount === 0
              ? "Link this document to an Organization or Party to see field update candidates."
              : "Field update preview is currently available for Organization and Party only."}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 capitalize">{u.fieldCandidates.entityType} — {u.fieldCandidates.candidateFields.length} candidate fields</span>
              {u.fieldCandidates.pendingSuggestionCount > 0 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-violet-50 text-violet-700 border-violet-200">
                  {u.fieldCandidates.pendingSuggestionCount} pending suggestion{u.fieldCandidates.pendingSuggestionCount > 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1">
              {u.fieldCandidates.candidateFields.slice(0, 8).map((f) => (
                <div key={`${f.targetTable}.${f.targetField}`} className="flex items-center gap-1 text-[11px] py-0.5">
                  <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0",
                    f.relevance === "high" ? "bg-violet-500" : "bg-slate-300"
                  )} />
                  <span className="truncate text-slate-700">{f.fieldLabel}</span>
                  {f.hasPendingSuggestion && <CheckCircle2 className="h-2.5 w-2.5 text-green-500 flex-shrink-0" />}
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 flex items-center gap-1">
              <Info className="h-2.5 w-2.5" />
              Preview only. Open the entity AI Review tab to generate and apply suggestions.
            </p>
            {u.fieldCandidates.aiReviewRoute && (
              <a
                href={u.fieldCandidates.aiReviewRoute}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-violet-700 border border-violet-200 rounded px-2 py-1 hover:bg-violet-50"
              >
                <ExternalLink className="h-2.5 w-2.5" />
                Open {u.fieldCandidates.entityType === "company" ? "Organization" : "Party"} AI Review
              </a>
            )}
          </div>
        )}
      </SectionCard>

      {/* Duplicate / Conflict Candidates (COMMON AI.3) */}
      {u.duplicateCandidates.hasPending && (
        <SectionCard title="Duplicate / Conflict Review" icon={<GitMerge className="h-3 w-3" />} className="border-amber-200 bg-amber-50/40">
          <p className="text-xs text-amber-900">
            {u.duplicateCandidates.pendingCount} pending duplicate/conflict candidate
            {u.duplicateCandidates.pendingCount === 1 ? "" : "s"} linked to this document.
          </p>
          {u.duplicateCandidates.reviewRoute && (
            <a
              href={u.duplicateCandidates.reviewRoute}
              className="inline-flex items-center gap-1 text-[11px] text-amber-800 border border-amber-300 rounded px-2 py-1 mt-2 hover:bg-amber-100"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              Review in AI Duplicates
            </a>
          )}
        </SectionCard>
      )}

      {/* Compliance Findings (COMMON AI.4) */}
      {u.complianceFindings.openCount > 0 && (
        <SectionCard
          title="Compliance Findings"
          icon={<Scale className="h-3 w-3" />}
          className={
            u.complianceFindings.hasCritical
              ? "border-red-200 bg-red-50/40"
              : "border-teal-200 bg-teal-50/40"
          }
        >
          <p className={`text-xs ${u.complianceFindings.hasCritical ? "text-red-900" : "text-teal-900"}`}>
            {u.complianceFindings.openCount} open compliance finding
            {u.complianceFindings.openCount === 1 ? "" : "s"} linked to this document.
          </p>
          {u.complianceFindings.reviewRoute && (
            <a
              href={u.complianceFindings.reviewRoute}
              className={`inline-flex items-center gap-1 text-[11px] border rounded px-2 py-1 mt-2 hover:opacity-90 ${
                u.complianceFindings.hasCritical
                  ? "text-red-800 border-red-300 hover:bg-red-100"
                  : "text-teal-800 border-teal-300 hover:bg-teal-100"
              }`}
            >
              <ExternalLink className="h-2.5 w-2.5" />
              Review in AI Compliance
            </a>
          )}
        </SectionCard>
      )}

      {/* Entity Risk (COMMON AI.5) */}
      {u.entityRisk && u.entityRisk.riskScore != null && (
        <SectionCard
          title="Linked Entity Risk"
          icon={<TrendingUp className="h-3 w-3" />}
          className={
            u.entityRisk.riskLevel === "critical" || u.entityRisk.riskLevel === "high"
              ? "border-orange-200 bg-orange-50/40"
              : "border-slate-200 bg-slate-50/40"
          }
        >
          <div className="flex items-center gap-2 text-xs">
            <span className="capitalize text-muted-foreground">{u.entityRisk.entityType}</span>
            <RiskLevelBadge level={u.entityRisk.riskLevel} score={u.entityRisk.riskScore} />
            {u.entityRisk.isStale && (
              <span className="text-[10px] text-amber-700 font-medium">Stale</span>
            )}
          </div>
          {u.entityRisk.reviewRoute && (
            <a
              href={u.entityRisk.reviewRoute}
              className="inline-flex items-center gap-1 text-[11px] border rounded px-2 py-1 mt-2 hover:opacity-90 text-orange-800 border-orange-300 hover:bg-orange-100"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              Review in AI Risk
            </a>
          )}
        </SectionCard>
      )}

      {/* Recommended Actions */}
      {u.actions.length > 0 && (
        <SectionCard title="Recommended Actions" icon={<Zap className="h-3 w-3" />} className="border-blue-100 bg-blue-50/30">
          <div className="space-y-1.5">
            {u.actions.map((action) => (
              <ActionRow key={action.actionCode} action={action} onNavigateToSection={onNavigateToSection} />
            ))}
          </div>
        </SectionCard>
      )}

      <p className="text-[10px] text-slate-400 text-center pt-1">
        Intelligence aggregated at {new Date(u.generatedAt).toLocaleTimeString()} — {new Date(u.generatedAt).toLocaleDateString()}
      </p>
    </div>
  );
}

// ── Action row ────────────────────────────────────────────────────────────────

function ActionRow({
  action,
  onNavigateToSection,
}: {
  action: DmsUnderstandingAction;
  onNavigateToSection?: (section: string) => void;
}) {
  const colors = {
    high: "border-red-200 bg-red-50/50",
    medium: "border-amber-200 bg-amber-50/50",
    low: "border-slate-200 bg-white",
  };
  const badgeColors = {
    high: "bg-red-50 text-red-700 border-red-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    low: "bg-slate-50 text-slate-500 border-slate-200",
  };

  const openBtn = (() => {
    // External route → regular link
    if (action.linkToRoute) {
      return (
        <a
          href={action.linkToRoute}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 flex items-center gap-0.5 text-[10px] flex-shrink-0 mt-0.5"
        >
          Open <ExternalLink className="h-2.5 w-2.5" />
        </a>
      );
    }
    // In-page tab → button that calls onNavigateToSection (no page reload)
    if (action.linkToTab) {
      return (
        <button
          type="button"
          onClick={() => onNavigateToSection?.(action.linkToTab!)}
          className="text-blue-600 hover:text-blue-800 flex items-center gap-0.5 text-[10px] flex-shrink-0 mt-0.5 cursor-pointer"
        >
          Open <ExternalLink className="h-2.5 w-2.5" />
        </button>
      );
    }
    return null;
  })();

  return (
    <div className={cn("flex items-start gap-2 rounded-md border p-2 text-xs", colors[action.priority])}>
      <Badge variant="outline" className={cn("text-[9px] px-1 py-0 mt-0.5 flex-shrink-0 capitalize", badgeColors[action.priority])}>
        {action.priority}
      </Badge>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-800">{action.label}</p>
        <p className="text-slate-500 text-[11px]">{action.description}</p>
      </div>
      {openBtn}
    </div>
  );
}
