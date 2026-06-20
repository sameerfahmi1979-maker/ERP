"use client";

/**
 * HR.12 — HR AI Fill from Documents Panel
 *
 * Shows AI suggestions extracted from linked DMS documents.
 * User reviews and copies values manually — no auto-save.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, FileText, Info } from "lucide-react";
import { toast } from "sonner";
import { generateEmployeeDocumentFillSuggestions } from "@/server/actions/hr/ai/employee-ai-fill";
import { HrAiSuggestionCard } from "./hr-ai-suggestion-card";
import type { HrAiDocumentFillOutput } from "@/lib/hr/ai/types";

interface HrAiFillPanelProps {
  employeeId: number;
  canUse: boolean;
}

export function HrAiFillPanel({ employeeId, canUse }: HrAiFillPanelProps) {
  const [result, setResult] = useState<HrAiDocumentFillOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [featureDisabled, setFeatureDisabled] = useState(false);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await generateEmployeeDocumentFillSuggestions(employeeId);
      if (res.success) {
        setResult(res.data);
        if (res.data.suggestions.length === 0) {
          toast.info("No suggestions found — ensure DMS documents are linked to this employee.");
        } else {
          toast.success(`${res.data.suggestions.length} suggestion(s) generated.`);
        }
      } else {
        if (res.featureDisabled) setFeatureDisabled(true);
        setError(res.error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!canUse) {
    return (
      <Alert variant="default" className="bg-muted/40">
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          You do not have permission to use HR AI features (<code>hr.ai.use</code> required).
        </AlertDescription>
      </Alert>
    );
  }

  if (featureDisabled) {
    return (
      <Alert variant="default" className="bg-muted/40">
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          HR AI document fill is currently disabled. Enable it in Settings → AI Settings.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Fill from Documents</p>
          <p className="text-xs text-muted-foreground">
            AI reviews linked DMS documents and suggests field values for this employee profile.
            Review each suggestion — nothing is saved automatically.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleGenerate}
          disabled={isLoading}
          className="shrink-0 gap-1.5"
        >
          <Brain className="h-3.5 w-3.5" />
          {isLoading ? "Analysing…" : "Analyse Documents"}
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      )}

      {error && !isLoading && (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {result && !isLoading && (
        <>
          {result.documentsReviewed > 0 && (
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {result.documentsReviewed} document(s) reviewed
            </div>
          )}
          {result.warning && (
            <Alert variant="default" className="py-2">
              <AlertDescription className="text-xs">{result.warning}</AlertDescription>
            </Alert>
          )}
          {result.suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No field suggestions found from linked documents.
            </p>
          ) : (
            <div className="space-y-2">
              {result.suggestions.map((s, i) => (
                <HrAiSuggestionCard
                  key={i}
                  fieldLabel={s.fieldLabel}
                  currentValue={s.currentValue}
                  suggestedValue={s.suggestedValue}
                  confidence={s.confidence}
                  reason={s.reason}
                  isConflict={s.isConflict}
                  requiresReview={s.requiresReview}
                  sourceDocumentName={s.sourceDocumentName}
                />
              ))}
              <p className="text-[10px] text-muted-foreground italic pt-1">
                All suggestions require human review. Use the copy button to apply values to the Profile form manually.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
