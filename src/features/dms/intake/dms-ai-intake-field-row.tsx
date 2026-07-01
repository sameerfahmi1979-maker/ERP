"use client";

import { cn } from "@/lib/utils";
import { DmsAiConfidenceBadge } from "@/features/dms/ai/dms-ai-confidence-badge";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DmsAiIntakeFieldRowProps {
  label: string;
  required?: boolean;
  aiSuggestedValue?: string | null;
  confidenceLabel?: string | null;
  confidenceScore?: number | null;
  sourceSnippet?: string | null;
  reviewWarning?: string | null;
  children: React.ReactNode;
  className?: string;
}

export function DmsAiIntakeFieldRow({
  label,
  required,
  aiSuggestedValue,
  confidenceLabel,
  confidenceScore,
  sourceSnippet,
  reviewWarning,
  children,
  className,
}: DmsAiIntakeFieldRowProps) {
  const isLowConfidence =
    confidenceLabel === "low" || confidenceLabel === "needs_manual_review";
  const hasAiSuggestion = !!aiSuggestedValue || confidenceLabel != null;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-foreground">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </label>
        <div className="flex items-center gap-1.5">
          {hasAiSuggestion && (
            <DmsAiConfidenceBadge label={confidenceLabel ?? "needs_manual_review"} score={confidenceScore} />
          )}
          {sourceSnippet && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <span className="inline-flex cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                    <Info className="h-3.5 w-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  <p className="font-medium mb-1">Source:</p>
                  <p className="italic text-muted-foreground" dir="auto">
                    &ldquo;{sourceSnippet}&rdquo;
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
      <div
        className={cn(
          "rounded-md",
          isLowConfidence && "ring-2 ring-amber-300 dark:ring-amber-700"
        )}
      >
        {children}
      </div>
      {reviewWarning && (
        <p className="text-[11px] text-orange-600 dark:text-orange-400 font-medium">
          ⚠ {reviewWarning}
        </p>
      )}
      {isLowConfidence && !reviewWarning && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
          ⚠ Needs Review — AI confidence is low
        </p>
      )}
    </div>
  );
}
