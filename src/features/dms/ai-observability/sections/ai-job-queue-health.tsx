"use client";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { loadedListValue } from "@/components/erp/table/loaded-list-view";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";

import { Badge } from "@/components/ui/badge";
import { getDmsAiJobQueueObservability } from "@/server/actions/dms/ai-observability";
import { useQuery } from "@tanstack/react-query";

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
  const uiRead1 = useQuery({
    queryKey: ["dms-observability", "getDmsAiJobQueueObservability", refreshKey],
    queryFn: async () => {
      const result = await getDmsAiJobQueueObservability();
      if (!result.success || !result.data) throw new Error(result.error ?? "Failed to load.");
      return result.data;
    },
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
 const { data, isPending: loading, error: queryError } = uiRead1;
  const error = queryError?.message;

  if (loading) return <QueryReadBoundary queries={[uiRead1]}><div className="text-sm text-muted-foreground">Loading queue health...</div></QueryReadBoundary>;
  if (error) return <QueryReadBoundary queries={[uiRead1]}><div className="text-sm text-destructive">{error}</div></QueryReadBoundary>;
  if (!data) return null;

  return (
    <QueryReadBoundary queries={[uiRead1]}><div className="rounded-lg border overflow-hidden">
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
          {/* UI05 explicit table: authorized loaded rows, original permission-aware actions */}<ERPDataTable tableId="special.dms.ai-observability.sections.ai-job-queue-health" data={data.recentJobs.slice(0, 10)} columns={[{id:"id",header:"ID",accessorFn:j=>loadedListValue(j,"id"),meta:{filter:{type:"number"}},enableHiding:false,size:220,cell:({row:{original:j}})=>{
return <>{j.id}</>;}},{id:"jobType",header:"Type",accessorFn:j=>loadedListValue(j,"jobType"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:j}})=>{
return <>{j.jobType}</>;}},{id:"jobStatus",header:"Status",accessorFn:j=>loadedListValue(j,"jobStatus"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:j}})=>{
return <><Badge variant={STATUS_BADGE[j.jobStatus] ?? "outline"} className="text-xs">
                      {j.jobStatus}
                    </Badge></>;}},{id:"attemptCount",header:"Attempts",accessorFn:j=>loadedListValue(j,"attemptCount"),meta:{filter:{type:"number"}},enableHiding:true,size:180,cell:({row:{original:j}})=>{
return <>{j.attemptCount}/{j.maxAttempts}</>;}},{id:"createdAt",header:"Created",accessorFn:j=>loadedListValue(j,"createdAt"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:j}})=>{
return <>{new Date(j.createdAt).toLocaleDateString()}</>;}}]} enableRowSelection={false} searchPlaceholder="Search loaded records…" initialPageSize={10} />
        </div>
      )}
    </div></QueryReadBoundary>
  );
}
