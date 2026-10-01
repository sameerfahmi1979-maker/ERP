"use client";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";

import { getDmsAiPipelineHealth } from "@/server/actions/dms/ai-observability";
import { useQuery } from "@tanstack/react-query";

interface Props {
  refreshKey: number;
}

function HealthRow({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${warn && value > 0 ? "text-destructive" : value > 0 ? "text-foreground" : "text-muted-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

export function AiPipelineHealth({ refreshKey }: Props) {
  const uiRead1 = useQuery({
    queryKey: ["dms-observability", "getDmsAiPipelineHealth", refreshKey],
    queryFn: async () => {
      const result = await getDmsAiPipelineHealth();
      if (!result.success || !result.data) throw new Error(result.error ?? "Failed to load.");
      return result.data;
    },
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
 const { data, isPending: loading, error: queryError } = uiRead1;
  const error = queryError?.message;

  if (loading) return <QueryReadBoundary queries={[uiRead1]}><div className="text-sm text-muted-foreground">Loading pipeline health...</div></QueryReadBoundary>;
  if (error) return <QueryReadBoundary queries={[uiRead1]}><div className="text-sm text-destructive">{error}</div></QueryReadBoundary>;
  if (!data) return null;

  return (
    <QueryReadBoundary queries={[uiRead1]}><div className="rounded-lg border p-4">
      <HealthRow label="Documents pending AI" value={data.documentsWithPendingAi} />
      <HealthRow label="Documents AI processing" value={data.documentsAiProcessing} />
      <HealthRow label="Documents AI failed" value={data.documentsAiFailed} warn />
      <HealthRow label="Documents AI complete" value={data.documentsAiComplete} />
      <HealthRow label="Pending embedding chunks" value={data.pendingEmbeddingChunks} />
      <HealthRow label="Failed embedding chunks" value={data.failedEmbeddingChunks} warn />
      <HealthRow label="Review queue open" value={data.reviewQueueOpen} />
      <HealthRow label="Review queue high priority" value={data.reviewQueueHighPriority} warn />
      <HealthRow label="Validation findings open" value={data.validationFindingsOpen} />
      <HealthRow label="Entity match candidates pending" value={data.entityMatchCandidatesPending} />
    </div></QueryReadBoundary>
  );
}
