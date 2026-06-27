"use client";

import { useEffect, useState } from "react";
import { getDmsAiJobQueueObservability, type JobQueueObservabilityData } from "@/server/actions/dms/ai-observability";
import { Badge } from "@/components/ui/badge";

interface Props {
  refreshKey: number;
}

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  running: "secondary",
  queued: "secondary",
  failed: "destructive",
  retry_scheduled: "outline",
};

export function AiJobQueueHealth({ refreshKey }: Props) {
  const [data, setData] = useState<JobQueueObservabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getDmsAiJobQueueObservability()
      .then((res) => {
        if (res.success && res.data) setData(res.data);
        else setError(res.error ?? "Failed to load.");
      })
      .catch(() => setError("Failed to load queue health."))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) return <div className="text-sm text-muted-foreground">Loading queue health...</div>;
  if (error) return <div className="text-sm text-destructive">{error}</div>;
  if (!data) return null;

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="grid grid-cols-5 border-b">
        {[
          { label: "Queued", value: data.queuedCount, color: "text-blue-600" },
          { label: "Running", value: data.runningCount, color: "text-amber-600" },
          { label: "Completed", value: data.completedCount, color: "text-green-600" },
          { label: "Failed", value: data.failedCount, color: "text-destructive" },
          { label: "Retry", value: data.retryScheduledCount, color: "text-orange-500" },
        ].map((s) => (
          <div key={s.label} className="flex flex-col items-center py-3 px-2 border-r last:border-0">
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
      {data.recentJobs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">ID</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Attempts</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.recentJobs.slice(0, 10).map((j) => (
                <tr key={j.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-1.5 font-mono">{j.id}</td>
                  <td className="px-3 py-1.5">{j.jobType}</td>
                  <td className="px-3 py-1.5">
                    <Badge variant={STATUS_BADGE[j.jobStatus] ?? "outline"} className="text-xs">
                      {j.jobStatus}
                    </Badge>
                  </td>
                  <td className="px-3 py-1.5 text-right">{j.attemptCount}/{j.maxAttempts}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{new Date(j.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
