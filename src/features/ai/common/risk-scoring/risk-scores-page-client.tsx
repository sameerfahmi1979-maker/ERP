"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryKeys } from "@/lib/query/query-keys";
import { invalidateRiskScores } from "@/lib/query/invalidation";
import type { RiskEntityType, RiskScoreRow } from "@/lib/ai/common/risk-scoring";
import {
  calculateRiskScores,
  getRiskScores,
  getRiskScoreDetail,
  reviewRiskScore,
  markRiskScoreStale,
} from "@/server/actions/ai/common/risk-scoring";
import { RiskLevelBadge } from "./risk-level-badge";

interface RiskScoresPageClientProps {
  summary: {
    critical: number;
    high: number;
    stale: number;
    unreviewed: number;
    featureEnabled: boolean;
  };
  initialEntityType?: string;
  initialEntityId?: number;
}

function entityRecordHref(entityType: string, entityId: number): string | null {
  switch (entityType) {
    case "party":
      return `/admin/master-data/parties/record/${entityId}`;
    case "company":
      return `/admin/organizations/record/${entityId}`;
    case "branch":
      return `/admin/branches/record/${entityId}`;
    case "site":
      return `/admin/common-master-data/work-sites/record/${entityId}`;
    case "dms_document":
      return `/dms/documents/record/${entityId}`;
    default:
      return null;
  }
}

export function RiskScoresPageClient({
  summary,
  initialEntityType,
  initialEntityId,
}: RiskScoresPageClientProps) {
  const queryClient = useQueryClient();
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>(
    initialEntityType ?? "all"
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dryRun, setDryRun] = useState(false);
  const [batchEntityTypes, setBatchEntityTypes] = useState<string>("company,party");
  const [isCalculating, setIsCalculating] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);

  const listFilters = {
    entityType:
      entityTypeFilter === "all"
        ? undefined
        : (entityTypeFilter as RiskEntityType),
    entityId: initialEntityId,
    riskLevel:
      levelFilter === "all"
        ? undefined
        : (levelFilter as "none" | "low" | "medium" | "high" | "critical"),
    status:
      statusFilter === "all"
        ? undefined
        : (statusFilter as "pending" | "calculated" | "stale" | "reviewed" | "accepted" | "superseded" | "failed"),
    limit: 100,
  };

  const { data: listData, isLoading, refetch } = useQuery({
    queryKey: queryKeys.ai.riskScores(listFilters),
    queryFn: async () => {
      const res = await getRiskScores(listFilters);
      if (!res.success) throw new Error(res.error);
      return res.data!;
    },
  });

  const { data: detail } = useQuery({
    queryKey: queryKeys.ai.riskScoreDetail(selectedId ?? 0),
    enabled: selectedId != null,
    queryFn: async () => {
      const res = await getRiskScoreDetail(selectedId!);
      if (!res.success) throw new Error(res.error);
      return res.data!;
    },
  });

  const handleCalculate = async () => {
    setIsCalculating(true);
    try {
      const types = batchEntityTypes
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean) as Array<"company" | "party" | "branch" | "site">;

      const res = await calculateRiskScores({
        entityTypes: types.length > 0 ? types : undefined,
        limit: 100,
        dryRun,
      });

      if (!res.success) {
        toast.error(res.error ?? "Calculation failed");
        return;
      }

      const r = res.data!;
      toast.success(
        dryRun
          ? `Dry run: ${r.processed} entity(ies) evaluated (${r.succeeded} ok, ${r.failed} failed)`
          : `Calculated: ${r.succeeded} succeeded, ${r.failed} failed of ${r.processed}`
      );
      invalidateRiskScores(queryClient);
      refetch();
    } finally {
      setIsCalculating(false);
    }
  };

  const handleReview = async (
    decision: "accepted" | "needs_more_review" | "false_positive_signal" | "manual_override_note"
  ) => {
    if (!selectedId) return;
    setIsReviewing(true);
    try {
      const res = await reviewRiskScore({ scoreId: selectedId, decision });
      if (!res.success) {
        toast.error(res.error ?? "Review failed");
        return;
      }
      toast.success(`Risk score marked: ${decision.replace(/_/g, " ")}`);
      invalidateRiskScores(queryClient);
      refetch();
    } finally {
      setIsReviewing(false);
    }
  };

  const handleMarkStale = async () => {
    if (!selectedId) return;
    setIsReviewing(true);
    try {
      const res = await markRiskScoreStale({
        scoreId: selectedId,
        reason: "Marked stale from admin review",
      });
      if (!res.success) {
        toast.error(res.error ?? "Failed to mark stale");
        return;
      }
      toast.success("Risk score marked stale");
      invalidateRiskScores(queryClient);
      refetch();
    } finally {
      setIsReviewing(false);
    }
  };

  const rows = listData?.rows ?? [];

  return (
    <div className="space-y-4">
      {!summary.featureEnabled && (
        <Alert className="border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-900 text-sm">
            <strong>ERP_AI_RISK_SCORE</strong> is disabled. Existing scores remain visible;
            calculate actions are blocked until the flag is enabled in AI Settings.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <ShieldAlert className="h-8 w-8 text-red-500" />
            <div>
              <p className="text-xs text-muted-foreground">Critical</p>
              <p className="text-2xl font-bold">{summary.critical}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="h-8 w-8 text-orange-500" />
            <div>
              <p className="text-xs text-muted-foreground">High</p>
              <p className="text-2xl font-bold">{summary.high}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-8 w-8 text-amber-500" />
            <div>
              <p className="text-xs text-muted-foreground">Stale</p>
              <p className="text-2xl font-bold">{summary.stale}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-xs text-muted-foreground">Unreviewed</p>
              <p className="text-2xl font-bold">{summary.unreviewed}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Calculate Deterministic Risk</CardTitle>
          <CardDescription>
            Aggregates DMS, compliance, duplicate, and field conflict signals. Max 100 entities
            per batch. No auto-block or status updates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Entity types (comma-separated)</Label>
              <input
                className="flex h-9 w-64 rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={batchEntityTypes}
                onChange={(e) => setBatchEntityTypes(e.target.value)}
                placeholder="company,party,branch,site"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="dryRun"
                checked={dryRun}
                onCheckedChange={(v) => setDryRun(v === true)}
              />
              <Label htmlFor="dryRun" className="text-sm">
                Dry run (preview only)
              </Label>
            </div>
            <Button
              onClick={handleCalculate}
              disabled={isCalculating || !summary.featureEnabled}
            >
              {isCalculating ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Calculate Risk Scores
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Select value={entityTypeFilter} onValueChange={(v) => setEntityTypeFilter(v ?? "all")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Entity type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="company">Company</SelectItem>
            <SelectItem value="party">Party</SelectItem>
            <SelectItem value="branch">Branch</SelectItem>
            <SelectItem value="site">Site</SelectItem>
            <SelectItem value="dms_document">Document</SelectItem>
          </SelectContent>
        </Select>
        <Select value={levelFilter} onValueChange={(v) => setLevelFilter(v ?? "all")}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Risk level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="none">None</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="calculated">Calculated</SelectItem>
            <SelectItem value="stale">Stale</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[400px]">
        <Card className="overflow-hidden">
          <CardHeader className="py-3 border-b">
            <CardTitle className="text-sm">Risk Scores</CardTitle>
          </CardHeader>
          <CardContent className="p-0 max-h-[500px] overflow-y-auto">
            {isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No risk scores yet.</p>
            ) : (
              <ul className="divide-y">
                {rows.map((row: RiskScoreRow) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={`w-full text-left px-4 py-3 hover:bg-muted/50 ${
                        selectedId === row.id ? "bg-muted" : ""
                      }`}
                      onClick={() => setSelectedId(row.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">
                            {row.entityLabel ?? `${row.entityType} #${row.entityId}`}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {row.entityType} · {row.status}
                            {row.isStale && " · stale"}
                          </p>
                        </div>
                        <RiskLevelBadge level={row.riskLevel} score={row.riskScore} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="py-3 border-b">
            <CardTitle className="text-sm">Score Detail</CardTitle>
          </CardHeader>
          <CardContent className="p-4 max-h-[500px] overflow-y-auto">
            {!selectedId || !detail ? (
              <p className="text-sm text-muted-foreground">Select a score to view details.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <RiskLevelBadge level={detail.riskLevel} score={detail.riskScore} />
                  <span className="text-xs text-muted-foreground">
                    Calculated {new Date(detail.calculatedAt).toLocaleString()}
                  </span>
                </div>

                {detail.riskReasons.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1">Top reasons</p>
                    <ul className="text-sm space-y-1">
                      {detail.riskReasons.map((r, i) => (
                        <li key={i} className="text-muted-foreground">
                          {r.message} (+{r.points})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {detail.riskBreakdown.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1">Breakdown</p>
                    <div className="text-xs border rounded overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left p-2">Signal</th>
                            <th className="text-right p-2">Pts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.riskBreakdown.slice(0, 12).map((b, i) => (
                            <tr key={i} className="border-t">
                              <td className="p-2">{b.label}</td>
                              <td className="p-2 text-right">{b.points}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {detail.events.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1">Event history</p>
                    <ul className="text-xs space-y-1 text-muted-foreground">
                      {detail.events.slice(0, 8).map((e) => (
                        <li key={e.id}>
                          {e.eventType} — {new Date(e.createdAt).toLocaleString()}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  {entityRecordHref(detail.entityType, detail.entityId) && (
                    <Link
                      href={entityRecordHref(detail.entityType, detail.entityId)!}
                      className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted"
                    >
                      Open Record
                    </Link>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isReviewing}
                    onClick={() => handleReview("accepted")}
                  >
                    Accept Score
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isReviewing}
                    onClick={() => handleReview("needs_more_review")}
                  >
                    Needs Review
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isReviewing}
                    onClick={() => handleReview("false_positive_signal")}
                  >
                    False Positive
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isReviewing}
                    onClick={handleMarkStale}
                  >
                    Mark Stale
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
