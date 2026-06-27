"use client";

import { useEffect, useState } from "react";
import { getDmsAiPipelineHealth, type PipelineHealthData } from "@/server/actions/dms/ai-observability";

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
  const [data, setData] = useState<PipelineHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getDmsAiPipelineHealth()
      .then((res) => {
        if (res.success && res.data) setData(res.data);
        else setError(res.error ?? "Failed to load.");
      })
      .catch(() => setError("Failed to load pipeline health."))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) return <div className="text-sm text-muted-foreground">Loading pipeline health...</div>;
  if (error) return <div className="text-sm text-destructive">{error}</div>;
  if (!data) return null;

  return (
    <div className="rounded-lg border p-4">
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
    </div>
  );
}
