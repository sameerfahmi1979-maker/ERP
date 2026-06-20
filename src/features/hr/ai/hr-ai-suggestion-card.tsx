"use client";

/**
 * HR.12 — HR AI Suggestion Card
 *
 * Reusable card component for displaying a single AI suggestion.
 * Human review is always required before any value is used.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SuggestionCardProps {
  fieldLabel: string;
  currentValue?: string | null;
  suggestedValue: string;
  confidence: number;
  reason?: string | null;
  isConflict?: boolean;
  requiresReview?: boolean;
  sourceDocumentName?: string | null;
  onCopy?: (value: string) => void;
  className?: string;
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.85) return "text-emerald-600";
  if (confidence >= 0.65) return "text-amber-500";
  return "text-red-500";
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.85) return "High";
  if (confidence >= 0.65) return "Medium";
  return "Low";
}

export function HrAiSuggestionCard({
  fieldLabel,
  currentValue,
  suggestedValue,
  confidence,
  reason,
  isConflict,
  requiresReview,
  sourceDocumentName,
  onCopy,
  className,
}: SuggestionCardProps) {
  const handleCopy = () => {
    if (onCopy) {
      onCopy(suggestedValue);
    } else {
      navigator.clipboard.writeText(suggestedValue).catch(() => {});
    }
    toast.success(`Copied suggestion for "${fieldLabel}"`);
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-3 bg-card text-card-foreground",
        isConflict ? "border-amber-400" : "border-border",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className="text-xs font-semibold text-foreground">{fieldLabel}</span>
            {isConflict && (
              <Badge variant="outline" className="text-[9px] border-amber-400 text-amber-600">
                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                Conflict
              </Badge>
            )}
            {requiresReview && (
              <Badge variant="outline" className="text-[9px]">
                <Info className="h-2.5 w-2.5 mr-0.5" />
                Review Required
              </Badge>
            )}
          </div>

          {currentValue && (
            <div className="text-[10px] text-muted-foreground mb-1">
              Current: <span className="font-mono">{currentValue}</span>
            </div>
          )}

          <div className="text-sm font-medium text-foreground">
            → {suggestedValue}
          </div>

          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={cn("text-[10px] font-medium", confidenceColor(confidence))}>
              {confidenceLabel(confidence)} confidence ({Math.round(confidence * 100)}%)
            </span>
            {sourceDocumentName && (
              <span className="text-[10px] text-muted-foreground">
                Source: {sourceDocumentName}
              </span>
            )}
          </div>

          {reason && (
            <p className="text-[10px] text-muted-foreground mt-1 italic">{reason}</p>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 shrink-0"
          onClick={handleCopy}
          title="Copy suggested value"
        >
          <Copy className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
