"use client";

/**
 * HR.12 — HR AI Duplicate / Conflict Detection Panel
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Info, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { detectEmployeeDuplicates } from "@/server/actions/hr/ai/hr-ai-duplicates";
import type { HrAiDuplicateOutput } from "@/lib/hr/ai/types";

const CONFIDENCE_LABEL: Record<string, string> = {
  exact_match: "Exact Match",
  fuzzy_name: "Fuzzy Name",
  same_id_doc: "Same ID Document",
  candidate_link: "Candidate Link",
};

interface Props { employeeId: number; canUse: boolean }

export function HrAiDuplicatesPanel({ employeeId, canUse }: Props) {
  const [result, setResult] = useState<HrAiDuplicateOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [featureDisabled, setFeatureDisabled] = useState(false);

  const handleCheck = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await detectEmployeeDuplicates(employeeId);
      if (res.success) {
        setResult(res.data);
        if (res.data.duplicates.length > 0) {
          toast.warning(`${res.data.duplicates.length} potential duplicate(s) found — HR review required.`);
        } else {
          toast.success("No duplicates detected.");
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
    return <Alert variant="default" className="bg-muted/40"><Info className="h-4 w-4" /><AlertDescription className="text-xs">hr.ai.use permission required.</AlertDescription></Alert>;
  }
  if (featureDisabled) {
    return <Alert variant="default" className="bg-muted/40"><Info className="h-4 w-4" /><AlertDescription className="text-xs">HR AI duplicate detection is disabled. Enable in Settings → AI Settings.</AlertDescription></Alert>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Duplicate / Conflict Check</p>
          <p className="text-xs text-muted-foreground">Checks for possible duplicate employee records using deterministic rules (same ID, email, mobile). No auto-merge.</p>
        </div>
        <Button size="sm" variant="outline" onClick={handleCheck} disabled={isLoading} className="shrink-0 gap-1.5">
          <Brain className="h-3.5 w-3.5" />
          {isLoading ? "Checking…" : "Check Duplicates"}
        </Button>
      </div>

      {isLoading && <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>}
      {error && !isLoading && <Alert variant="destructive"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}

      {result && !isLoading && (
        <>
          {result.checksPerformed.length > 0 && (
            <div className="text-[10px] text-muted-foreground">
              Checks performed: {result.checksPerformed.join(", ")}
            </div>
          )}
          {result.summary && <p className="text-xs text-muted-foreground italic">{result.summary}</p>}

          {result.duplicates.length === 0 ? (
            <div className="flex items-center gap-1.5 text-sm text-emerald-600 py-2">
              <CheckCircle2 className="h-4 w-4" /> No duplicates or conflicts detected.
            </div>
          ) : (
            <div className="space-y-2">
              {result.duplicates.map((d, i) => (
                <div key={i} className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <Badge variant="outline" className="text-[9px] border-amber-400 text-amber-700">
                          {CONFIDENCE_LABEL[d.possibleDuplicateType] ?? d.possibleDuplicateType}
                        </Badge>
                        <span className="text-[10px] text-amber-600">
                          {Math.round(d.confidence * 100)}% confidence
                        </span>
                      </div>
                      <p className="text-xs font-medium text-amber-800">
                        {d.recordALabel} ↔ {d.recordBLabel}
                      </p>
                      <p className="text-[10px] text-amber-700 mt-0.5">
                        Matched: {d.matchedFields.join(", ")}
                      </p>
                      <p className="text-[10px] text-amber-600 mt-0.5">{d.reason}</p>
                      <p className="text-[10px] font-medium text-amber-800 mt-1">
                        → {d.recommendedAction}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground italic">Human review required. No records are merged automatically.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
