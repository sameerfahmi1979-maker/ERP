"use client";

/**
 * DMS 12.3 — DmsDocumentIntelligenceSection
 *
 * Displays document completeness score and risk score.
 * Both are deterministic — no AI calls.
 *
 * Provides:
 *  - Completeness card with score, label, and missing fields
 *  - Risk card with risk level, score, and reasons
 *  - Individual Recalculate buttons
 *  - Combined "Evaluate Document Intelligence" button
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { RefreshCw, ShieldAlert, CheckCircle2, AlertTriangle, AlertCircle, Info, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { queryKeys } from "@/lib/query/query-keys";
import {
  getDmsDocumentCompletenessStatus,
  evaluateDmsDocumentCompleteness,
  type DocumentCompletenessRow,
} from "@/server/actions/dms/ai-completeness";
import {
  getDmsDocumentRiskStatus,
  evaluateDmsDocumentRisk,
  type DocumentRiskRow,
  type RiskLevel,
} from "@/server/actions/dms/ai-risk";
import { evaluateDmsDocumentIntelligence } from "@/server/actions/dms/ai-intelligence";
import { format, parseISO } from "date-fns";

// ── Risk level styling ────────────────────────────────────────────────────────

const RISK_CONFIG: Record<RiskLevel, { label: string; badgeClass: string; icon: React.ReactNode }> = {
  none: {
    label: "No Risk",
    badgeClass: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  low: {
    label: "Low Risk",
    badgeClass: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
    icon: <Info className="h-3.5 w-3.5" />,
  },
  medium: {
    label: "Medium Risk",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  },
  high: {
    label: "High Risk",
    badgeClass: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  },
  critical: {
    label: "Critical Risk",
    badgeClass: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
    icon: <AlertCircle className="h-3.5 w-3.5" />,
  },
};

// ── Completeness styling ──────────────────────────────────────────────────────

const COMPLETENESS_CONFIG = {
  complete: { label: "Complete", badgeClass: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800" },
  partial: { label: "Partial", badgeClass: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800" },
  incomplete: { label: "Incomplete", badgeClass: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800" },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface DmsDocumentIntelligenceSectionProps {
  documentId: number;
  canEvaluate?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DmsDocumentIntelligenceSection({
  documentId,
  canEvaluate = false,
}: DmsDocumentIntelligenceSectionProps) {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState<"completeness" | "risk" | "both" | null>(null);

  const {
    data: completenessRow,
    isLoading: completenessLoading,
    refetch: refetchCompleteness,
  } = useQuery<DocumentCompletenessRow | null>({
    queryKey: queryKeys.dms.documentIntelligence(documentId, "completeness"),
    queryFn: async () => {
      const r = await getDmsDocumentCompletenessStatus(documentId);
      if (!r.success) throw new Error(r.error ?? "Failed to load completeness");
      return r.data ?? null;
    },
    staleTime: 30_000,
    retry: false,
  });

  const {
    data: riskRow,
    isLoading: riskLoading,
    refetch: refetchRisk,
  } = useQuery<DocumentRiskRow | null>({
    queryKey: queryKeys.dms.documentIntelligence(documentId, "risk"),
    queryFn: async () => {
      const r = await getDmsDocumentRiskStatus(documentId);
      if (!r.success) throw new Error(r.error ?? "Failed to load risk");
      return r.data ?? null;
    },
    staleTime: 30_000,
    retry: false,
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleCompleteness() {
    setRunning("completeness");
    try {
      const result = await evaluateDmsDocumentCompleteness(documentId);
      if (!result.success) {
        toast.error(result.error ?? "Completeness evaluation failed");
      } else {
        toast.success(`Completeness: ${result.data?.completenessPercent ?? 0}% (${result.data?.completenessLabel})`);
        await refetchCompleteness();
      }
    } catch (e) { toast.error(String(e)); }
    finally { setRunning(null); }
  }

  async function handleRisk() {
    setRunning("risk");
    try {
      const result = await evaluateDmsDocumentRisk(documentId);
      if (!result.success) {
        toast.error(result.error ?? "Risk evaluation failed");
      } else {
        toast.success(`Risk: ${result.data?.riskLevel ?? "none"} (${Math.round((result.data?.riskScore ?? 0) * 100)}%)`);
        await refetchRisk();
      }
    } catch (e) { toast.error(String(e)); }
    finally { setRunning(null); }
  }

  async function handleBoth() {
    setRunning("both");
    try {
      const result = await evaluateDmsDocumentIntelligence(documentId);
      if (!result.success) {
        toast.error(result.error ?? "Intelligence evaluation failed");
      } else {
        toast.success("Document intelligence evaluated");
        await Promise.all([refetchCompleteness(), refetchRisk()]);
        await queryClient.invalidateQueries({ queryKey: queryKeys.dms.documents() });
      }
    } catch (e) { toast.error(String(e)); }
    finally { setRunning(null); }
  }

  const isRunning = running !== null;

  // ── Completeness card ─────────────────────────────────────────────────────────

  function CompletenessCard() {
    const cRow = completenessRow;
    const cLabel = cRow?.completenessLabel;
    const cConfig = cLabel ? COMPLETENESS_CONFIG[cLabel] : null;
    const cPercent = cRow?.completenessPercent;

    return (
      <div className="rounded-md border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Completeness</span>
            {cConfig && (
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${cConfig.badgeClass}`}>
                {cConfig.label}
              </Badge>
            )}
          </div>
          {cPercent !== null && cPercent !== undefined && (
            <span className="text-lg font-bold tabular-nums">{cPercent}%</span>
          )}
        </div>

        {completenessLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : cRow?.completenessScore === null ? (
          <p className="text-xs text-muted-foreground">
            Not yet evaluated.{canEvaluate ? " Click Recalculate to score." : ""}
          </p>
        ) : null}

        {/* Progress bar */}
        {cPercent !== null && cPercent !== undefined && (
          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                cPercent >= 90 ? "bg-green-500" : cPercent >= 60 ? "bg-amber-500" : "bg-red-500"
              }`}
              style={{ width: `${cPercent}%` }}
            />
          </div>
        )}

        {/* Missing fields */}
        {(cRow?.missingFields ?? []).length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Missing fields:</p>
            <div className="flex flex-wrap gap-1">
              {cRow!.missingFields.map((f) => (
                <Badge key={f.field_code} variant="outline" className="text-[10px] px-1.5 py-0 text-destructive border-destructive/30">
                  {f.field_label_en}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {canEvaluate && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleCompleteness}
            disabled={isRunning}
            className="h-7 text-xs"
          >
            {running === "completeness" ? <RefreshCw className="mr-1.5 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1.5 h-3 w-3" />}
            Recalculate
          </Button>
        )}
      </div>
    );
  }

  // ── Risk card ─────────────────────────────────────────────────────────────────

  function RiskCard() {
    const rRow = riskRow;
    const rLevel = rRow?.riskLevel as RiskLevel | null;
    const rConfig = rLevel ? RISK_CONFIG[rLevel] : null;
    const rPercent = rRow?.riskScore !== null && rRow?.riskScore !== undefined
      ? Math.round(rRow.riskScore * 100)
      : null;

    return (
      <div className="rounded-md border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Risk</span>
            {rConfig && (
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border flex items-center gap-1 ${rConfig.badgeClass}`}>
                {rConfig.icon}
                {rConfig.label}
              </Badge>
            )}
          </div>
          {rPercent !== null && (
            <span className="text-lg font-bold tabular-nums">{rPercent}%</span>
          )}
        </div>

        {riskLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : rRow?.riskScore === null ? (
          <p className="text-xs text-muted-foreground">
            Not yet evaluated.{canEvaluate ? " Click Recalculate to score." : ""}
          </p>
        ) : null}

        {/* Progress bar */}
        {rPercent !== null && (
          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                rPercent === 0 ? "bg-green-500" :
                rPercent <= 30 ? "bg-blue-500" :
                rPercent <= 55 ? "bg-amber-500" :
                rPercent <= 80 ? "bg-orange-500" : "bg-red-500"
              }`}
              style={{ width: `${rPercent}%` }}
            />
          </div>
        )}

        {/* Risk reasons */}
        {(rRow?.riskReasons ?? []).length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Risk factors:</p>
            <ul className="space-y-0.5">
              {rRow!.riskReasons.map((r) => (
                <li key={r.code} className="flex items-start gap-1.5 text-xs text-foreground">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                  <span>{r.message}</span>
                  <span className="ml-auto text-muted-foreground shrink-0">+{Math.round(r.score * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Updated at */}
        {rRow?.riskUpdatedAt && (
          <p className="text-[10px] text-muted-foreground">
            Last evaluated {format(parseISO(rRow.riskUpdatedAt), "d MMM yyyy HH:mm")}
          </p>
        )}

        {canEvaluate && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleRisk}
            disabled={isRunning}
            className="h-7 text-xs"
          >
            {running === "risk" ? <RefreshCw className="mr-1.5 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1.5 h-3 w-3" />}
            Recalculate
          </Button>
        )}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 p-1">
      {/* Combined action */}
      {canEvaluate && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Evaluate completeness and risk from document structure and metadata.
          </p>
          <Button
            size="sm"
            onClick={handleBoth}
            disabled={isRunning}
            className="gap-1.5"
          >
            {running === "both" ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            Evaluate Document Intelligence
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <CompletenessCard />
        <RiskCard />
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50/50 px-3 py-2 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Completeness and risk scores are deterministic — no AI is used. Scores reflect the current
          state of the document's metadata, dates, content text, and AI summary.
          Re-evaluate after making changes.
        </span>
      </div>
    </div>
  );
}
