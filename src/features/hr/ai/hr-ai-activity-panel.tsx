"use client";

/**
 * HR.12 — HR AI Activity Log Panel
 *
 * Shows recent AI activity/usage for this employee.
 * No raw prompts, responses, or sensitive data displayed.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Info, CheckCircle2, XCircle } from "lucide-react";
import { listHrAiActivity } from "@/server/actions/hr/ai/hr-ai-activity";
import type { HrAiActivityRecord } from "@/lib/hr/ai/types";

const FEATURE_LABELS: Record<string, string> = {
  ERP_AI_HR_FILL: "Document Fill",
  ERP_AI_HR_CORRECTIONS: "Corrections",
  ERP_AI_HR_DUPLICATES: "Duplicate Check",
  ERP_AI_HR_SEARCH_ASSIST: "Search Assist",
  ERP_AI_HR_COMPLIANCE_EXPLAIN: "Compliance",
  ERP_AI_HR_READINESS_EXPLAIN: "Readiness",
  ERP_AI_HR_LETTER_DRAFT: "Letter Draft",
  ERP_AI_HR_EMAIL_DRAFT: "Email Draft",
};

interface Props { employeeId: number; canView: boolean }

export function HrAiActivityPanel({ employeeId, canView }: Props) {
  const [records, setRecords] = useState<HrAiActivityRecord[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoad = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await listHrAiActivity("employee", employeeId);
      if (res.success) {
        setRecords(res.data);
      } else {
        setError(res.error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!canView) {
    return (
      <Alert variant="default" className="bg-muted/40">
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">hr.ai.view permission required to see AI activity.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">AI Activity History</p>
          <p className="text-xs text-muted-foreground">Recent HR AI calls for this employee. No prompts or sensitive data stored.</p>
        </div>
        <Button size="sm" variant="outline" onClick={handleLoad} disabled={isLoading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading && <div className="space-y-1">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}</div>}
      {error && !isLoading && <Alert variant="destructive"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}

      {records !== null && !isLoading && (
        records.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No HR AI activity yet for this employee.</p>
        ) : (
          <div className="space-y-1">
            {records.map((r) => (
              <div key={r.id} className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
                {r.status === "success" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium">
                      {FEATURE_LABELS[r.featureCode] ?? r.featureCode}
                    </span>
                    {r.model && <Badge variant="secondary" className="text-[9px]">{r.model}</Badge>}
                  </div>
                  {(r.promptTokens != null || r.completionTokens != null) && (
                    <span className="text-[10px] text-muted-foreground">
                      {r.promptTokens ?? 0}+{r.completionTokens ?? 0} tokens
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {new Date(r.createdAt).toLocaleString("en-AE", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
