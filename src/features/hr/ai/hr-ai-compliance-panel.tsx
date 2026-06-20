"use client";

/**
 * HR.12 — HR AI Compliance Explanation Panel
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Info, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { explainEmployeeCompliance } from "@/server/actions/hr/ai/employee-ai-review";
import type { HrAiComplianceExplanation } from "@/lib/hr/ai/types";
import { cn } from "@/lib/utils";

const COMPLIANCE_COLORS = {
  compliant:      "text-emerald-600",
  partial:        "text-amber-600",
  non_compliant:  "text-red-600",
  unknown:        "text-muted-foreground",
};

const COMPLIANCE_ICONS = {
  compliant:      CheckCircle2,
  partial:        AlertTriangle,
  non_compliant:  XCircle,
  unknown:        Info,
};

interface Props { employeeId: number; canUse: boolean }

export function HrAiCompliancePanel({ employeeId, canUse }: Props) {
  const [result, setResult] = useState<HrAiComplianceExplanation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [featureDisabled, setFeatureDisabled] = useState(false);

  const handleExplain = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await explainEmployeeCompliance(employeeId);
      if (res.success) {
        setResult(res.data);
        toast.success("Compliance explanation generated.");
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
    return <Alert variant="default" className="bg-muted/40"><Info className="h-4 w-4" /><AlertDescription className="text-xs">HR AI compliance explanation is disabled. Enable in Settings → AI Settings.</AlertDescription></Alert>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Compliance Explanation</p>
          <p className="text-xs text-muted-foreground">AI explains the employee's compliance status based on deterministic document and record data.</p>
        </div>
        <Button size="sm" variant="outline" onClick={handleExplain} disabled={isLoading} className="shrink-0 gap-1.5">
          <Brain className="h-3.5 w-3.5" />
          {isLoading ? "Explaining…" : "Explain Status"}
        </Button>
      </div>

      {isLoading && <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>}
      {error && !isLoading && <Alert variant="destructive"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}

      {result && !isLoading && (
        <div className="space-y-3">
          {/* Status badge */}
          <div className={cn("flex items-center gap-1.5 text-sm font-medium", COMPLIANCE_COLORS[result.overallComplianceLevel])}>
            {(() => { const Icon = COMPLIANCE_ICONS[result.overallComplianceLevel]; return <Icon className="h-4 w-4" />; })()}
            {result.overallComplianceLevel.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </div>

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

          {result.warningItems.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-1.5">Warnings</p>
              <div className="space-y-1">
                {result.warningItems.map((item, i) => (
                  <div key={i} className="text-xs border border-amber-200 bg-amber-50 rounded p-2">
                    <span className="font-medium text-amber-700">{item.item}</span>
                    {item.reason && <span className="text-amber-600 ml-1">— {item.reason}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.recommendedNextSteps.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-1.5">Recommended Next Steps</p>
              <ol className="space-y-1">
                {result.recommendedNextSteps.map((step, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                    <span className="text-muted-foreground font-mono shrink-0">{i + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground italic">AI explanation is advisory only. All compliance decisions require HR review.</p>
        </div>
      )}
    </div>
  );
}
