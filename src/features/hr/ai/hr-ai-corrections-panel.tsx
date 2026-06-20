"use client";

/**
 * HR.12 — HR AI Correction Suggestions Panel
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Info, AlertTriangle, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { generateEmployeeCorrectionSuggestions } from "@/server/actions/hr/ai/employee-ai-review";
import type { HrAiCorrectionOutput } from "@/lib/hr/ai/types";
import { cn } from "@/lib/utils";

const SEVERITY_CONFIG = {
  critical: { color: "text-red-600 border-red-300 bg-red-50", icon: AlertCircle, badge: "destructive" },
  high:     { color: "text-orange-600 border-orange-300 bg-orange-50", icon: AlertTriangle, badge: "destructive" },
  medium:   { color: "text-amber-600 border-amber-200 bg-amber-50", icon: AlertTriangle, badge: "outline" },
  low:      { color: "text-blue-600 border-blue-200 bg-blue-50", icon: Info, badge: "outline" },
  info:     { color: "text-muted-foreground border-border bg-muted/30", icon: Info, badge: "secondary" },
} as const;

interface Props { employeeId: number; canUse: boolean }

export function HrAiCorrectionsPanel({ employeeId, canUse }: Props) {
  const [result, setResult] = useState<HrAiCorrectionOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [featureDisabled, setFeatureDisabled] = useState(false);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await generateEmployeeCorrectionSuggestions(employeeId);
      if (res.success) {
        setResult(res.data);
        toast.success(`${res.data.suggestions.length} suggestion(s) found.`);
      } else {
        if (res.featureDisabled) setFeatureDisabled(true);
        setError(res.error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!canUse) return <PermissionNotice />;
  if (featureDisabled) return <FeatureDisabledNotice />;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Profile Correction Suggestions</p>
          <p className="text-xs text-muted-foreground">
            AI reviews the employee profile for missing fields, inconsistencies, and data quality issues.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={handleGenerate} disabled={isLoading} className="shrink-0 gap-1.5">
          <Brain className="h-3.5 w-3.5" />
          {isLoading ? "Reviewing…" : "Review Profile"}
        </Button>
      </div>

      {isLoading && <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>}

      {error && !isLoading && <Alert variant="destructive"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}

      {result && !isLoading && (
        <>
          <div className="flex items-center gap-2">
            {result.overallHealthScore != null && (
              <span className="text-xs text-muted-foreground">
                Profile health: <strong>{result.overallHealthScore}%</strong>
              </span>
            )}
          </div>
          {result.summary && <p className="text-xs text-muted-foreground italic">{result.summary}</p>}
          {result.suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center flex items-center gap-1 justify-center">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> No data quality issues found.
            </p>
          ) : (
            <div className="space-y-2">
              {result.suggestions.map((s, i) => {
                const cfg = SEVERITY_CONFIG[s.severity] ?? SEVERITY_CONFIG.info;
                const Icon = cfg.icon;
                return (
                  <div key={i} className={cn("rounded-lg border p-3 text-sm", cfg.color)}>
                    <div className="flex items-start gap-2">
                      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <span className="font-medium text-xs">{s.category}</span>
                          <Badge variant={cfg.badge as "destructive" | "outline" | "secondary"} className="text-[9px]">
                            {s.severity}
                          </Badge>
                        </div>
                        <p className="text-xs">{s.recommendedAction}</p>
                        {s.reason && <p className="text-[10px] mt-0.5 opacity-70">{s.reason}</p>}
                        {s.fieldOrTable && <p className="text-[10px] font-mono mt-0.5 opacity-50">{s.fieldOrTable}</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PermissionNotice() {
  return (
    <Alert variant="default" className="bg-muted/40">
      <Info className="h-4 w-4" />
      <AlertDescription className="text-xs">hr.ai.use permission required.</AlertDescription>
    </Alert>
  );
}
function FeatureDisabledNotice() {
  return (
    <Alert variant="default" className="bg-muted/40">
      <Info className="h-4 w-4" />
      <AlertDescription className="text-xs">HR AI corrections is currently disabled. Enable in Settings → AI Settings.</AlertDescription>
    </Alert>
  );
}
