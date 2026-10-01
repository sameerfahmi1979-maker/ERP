"use client";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { queryKeys } from "@/lib/query/query-keys";
import { getComplianceFindingCountForEntity } from "@/server/actions/ai/common/compliance-checker";

interface ComplianceFindingAlertProps {
  entityType: "party" | "company";
  entityId: number;
}

export function ComplianceFindingAlert({ entityType, entityId }: ComplianceFindingAlertProps) {
  const uiRead1 = useQuery({
    queryKey: queryKeys.ai.complianceFindingCounts(entityType, entityId),
    queryFn: async () => {
      const res = await getComplianceFindingCountForEntity({ entityType, entityId });
      if (!res.success) return { openCount: 0, criticalCount: 0, highCount: 0 };
      return res.data!;
    },
    enabled: entityId > 0,
    staleTime: 60_000,
  });
 const { data } = uiRead1;

  const count = data?.openCount ?? 0;
  if (count <= 0) return null;

  const hasCritical = (data?.criticalCount ?? 0) > 0;
  const href = `/admin/ai/compliance?entityType=${entityType === "company" ? "company" : entityType}&entityId=${entityId}`;

  return (
    <QueryReadBoundary queries={[uiRead1]}><Alert
      className={
        hasCritical
          ? "border-red-300 bg-red-50 mb-4 dark:border-red-800 dark:bg-red-950"
          : "border-amber-300 bg-amber-50 mb-4 dark:border-amber-800 dark:bg-amber-950"
      }
    >
      {hasCritical ? (
        <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-300" />
      ) : (
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-300" />
      )}
      <AlertDescription
        className={hasCritical ? "text-red-900 text-sm dark:text-red-200" : "text-amber-900 text-sm dark:text-amber-200"}
      >
        <strong>{count}</strong> open compliance finding{count === 1 ? "" : "s"} require review.
        {(data?.criticalCount ?? 0) > 0 && (
          <> ({data!.criticalCount} critical)</>
        )}{" "}
        <Link
          href={href}
          className="font-medium underline underline-offset-2 hover:opacity-80"
        >
          Review in AI Compliance
        </Link>
      </AlertDescription>
    </Alert></QueryReadBoundary>
  );
}
