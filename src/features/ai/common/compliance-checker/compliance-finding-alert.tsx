"use client";

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
  const { data } = useQuery({
    queryKey: queryKeys.ai.complianceFindingCounts(entityType, entityId),
    queryFn: async () => {
      const res = await getComplianceFindingCountForEntity({ entityType, entityId });
      if (!res.success) return { openCount: 0, criticalCount: 0, highCount: 0 };
      return res.data!;
    },
    enabled: entityId > 0,
    staleTime: 60_000,
  });

  const count = data?.openCount ?? 0;
  if (count <= 0) return null;

  const hasCritical = (data?.criticalCount ?? 0) > 0;
  const href = `/admin/ai/compliance?entityType=${entityType === "company" ? "company" : entityType}&entityId=${entityId}`;

  return (
    <Alert
      className={
        hasCritical
          ? "border-red-300 bg-red-50 mb-4"
          : "border-amber-300 bg-amber-50 mb-4"
      }
    >
      {hasCritical ? (
        <ShieldAlert className="h-4 w-4 text-red-600" />
      ) : (
        <AlertTriangle className="h-4 w-4 text-amber-600" />
      )}
      <AlertDescription
        className={hasCritical ? "text-red-900 text-sm" : "text-amber-900 text-sm"}
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
    </Alert>
  );
}
