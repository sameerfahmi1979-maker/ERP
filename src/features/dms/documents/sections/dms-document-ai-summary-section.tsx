"use client";

/**
 * DMS 12.2 — DmsDocumentAiSummarySection
 *
 * Displays AI-generated document summary and allows authorized users to
 * generate or regenerate the summary.
 *
 * Security:
 *  - HR / legal / executive summaries are redacted server-side for non-admin.
 *  - Generate/Regenerate buttons are hidden unless user has dms.documents.ai.run or dms.admin.
 *  - For confidential documents, non-admin users see a restricted message.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Brain, RefreshCw, Sparkles, AlertTriangle, Lock, Clock, AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { queryKeys } from "@/lib/query/query-keys";
import {
  getDmsAiSummaryStatus,
  generateAndSaveDmsAiSummary,
  regenerateDmsAiSummary,
  type AiSummaryStatus,
  type DocumentAiSummaryRow,
} from "@/server/actions/dms/ai-summary";
import { format, parseISO } from "date-fns";

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AiSummaryStatus | null }) {
  if (!status) return <Badge variant="outline">Unknown</Badge>;
  const config: Record<AiSummaryStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    complete: { label: "Complete", variant: "default" },
    pending: { label: "Pending", variant: "outline" },
    failed: { label: "Failed", variant: "destructive" },
    skipped: { label: "Skipped", variant: "secondary" },
    not_required: { label: "Not Required", variant: "secondary" },
  };
  const c = config[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface DmsDocumentAiSummarySectionProps {
  documentId: number;
  canGenerate?: boolean;
  isConfidentialForNonAdmin?: boolean;
}

export function DmsDocumentAiSummarySection({
  documentId,
  canGenerate = false,
  isConfidentialForNonAdmin = false,
}: DmsDocumentAiSummarySectionProps) {
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);

  const {
    data: summaryRow,
    isLoading,
    error: queryError,
    refetch,
  } = useQuery<DocumentAiSummaryRow | null>({
    queryKey: queryKeys.dms.documentAiSummary(documentId),
    queryFn: async () => {
      const r = await getDmsAiSummaryStatus(documentId);
      if (!r.success) throw new Error(r.error ?? "Failed to load summary");
      return r.data ?? null;
    },
    staleTime: 30_000,
    retry: false,
  });

  // ── Handlers ──────────────────────────────────────────────────────────────────

  async function handleGenerate(regenerate: boolean) {
    setGenerating(true);
    try {
      const action = regenerate ? regenerateDmsAiSummary : generateAndSaveDmsAiSummary;
      const result = await action(documentId);
      if (!result.success) {
        toast.error(result.error ?? "Summary generation failed");
      } else {
        toast.success(
          `Summary ${regenerate ? "regenerated" : "generated"} — ${result.data?.outputCharCount ?? 0} characters`
        );
        await refetch();
        await queryClient.invalidateQueries({ queryKey: queryKeys.dms.documents() });
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setGenerating(false);
    }
  }

  // ── Loading state ─────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        Loading AI summary…
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────────

  if (queryError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <AlertCircle className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">
          {queryError instanceof Error ? queryError.message : "Failed to load summary"}
        </p>
      </div>
    );
  }

  // ── Null state ────────────────────────────────────────────────────────────────

  if (!summaryRow) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Brain className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">Summary data unavailable.</p>
      </div>
    );
  }

  const hasExistingSummary =
    summaryRow.aiSummaryStatus === "complete" && !!summaryRow.aiSummary;

  const isRestricted =
    isConfidentialForNonAdmin &&
    summaryRow.aiSummary === "[Summary restricted — confidential document]";

  // ── Main view ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 p-1">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">AI Summary</span>
          <Badge variant="outline" className="gap-1 text-xs">
            <Sparkles className="h-3 w-3" />
            AI
          </Badge>
        </div>
        <StatusBadge status={summaryRow.aiSummaryStatus} />
        {summaryRow.aiSummaryUpdatedAt && (
          <span className="text-xs text-muted-foreground">
            Updated {format(parseISO(summaryRow.aiSummaryUpdatedAt), "d MMM yyyy HH:mm")}
          </span>
        )}
        {summaryRow.aiSummaryModel && (
          <span className="text-xs text-muted-foreground">
            Model: {summaryRow.aiSummaryModel}
          </span>
        )}
        {canGenerate && !isRestricted && (
          <div className="ml-auto flex items-center gap-2">
            {hasExistingSummary ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleGenerate(true)}
                disabled={generating}
              >
                {generating ? (
                  <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                )}
                Regenerate
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => handleGenerate(false)}
                disabled={generating}
              >
                {generating ? (
                  <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-3.5 w-3.5" />
                )}
                Generate Summary
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Truncated input warning */}
      {summaryRow.aiSummaryInputTruncated && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Summary was generated from a truncated version of the document text (20,000 character input limit).
            {summaryRow.aiSummaryInputCharCount !== null &&
              ` Input used: ${summaryRow.aiSummaryInputCharCount.toLocaleString()} characters.`}
          </span>
        </div>
      )}

      {/* Failed state */}
      {summaryRow.aiSummaryStatus === "failed" && summaryRow.aiSummaryError && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Generation failed: {summaryRow.aiSummaryError}</span>
        </div>
      )}

      {/* Skipped / pending state with no content */}
      {(summaryRow.aiSummaryStatus === "skipped" || summaryRow.aiSummaryStatus === "pending") &&
        !hasExistingSummary && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No summary yet</p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                {summaryRow.aiSummaryStatus === "skipped"
                  ? "Summary was skipped — extracted text may be empty. Run OCR or AI intake first."
                  : "Summary has not been generated yet."}
                {canGenerate && " Click Generate Summary to create one."}
              </p>
            </div>
            {canGenerate && !isRestricted && (
              <Button
                size="sm"
                onClick={() => handleGenerate(false)}
                disabled={generating}
              >
                {generating ? (
                  <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-3.5 w-3.5" />
                )}
                Generate Summary
              </Button>
            )}
          </div>
        )}

      {/* Restricted summary */}
      {isRestricted && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Summary Restricted</p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              AI summaries for HR, legal, and executive documents are only visible to administrators.
            </p>
          </div>
        </div>
      )}

      {/* Summary text */}
      {hasExistingSummary && !isRestricted && (
        <div className="rounded-md border bg-muted/30 p-4">
          <p className="text-sm leading-relaxed text-foreground">{summaryRow.aiSummary}</p>
        </div>
      )}

      {/* Disclaimer note */}
      <div className="flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50/50 px-3 py-2 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          AI summaries are generated from extracted document text and should be reviewed by the user.
          The original document remains the source of truth.
        </span>
      </div>
    </div>
  );
}
