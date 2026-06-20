"use client";

/**
 * HR.12 — HR AI Readiness Explanation Panel
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Info, CheckCircle2, XCircle, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { explainEmployeeReadiness } from "@/server/actions/hr/ai/employee-ai-review";
import type { HrAiReadinessExplanation } from "@/lib/hr/ai/types";
import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  ready:        { color: "text-emerald-600", Icon: CheckCircle2 },
  not_ready:    { color: "text-red-600",     Icon: XCircle },
  blocked:      { color: "text-red-700",     Icon: XCircle },
  expired:      { color: "text-orange-600",  Icon: AlertTriangle },
  needs_review: { color: "text-amber-600",   Icon: Clock },
  unknown:      { color: "text-muted-foreground", Icon: Info },
};

interface Props { employeeId: number; canUse: boolean }

export function HrAiReadinessPanel({ employeeId, canUse }: Props) {
  const [result, setResult] = useState<HrAiReadinessExplanation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [featureDisabled, setFeatureDisabled] = useState(false);

  const handleExplain = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await explainEmployeeReadiness(employeeId);
      if (res.success) {
        setResult(res.data);
        toast.success("Readiness explanation generated.");
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
    return <Alert variant="default" className="bg-muted/40"><Info className="h-4 w-4" /><AlertDescription className="text-xs">HR AI readiness explanation is disabled. Enable in Settings → AI Settings.</AlertDescription></Alert>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Readiness Explanation</p>
          <p className="text-xs text-muted-foreground">AI explains why this employee is or is not operationally ready, and what HR needs to do.</p>
        </div>
        <Button size="sm" variant="outline" onClick={handleExplain} disabled={isLoading} className="shrink-0 gap-1.5">
          <Brain className="h-3.5 w-3.5" />
          {isLoading ? "Explaining…" : "Explain Readiness"}
        </Button>
      </div>

      {isLoading && <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>}
      {error && !isLoading && <Alert variant="destructive"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}

      {result && !isLoading && (
        <div className="space-y-3">
          {(() => {
            const cfg = STATUS_CONFIG[result.overallStatus] ?? STATUS_CONFIG.unknown;
            return (
              <div className={cn("flex items-center gap-1.5 text-sm font-medium", cfg.color)}>
                <cfg.Icon className="h-4 w-4" />
                {result.overallStatus.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                {result.estimatedClearanceSteps != null && result.estimatedClearanceSteps > 0 && (
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    ({result.estimatedClearanceSteps} step(s) to clear)
                  </span>
                )}
              </div>
            );
          })()}

          {result.summary && <p className="text-xs text-muted-foreground">{result.summary}</p>}

          {result.blockingItems.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-1.5">Blocking Issues</p>
              <div className="space-y-1">
                {result.blockingItems.map((item, i) => (
                  <div key={i} className="text-xs border border-red-200 bg-red-50 rounded p-2">
                    <span className="font-medium text-red-700">{item.item}</span>
                    {item.reason && <span className="text-red-500 ml-1">— {item.reason}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.recommendedNextSteps.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-1.5">Steps to Clear</p>
              <ol className="space-y-1">
                {result.recommendedNextSteps.map((step, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                    <span className="font-mono shrink-0">{i + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground italic">AI explanation is advisory. Final readiness decisions rest with HR management.</p>
        </div>
      )}
    </div>
  );
}
