"use client";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { queryKeys } from "@/lib/query/query-keys";
import { getRiskScoreCountForEntity } from "@/server/actions/ai/common/risk-scoring";
import { RiskLevelBadge } from "./risk-level-badge";

interface RiskScoreAlertProps {
  entityType: "party" | "company";
  entityId: number;
}

export function RiskScoreAlert({ entityType, entityId }: RiskScoreAlertProps) {
  const uiRead1 = useQuery({
    queryKey: queryKeys.ai.riskScoreCountForEntity(entityType, entityId),
    queryFn: async () => {
      const res = await getRiskScoreCountForEntity({ entityType, entityId });
      if (!res.success) {
        return {
          hasScore: false,
          riskScore: null,
          riskLevel: null,
          isStale: false,
          needsReview: false,
        };
      }
      return res.data!;
    },
    enabled: entityId > 0,
    staleTime: 60_000,
  });
 const { data } = uiRead1;

  if (!data?.hasScore || !data.needsReview) return null;

  const isCritical = data.riskLevel === "critical";
  const isHigh = data.riskLevel === "high" || (data.riskScore ?? 0) >= 50;
  const href = `/admin/ai/risk?entityType=${entityType}&entityId=${entityId}`;

  return (
    <QueryReadBoundary queries={[uiRead1]}><Alert
      className={
        isCritical
          ? "border-red-300 bg-red-50 mb-4 dark:border-red-800 dark:bg-red-950"
          : isHigh
            ? "border-orange-300 bg-orange-50 mb-4 dark:border-orange-800 dark:bg-orange-950"
            : "border-amber-300 bg-amber-50 mb-4 dark:border-amber-800 dark:bg-amber-950"
      }
    >
      {isCritical ? (
        <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-300" />
      ) : (
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-300" />
      )}
      <AlertDescription
        className={
          isCritical ? "text-red-900 text-sm dark:text-red-200" : "text-amber-900 text-sm dark:text-amber-200"
        }
      >
        Entity risk score requires review:{" "}
        <RiskLevelBadge level={data.riskLevel} score={data.riskScore} />
        {data.isStale && (
          <span className="ml-2 text-xs font-medium text-muted-foreground">(stale)</span>
        )}{" "}
        <Link
          href={href}
          className="font-medium underline underline-offset-2 hover:opacity-80"
        >
          Review in AI Risk
        </Link>
      </AlertDescription>
    </Alert></QueryReadBoundary>
  );
}
