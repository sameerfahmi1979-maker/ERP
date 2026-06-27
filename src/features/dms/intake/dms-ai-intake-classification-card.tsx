"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DmsAiConfidenceBadge } from "@/features/dms/ai/dms-ai-confidence-badge";
import { getClassificationReviewMeta } from "@/lib/dms/ai/classification-output";
import type { IntakeAiResultRow } from "@/server/actions/dms/ai-intake";

type Props = {
  aiResult: IntakeAiResultRow | null | undefined;
  docTypes: Array<{ id: number; type_code: string; name_en: string }>;
  onSelectAlternative?: (typeCode: string) => void;
};

export function DmsAiIntakeClassificationCard({
  aiResult,
  docTypes,
  onSelectAlternative,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!aiResult) return null;

  const meta = getClassificationReviewMeta(aiResult.raw_response_json);
  const reason = aiResult.classification_reason?.trim();

  return (
    <div className="rounded-md border bg-muted/30 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">AI Classification</span>
        <DmsAiConfidenceBadge
          label={aiResult.classification_confidence}
          score={aiResult.classification_score}
        />
        {meta.needsHumanReview && (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            Needs review
          </Badge>
        )}
      </div>

      {reason && <p className="text-sm text-muted-foreground">{reason}</p>}

      {meta.reviewReason && (
        <p className="text-sm text-amber-700 dark:text-amber-400">{meta.reviewReason}</p>
      )}

      {meta.alternatives.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Alternative types ({meta.alternatives.length})
          </button>
          {expanded && (
            <ul className="space-y-1.5">
              {meta.alternatives.map((alt) => {
                const match = docTypes.find(
                  (t) => t.type_code.toUpperCase() === alt.documentType.toUpperCase()
                );
                return (
                  <li
                    key={alt.documentType}
                    className="flex flex-wrap items-center gap-2 text-sm border rounded px-2 py-1.5 bg-background"
                  >
                    <span className="font-medium">{match?.name_en ?? alt.documentType}</span>
                    <span className="text-xs text-muted-foreground">
                      {(alt.confidence * 100).toFixed(0)}%
                    </span>
                    {alt.reason && (
                      <span className="text-xs text-muted-foreground flex-1 min-w-0 truncate">
                        {alt.reason}
                      </span>
                    )}
                    {onSelectAlternative && match && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => onSelectAlternative(alt.documentType)}
                      >
                        Use this type
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {meta.evidence &&
        (meta.evidence.matchedKeywords.length > 0 ||
          meta.evidence.matchedPatterns.length > 0) && (
          <div className="text-xs text-muted-foreground space-y-1">
            {meta.evidence.matchedKeywords.length > 0 && (
              <p>Matched: {meta.evidence.matchedKeywords.join(", ")}</p>
            )}
            {meta.evidence.matchedPatterns.length > 0 && (
              <p>Patterns: {meta.evidence.matchedPatterns.join(", ")}</p>
            )}
          </div>
        )}
    </div>
  );
}
