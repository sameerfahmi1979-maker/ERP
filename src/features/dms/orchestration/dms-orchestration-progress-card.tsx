"use client";

/**
 * ERP DMS AI ORCH.1 — Orchestration Progress Card
 *
 * Shows the per-step AI pipeline status for a DMS upload session intake.
 * Displayed on the intake review page while best-effort steps run.
 *
 * Security rules:
 * - Only displays step codes, statuses, duration, and safe error messages.
 * - NEVER displays OCR text, AI prompts, raw AI responses, or content text.
 * - Evidence excerpts and AI responses are never shown here.
 */

import { useState, useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  CheckCircle2, XCircle, Clock, SkipForward, Loader2,
  ChevronDown, ChevronUp, AlertTriangle, Sparkles, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query/query-keys";
import { invalidateDmsOrchestrationStatus } from "@/lib/query/invalidation";
import {
  runDmsAiOrchestrationPostDraft,
  getDmsOrchestrationStatus,
  retryDmsOrchestrationStep,
} from "@/server/actions/dms/orchestration";
import type {
  DmsAiOrchestrationStepResult,
  DmsAiOrchestrationStatus,
  DmsAiOrchestrationStepCode,
} from "@/lib/dms/orchestration/types";

// ── Step display metadata ─────────────────────────────────────────────────────

const STEP_LABELS: Record<string, string> = {
  upload_received:  "Upload",
  ocr_and_extraction: "OCR & AI Extraction",
  draft_ready:      "Draft Ready",
  content_sync:     "Content Text",
  ai_summary:       "AI Summary",
  intelligence:     "Completeness & Risk",
  embedding:        "Semantic Embedding",
  tag_suggestions:  "Tag Suggestions",
  link_suggestions: "Smart Links",
  ready_for_review: "Ready for Review",
};

const RETRYABLE_STEPS: DmsAiOrchestrationStepCode[] = [
  "content_sync", "ai_summary", "intelligence", "embedding", "tag_suggestions", "link_suggestions",
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface DmsOrchestrationProgressCardProps {
  sessionCode: string;
  documentId: number | null;
  /** Auto-trigger the pipeline on mount (true for new sessions) */
  autoTrigger?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DmsOrchestrationProgressCard({
  sessionCode,
  documentId,
  autoTrigger = false,
}: DmsOrchestrationProgressCardProps) {
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [retryingStep, setRetryingStep] = useState<string | null>(null);

  // Load current status
  const { data: statusData, isLoading } = useQuery({
    queryKey: queryKeys.dms.orchestrationStatus(sessionCode),
    queryFn: async () => {
      const result = await getDmsOrchestrationStatus({ sessionCode });
      if (!result.success) return null;
      return result.data;
    },
    enabled: !!sessionCode,
    staleTime: 5_000,
    refetchInterval: isRunning ? 3_000 : false,
  });

  const orchestrationStatus = statusData?.orchestrationStatus ?? "pending";
  const steps = statusData?.steps ?? [];

  // Auto-trigger on mount if requested and not already done
  useEffect(() => {
    if (!autoTrigger || !documentId || !sessionCode) return;
    if (["complete", "complete_with_warnings", "running"].includes(orchestrationStatus)) return;

    void triggerPipeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTrigger, documentId, sessionCode]);

  const triggerPipeline = async () => {
    if (isRunning || !documentId) return;
    setIsRunning(true);

    try {
      const result = await runDmsAiOrchestrationPostDraft({ sessionCode });
      invalidateDmsOrchestrationStatus(queryClient, sessionCode);

      if (!result.success) {
        // Controlled error — check if it's a flag-disabled message
        if (result.error?.includes("not enabled")) {
          // Flag disabled — no toast, just quiet failure
        } else {
          toast.error("AI pipeline: " + (result.error ?? "Failed.").slice(0, 150));
        }
      } else if (result.data?.failedStepCount && result.data.failedStepCount > 0) {
        toast.warning(`AI pipeline: ${result.data.completedStepCount} step(s) complete, ${result.data.failedStepCount} failed. You can retry failed steps.`);
      } else {
        toast.success(`AI pipeline complete — ${result.data?.completedStepCount ?? 0} step(s) ready.`);
      }
    } catch {
      toast.error("AI pipeline encountered an error.");
    } finally {
      setIsRunning(false);
      invalidateDmsOrchestrationStatus(queryClient, sessionCode);
    }
  };

  const handleRetryStep = async (stepCode: DmsAiOrchestrationStepCode) => {
    setRetryingStep(stepCode);
    try {
      const result = await retryDmsOrchestrationStep({ sessionCode, stepCode });
      invalidateDmsOrchestrationStatus(queryClient, sessionCode);
      if (result.success) {
        toast.success(`Step "${STEP_LABELS[stepCode] ?? stepCode}" retried.`);
      } else {
        toast.error(result.error ?? "Retry failed.");
      }
    } catch {
      toast.error("Retry failed.");
    } finally {
      setRetryingStep(null);
    }
  };

  // If flag disabled and nothing ran
  if (orchestrationStatus === "skipped_feature_disabled") {
    return (
      <div className="text-xs text-slate-400 flex items-center gap-1.5 py-1">
        <Sparkles className="h-3 w-3" />
        Full AI pipeline orchestration is not enabled. Standard AI Fill is available.
      </div>
    );
  }

  // Phase 9: job enqueued — show minimal queued state card
  if (orchestrationStatus === "queued") {
    return (
      <div className="rounded-lg border bg-slate-50 border-slate-200 px-3 py-2">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-blue-500" />
          <span className="text-xs font-medium text-slate-700">AI Pipeline</span>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-blue-50 text-blue-600 border-blue-200">Queued</Badge>
        </div>
        <p className="text-[11px] text-slate-500 mt-1 ml-5.5">
          AI pipeline is queued for background processing. Refresh to check progress.
        </p>
      </div>
    );
  }

  if (isLoading) return null;

  // Don't show card if pipeline never ran and not auto-triggering
  if (orchestrationStatus === "pending" && !isRunning && !autoTrigger) return null;

  return (
    <div className="rounded-lg border bg-slate-50 border-slate-200">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer"
        onClick={() => setIsExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 text-violet-500 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 text-violet-600" />
          )}
          <span className="text-xs font-medium text-slate-700">AI Pipeline</span>
          <OrchestrationStatusBadge status={orchestrationStatus as DmsAiOrchestrationStatus} isRunning={isRunning} />
        </div>
        <div className="flex items-center gap-1.5">
          {!isRunning && orchestrationStatus === "pending" && documentId && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => { e.stopPropagation(); void triggerPipeline(); }}
              className="h-5 text-[10px] px-2 border-violet-200 text-violet-700"
            >
              Run Pipeline
            </Button>
          )}
          {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
        </div>
      </div>

      {/* Step list */}
      {isExpanded && (
        <div className="border-t border-slate-200 px-3 py-2 space-y-1">
          {steps.map((step) => (
            <StepRow
              key={step.step}
              step={step}
              isRetrying={retryingStep === step.step}
              canRetry={RETRYABLE_STEPS.includes(step.step as DmsAiOrchestrationStepCode) && step.status === "failed"}
              onRetry={() => handleRetryStep(step.step as DmsAiOrchestrationStepCode)}
            />
          ))}
          {steps.length === 0 && isRunning && (
            <div className="text-xs text-slate-400 py-1">Running AI pipeline…</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Step row ──────────────────────────────────────────────────────────────────

function StepRow({
  step,
  isRetrying,
  canRetry,
  onRetry,
}: {
  step: DmsAiOrchestrationStepResult;
  isRetrying: boolean;
  canRetry: boolean;
  onRetry: () => void;
}) {
  const label = STEP_LABELS[step.step] ?? step.step;

  return (
    <div className="flex items-center gap-2 py-0.5">
      <StepStatusIcon status={step.status} isRetrying={isRetrying} />
      <span className={cn(
        "text-xs flex-1 truncate",
        step.status === "completed" ? "text-slate-700" : "",
        step.status === "failed" ? "text-red-600" : "",
        step.status === "skipped" ? "text-slate-400" : "",
        step.status === "pending" ? "text-slate-400" : "",
        step.status === "running" ? "text-violet-600" : "",
      )}>
        {label}
        {step.durationMs && step.status === "completed" && (
          <span className="text-slate-400 ml-1">({step.durationMs}ms)</span>
        )}
      </span>
      {step.status === "failed" && step.safeErrorMessage && (
        <span className="text-[10px] text-red-500 truncate max-w-[160px]" title={step.safeErrorMessage}>
          {step.safeErrorMessage}
        </span>
      )}
      {canRetry && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onRetry}
          disabled={isRetrying}
          className="h-4 text-[9px] px-1.5 text-red-600 hover:text-red-700"
        >
          {isRetrying ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5" />}
        </Button>
      )}
    </div>
  );
}

function StepStatusIcon({ status, isRetrying }: { status: string; isRetrying: boolean }) {
  if (isRetrying) return <Loader2 className="h-3 w-3 text-violet-500 animate-spin flex-shrink-0" />;
  switch (status) {
    case "completed": return <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />;
    case "failed":    return <XCircle className="h-3 w-3 text-red-400 flex-shrink-0" />;
    case "skipped":   return <SkipForward className="h-3 w-3 text-slate-300 flex-shrink-0" />;
    case "running":   return <Loader2 className="h-3 w-3 text-violet-500 animate-spin flex-shrink-0" />;
    default:          return <Clock className="h-3 w-3 text-slate-300 flex-shrink-0" />;
  }
}

// ── Status badge ──────────────────────────────────────────────────────────────

function OrchestrationStatusBadge({ status, isRunning }: { status: DmsAiOrchestrationStatus; isRunning: boolean }) {
  if (isRunning) {
    return <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-violet-50 text-violet-600 border-violet-200">Running…</Badge>;
  }
  switch (status) {
    case "complete":
      return <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-green-50 text-green-700 border-green-200">Complete</Badge>;
    case "complete_with_warnings":
      return <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-0.5"><AlertTriangle className="h-2.5 w-2.5" />Warnings</Badge>;
    case "failed":
      return <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-red-50 text-red-600 border-red-200">Failed</Badge>;
    case "queued":
      return <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-blue-50 text-blue-600 border-blue-200">Queued</Badge>;
    case "skipped_feature_disabled":
      return <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-slate-400 border-slate-200">Disabled</Badge>;
    default:
      return null;
  }
}
