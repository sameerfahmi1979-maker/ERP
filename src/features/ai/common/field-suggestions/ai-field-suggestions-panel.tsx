"use client";

/**
 * ERP COMMON AI.1F — AI Field Suggestions Panel
 *
 * Shared UI panel for viewing, generating, accepting, rejecting,
 * and applying AI field suggestions for Stage 1 entities.
 *
 * Security rules:
 * - Does NOT display raw prompt/AI response/OCR/evidence text.
 * - Displays only stored suggestion row data (already sanitized by server).
 * - source_excerpt shown only in collapsed Popover (max 500 chars already stored).
 * - Feature flag gate: generate button disabled when ERP_AI_FORM_FILL=false.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Brain, RefreshCw, CheckCircle2, XCircle, Zap,
  FileText, AlertTriangle, ChevronDown, ChevronUp, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { queryKeys } from "@/lib/query/query-keys";
import { invalidateAiFieldSuggestions } from "@/lib/query/invalidation";

import {
  getAiFieldSuggestions,
  generateAiFieldSuggestions,
  acceptAiFieldSuggestion,
  rejectAiFieldSuggestion,
  applyAiFieldSuggestion,
  acceptSelectedAiFieldSuggestions,
  type AiFieldSuggestionRow,
} from "@/server/actions/ai/common/field-suggestions";

import { AiConfidenceBadge } from "./ai-confidence-badge";
import { AiSuggestionTypeBadge } from "./ai-suggestion-type-badge";
import { AiSuggestionStatusBadge } from "./ai-suggestion-status-badge";

// ── Props ─────────────────────────────────────────────────────────────────────

interface AiFieldSuggestionsPanelProps {
  entityType: "company" | "party";
  entityId: number;
  entityLabel?: string;
  canGenerate?: boolean;
  canApply?: boolean;
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function AiFieldSuggestionsPanel({
  entityType,
  entityId,
  entityLabel,
  canGenerate = false,
  canApply = false,
}: AiFieldSuggestionsPanelProps) {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBatchLoading, setIsBatchLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // ── Load suggestions ─────────────────────────────────────────────────────
  const { data: suggestions, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.ai.fieldSuggestions(entityType, entityId),
    queryFn: async () => {
      const result = await getAiFieldSuggestions({ entityType, entityId });
      if (!result.success) throw new Error(result.error ?? "Failed to load suggestions");
      return result.data ?? [];
    },
    enabled: !!entityId,
    staleTime: 30_000,
  });

  const pendingSuggestions = (suggestions ?? []).filter((s) => s.status === "pending");
  const activeSuggestions = (suggestions ?? []).filter(
    (s) => !["superseded"].includes(s.status)
  );

  // ── Generate ─────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const result = await generateAiFieldSuggestions({ entityType, entityId });
      if (result.success && result.data) {
        toast.success(
          `Generated ${result.data.generatedCount} suggestion(s) from ${result.data.linkedDocumentCount} linked document(s).`
        );
        invalidateAiFieldSuggestions(queryClient, entityType, entityId);
        setSelectedIds(new Set());
      } else {
        const msg = result.error ?? "Generation failed.";
        setGenerateError(msg);
        // Do not toast raw errors that may contain counts (they are safe here)
        toast.error("AI generation: " + msg.slice(0, 150));
      }
    } catch {
      setGenerateError("Unexpected error during generation.");
      toast.error("AI generation failed unexpectedly.");
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Accept ───────────────────────────────────────────────────────────────
  const handleAccept = async (suggestion: AiFieldSuggestionRow) => {
    setActionLoading((prev) => ({ ...prev, [suggestion.id]: true }));
    try {
      const result = await acceptAiFieldSuggestion({ suggestionId: suggestion.id });
      if (result.success) {
        toast.success(`Accepted suggestion for "${suggestion.fieldLabel}".`);
        invalidateAiFieldSuggestions(queryClient, entityType, entityId);
      } else {
        toast.error(result.error ?? "Accept failed.");
      }
    } catch {
      toast.error("Accept failed unexpectedly.");
    } finally {
      setActionLoading((prev) => ({ ...prev, [suggestion.id]: false }));
    }
  };

  // ── Reject ───────────────────────────────────────────────────────────────
  const handleReject = async (suggestion: AiFieldSuggestionRow) => {
    setActionLoading((prev) => ({ ...prev, [suggestion.id]: true }));
    try {
      const result = await rejectAiFieldSuggestion({ suggestionId: suggestion.id });
      if (result.success) {
        toast.success(`Rejected suggestion for "${suggestion.fieldLabel}".`);
        invalidateAiFieldSuggestions(queryClient, entityType, entityId);
        setSelectedIds((prev) => { const n = new Set(prev); n.delete(suggestion.id); return n; });
      } else {
        toast.error(result.error ?? "Reject failed.");
      }
    } catch {
      toast.error("Reject failed unexpectedly.");
    } finally {
      setActionLoading((prev) => ({ ...prev, [suggestion.id]: false }));
    }
  };

  // ── Apply ────────────────────────────────────────────────────────────────
  const handleApply = async (suggestion: AiFieldSuggestionRow) => {
    setActionLoading((prev) => ({ ...prev, [suggestion.id]: true }));
    try {
      const result = await applyAiFieldSuggestion({ suggestionId: suggestion.id });
      if (result.success) {
        toast.success(`Applied "${suggestion.fieldLabel}" — please refresh the form to see updated value.`);
        invalidateAiFieldSuggestions(queryClient, entityType, entityId);
      } else {
        toast.error(result.error ?? "Apply failed.");
      }
    } catch {
      toast.error("Apply failed unexpectedly.");
    } finally {
      setActionLoading((prev) => ({ ...prev, [suggestion.id]: false }));
    }
  };

  // ── Accept & Apply single ─────────────────────────────────────────────────
  const handleAcceptAndApply = async (suggestion: AiFieldSuggestionRow) => {
    setActionLoading((prev) => ({ ...prev, [suggestion.id]: true }));
    try {
      const acceptResult = await acceptAiFieldSuggestion({ suggestionId: suggestion.id });
      if (!acceptResult.success) {
        toast.error("Accept failed: " + (acceptResult.error ?? "Unknown error."));
        return;
      }
      const applyResult = await applyAiFieldSuggestion({ suggestionId: suggestion.id });
      if (applyResult.success) {
        toast.success(`Applied "${suggestion.fieldLabel}" — refresh the form to see the update.`);
      } else {
        toast.error("Apply failed: " + (applyResult.error ?? "Unknown error."));
      }
      invalidateAiFieldSuggestions(queryClient, entityType, entityId);
    } catch {
      toast.error("Accept & Apply failed unexpectedly.");
    } finally {
      setActionLoading((prev) => ({ ...prev, [suggestion.id]: false }));
    }
  };

  // ── Batch accept & apply ─────────────────────────────────────────────────
  const handleBatchAcceptApply = async () => {
    if (selectedIds.size === 0) return;
    setIsBatchLoading(true);
    try {
      const result = await acceptSelectedAiFieldSuggestions({
        entityType,
        entityId,
        suggestionIds: Array.from(selectedIds),
      });
      if (result.success && result.data) {
        const { appliedCount, failedCount, skippedCount } = result.data;
        toast.success(
          `Batch: ${appliedCount} applied, ${failedCount} failed, ${skippedCount} skipped. Refresh the form to see updates.`
        );
        invalidateAiFieldSuggestions(queryClient, entityType, entityId);
        setSelectedIds(new Set());
      } else {
        toast.error(result.error ?? "Batch apply failed.");
      }
    } catch {
      toast.error("Batch operation failed unexpectedly.");
    } finally {
      setIsBatchLoading(false);
    }
  };

  // ── Selection helpers ─────────────────────────────────────────────────────
  const toggleSelection = (id: number) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const selectAllPending = () => {
    setSelectedIds(new Set(pendingSuggestions.map((s) => s.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-violet-600" />
          <span className="text-sm font-medium text-slate-700">
            AI Field Suggestions
            {entityLabel && <span className="text-slate-500 font-normal"> — {entityLabel}</span>}
          </span>
          {activeSuggestions.length > 0 && (
            <Badge variant="secondary" className="text-xs">{activeSuggestions.length}</Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            disabled={isLoading}
            className="h-7 px-2 text-xs"
          >
            <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
          </Button>
          {canGenerate && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerate}
              disabled={isGenerating || !entityId}
              className="h-7 text-xs gap-1.5 text-violet-700 border-violet-200 hover:bg-violet-50"
            >
              <Brain className={cn("h-3.5 w-3.5", isGenerating && "animate-pulse")} />
              {isGenerating ? "Generating…" : "Generate Suggestions"}
            </Button>
          )}
        </div>
      </div>

      {/* Human review warning */}
      <Alert className="py-2 border-amber-200 bg-amber-50">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
        <AlertDescription className="text-xs text-amber-700 ml-1">
          AI suggestions require human review. Always verify the suggested value before applying.
        </AlertDescription>
      </Alert>

      {/* Generate error message */}
      {generateError && (
        <Alert variant="destructive" className="py-2">
          <Info className="h-3.5 w-3.5" />
          <AlertDescription className="text-xs ml-1">{generateError}</AlertDescription>
        </Alert>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md" />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="text-center py-6 text-sm text-red-600">
          Failed to load suggestions.{" "}
          <button onClick={() => refetch()} className="underline">Retry</button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && activeSuggestions.length === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <Brain className="h-8 w-8 mx-auto mb-2 text-slate-300" />
          <p>No AI suggestions yet.</p>
          {canGenerate && (
            <p className="text-xs mt-1">
              Link DMS documents to this record, then click <strong>Generate Suggestions</strong>.
            </p>
          )}
          {!canGenerate && (
            <p className="text-xs mt-1 text-violet-600">
              AI generation is currently disabled (<code>ERP_AI_FORM_FILL</code> is off).
            </p>
          )}
        </div>
      )}

      {/* Batch bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2">
          <span className="text-xs text-violet-700 font-medium">
            {selectedIds.size} suggestion(s) selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={clearSelection}
              className="h-6 text-xs px-2"
            >
              Clear
            </Button>
            <Button
              size="sm"
              onClick={handleBatchAcceptApply}
              disabled={isBatchLoading}
              className="h-6 text-xs px-3 bg-violet-600 hover:bg-violet-700 text-white"
            >
              <Zap className="h-3 w-3 mr-1" />
              {isBatchLoading ? "Applying…" : "Accept & Apply Selected"}
            </Button>
          </div>
        </div>
      )}

      {/* Suggestion list */}
      {!isLoading && activeSuggestions.length > 0 && (
        <div className="space-y-2">
          {pendingSuggestions.length > 1 && (
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={selectAllPending} className="h-6 text-xs px-2">
                Select all pending ({pendingSuggestions.length})
              </Button>
            </div>
          )}

          {activeSuggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              isLoading={!!actionLoading[suggestion.id]}
              isSelected={selectedIds.has(suggestion.id)}
              canApply={canApply}
              onToggleSelect={() => toggleSelection(suggestion.id)}
              onAccept={() => handleAccept(suggestion)}
              onReject={() => handleReject(suggestion)}
              onApply={() => handleApply(suggestion)}
              onAcceptAndApply={() => handleAcceptAndApply(suggestion)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Suggestion card ───────────────────────────────────────────────────────────

interface SuggestionCardProps {
  suggestion: AiFieldSuggestionRow;
  isLoading: boolean;
  isSelected: boolean;
  canApply: boolean;
  onToggleSelect: () => void;
  onAccept: () => void;
  onReject: () => void;
  onApply: () => void;
  onAcceptAndApply: () => void;
}

function SuggestionCard({
  suggestion,
  isLoading,
  isSelected,
  canApply,
  onToggleSelect,
  onAccept,
  onReject,
  onApply,
  onAcceptAndApply,
}: SuggestionCardProps) {
  const [showReason, setShowReason] = useState(false);

  const isPending = suggestion.status === "pending";
  const isAccepted = suggestion.status === "accepted";
  const isReadOnly = ["applied", "rejected", "superseded", "failed"].includes(suggestion.status);

  return (
    <div className={cn(
      "rounded-md border p-3 space-y-2 bg-white",
      isPending && "border-violet-200",
      isAccepted && "border-blue-200",
      suggestion.status === "applied" && "border-green-200 bg-green-50/30",
      suggestion.status === "rejected" && "border-slate-200 bg-slate-50 opacity-70",
      suggestion.status === "failed" && "border-red-200 bg-red-50/30",
    )}>
      {/* Top row: select + field + badges */}
      <div className="flex items-start gap-2">
        {isPending && (
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggleSelect}
            className="mt-0.5 border-violet-300"
          />
        )}
        {!isPending && <div className="w-4" />}

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-slate-800">{suggestion.fieldLabel}</span>
            <AiSuggestionStatusBadge status={suggestion.status} />
            <AiSuggestionTypeBadge type={suggestion.suggestionType} />
            <AiConfidenceBadge score={suggestion.confidenceScore} />
          </div>

          {/* Values diff */}
          <div className="grid grid-cols-2 gap-2 text-xs mt-1.5">
            <div className="space-y-0.5">
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Current</span>
              <p className={cn("text-slate-600 truncate", !suggestion.currentValue && "text-slate-400 italic")}>
                {suggestion.currentValue || "(empty)"}
              </p>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] font-medium text-violet-500 uppercase tracking-wide">AI Suggests</span>
              <p className={cn("font-medium truncate", !suggestion.suggestedValue ? "text-slate-400 italic" : "text-slate-800")}>
                {suggestion.suggestedValue || "(clear field)"}
              </p>
            </div>
          </div>

          {/* Apply error */}
          {suggestion.applyError && (
            <p className="text-xs text-red-600 mt-1">{suggestion.applyError}</p>
          )}

          {/* Source evidence reference — metadata only */}
          {suggestion.sourceDocumentId && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <FileText className="h-3 w-3 text-slate-400 flex-shrink-0" />
              <span className="text-[11px] text-slate-500">
                Source: Doc #{suggestion.sourceDocumentId}
                {suggestion.sourceDocumentType && ` (${suggestion.sourceDocumentType})`}
              </span>
              {/* Collapsed excerpt popover — safe, max 500 chars already stored */}
              {suggestion.sourceExcerpt && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="text-[10px] text-violet-600 underline hover:text-violet-800">
                      View excerpt
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 text-xs text-slate-700 p-3 leading-relaxed">
                    <p className="font-medium text-slate-500 mb-1 text-[10px] uppercase tracking-wide">
                      Source Excerpt (stored, capped at 500 chars)
                    </p>
                    {suggestion.sourceExcerpt}
                  </PopoverContent>
                </Popover>
              )}
            </div>
          )}

          {/* AI Reason — collapsible */}
          {suggestion.aiReason && (
            <div>
              <button
                onClick={() => setShowReason((v) => !v)}
                className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700"
              >
                {showReason ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                AI Reason
              </button>
              {showReason && (
                <p className="text-xs text-slate-600 mt-1 pl-3 border-l-2 border-slate-200">
                  {suggestion.aiReason}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        {!isReadOnly && !isLoading && (
          <div className="flex flex-col gap-1 flex-shrink-0">
            {isPending && canApply && (
              <>
                <Button
                  size="sm"
                  variant="default"
                  onClick={onAcceptAndApply}
                  className="h-6 text-[11px] px-2 bg-violet-600 hover:bg-violet-700"
                >
                  <Zap className="h-2.5 w-2.5 mr-0.5" />
                  Accept & Apply
                </Button>
                <Button size="sm" variant="outline" onClick={onAccept} className="h-6 text-[11px] px-2">
                  <CheckCircle2 className="h-2.5 w-2.5 mr-0.5 text-blue-600" />
                  Accept
                </Button>
                <Button size="sm" variant="ghost" onClick={onReject} className="h-6 text-[11px] px-2 text-slate-600">
                  <XCircle className="h-2.5 w-2.5 mr-0.5" />
                  Reject
                </Button>
              </>
            )}
            {isPending && !canApply && (
              <>
                <Button size="sm" variant="outline" onClick={onAccept} className="h-6 text-[11px] px-2">
                  <CheckCircle2 className="h-2.5 w-2.5 mr-0.5 text-blue-600" />
                  Accept
                </Button>
                <Button size="sm" variant="ghost" onClick={onReject} className="h-6 text-[11px] px-2 text-slate-600">
                  <XCircle className="h-2.5 w-2.5 mr-0.5" />
                  Reject
                </Button>
              </>
            )}
            {isAccepted && canApply && (
              <>
                <Button
                  size="sm"
                  onClick={onApply}
                  className="h-6 text-[11px] px-2 bg-green-600 hover:bg-green-700 text-white"
                >
                  <Zap className="h-2.5 w-2.5 mr-0.5" />
                  Apply
                </Button>
                <Button size="sm" variant="ghost" onClick={onReject} className="h-6 text-[11px] px-2 text-slate-600">
                  <XCircle className="h-2.5 w-2.5 mr-0.5" />
                  Reject
                </Button>
              </>
            )}
          </div>
        )}
        {isLoading && (
          <div className="flex items-center justify-center w-16 flex-shrink-0">
            <RefreshCw className="h-4 w-4 animate-spin text-violet-500" />
          </div>
        )}
      </div>
    </div>
  );
}
