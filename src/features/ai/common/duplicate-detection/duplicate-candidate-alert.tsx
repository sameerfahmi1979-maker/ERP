"use client";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { queryKeys } from "@/lib/query/query-keys";
import { getDuplicateCandidateCountForEntity } from "@/server/actions/ai/common/duplicate-detection";

interface DuplicateCandidateAlertProps {
  entityType: "party" | "company";
  entityId: number;
}

export function DuplicateCandidateAlert({ entityType, entityId }: DuplicateCandidateAlertProps) {
  const uiRead1 = useQuery({
    queryKey: queryKeys.ai.duplicateCandidateCounts(entityType, entityId),
    queryFn: async () => {
      const res = await getDuplicateCandidateCountForEntity({ entityType, entityId });
      if (!res.success) return { pendingCount: 0 };
      return res.data!;
    },
    enabled: entityId > 0,
    staleTime: 60_000,
  });
 const { data } = uiRead1;

  const count = data?.pendingCount ?? 0;
  if (count <= 0) return null;

  const href = `/admin/ai/duplicates?entityType=${entityType}&entityId=${entityId}`;

  return (
    <QueryReadBoundary queries={[uiRead1]}><Alert className="border-amber-300 bg-amber-50 mb-4">
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertDescription className="text-amber-900 text-sm">
        <strong>{count}</strong> duplicate/conflict candidate{count === 1 ? "" : "s"} require review.{" "}
        <Link href={href} className="font-medium underline underline-offset-2 hover:text-amber-950">
          Review in AI Duplicates
        </Link>
      </AlertDescription>
    </Alert></QueryReadBoundary>
  );
}
