"use client";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { loadedListValue } from "@/components/erp/table/loaded-list-view";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";

import { Badge } from "@/components/ui/badge";
import { getDmsAiRecentUsageEvents, type ObservabilityFilters } from "@/server/actions/dms/ai-observability";
import { useQuery } from "@tanstack/react-query";

interface Props {
  filters: ObservabilityFilters;
  refreshKey: number;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  success: "default",
  failed: "destructive",
  skipped: "secondary",
};

export function AiRecentUsageEventsTable({ filters, refreshKey }: Props) {
  const uiRead1 = useQuery({
    queryKey: ["dms-observability", "getDmsAiRecentUsageEvents", filters, refreshKey],
    queryFn: async () => {
      const result = await getDmsAiRecentUsageEvents(filters);
      if (!result.success || !result.data) throw new Error(result.error ?? "Failed to load.");
      return result.data;
    },
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
 const { data, isPending: loading, error: queryError } = uiRead1;
  const error = queryError?.message;

  if (loading) return <QueryReadBoundary queries={[uiRead1]}><div className="text-sm text-muted-foreground">Loading recent events...</div></QueryReadBoundary>;
  if (error) return <QueryReadBoundary queries={[uiRead1]}><div className="text-sm text-destructive">{error}</div></QueryReadBoundary>;
  if (!data || data.length === 0) return <QueryReadBoundary queries={[uiRead1]}><div className="text-sm text-muted-foreground">No usage events found.</div></QueryReadBoundary>;

  return (
    <QueryReadBoundary queries={[uiRead1]}><div className="overflow-x-auto rounded-lg border">
      {/* UI05 explicit table: authorized loaded rows, original permission-aware actions */}<ERPDataTable tableId="special.dms.ai-observability.sections.ai-recent-usage-events-table" data={data} columns={[{id:"createdAt",header:"Time",accessorFn:row=>loadedListValue(row,"createdAt"),meta:{filter:{type:"text"}},enableHiding:false,size:220,cell:({row:{original:row}})=>{
return <>{new Date(row.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</>;}},{id:"featureArea",header:"Feature",accessorFn:row=>loadedListValue(row,"featureArea"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:row}})=>{
return <>{row.featureArea}</>;}},{id:"operationType",header:"Operation",accessorFn:row=>loadedListValue(row,"operationType"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:row}})=>{
return <>{row.operationType}</>;}},{id:"modelId",header:"Model",accessorFn:row=>loadedListValue(row,"modelId"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:row}})=>{
return <>{row.modelId ?? "—"}</>;}},{id:"status",header:"Status",accessorFn:row=>loadedListValue(row,"status"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:row}})=>{
return <><Badge variant={STATUS_VARIANT[row.status] ?? "outline"} className="text-xs">{row.status}</Badge></>;}},{id:"inputTokenCount",header:"Input tokens",accessorFn:row=>loadedListValue(row,"inputTokenCount"),meta:{filter:{type:"number"}},enableHiding:true,size:180,cell:({row:{original:row}})=>{
return <>{row.inputTokenCount ?? "—"}</>;}},{id:"outputTokenCount",header:"Output tokens",accessorFn:row=>loadedListValue(row,"outputTokenCount"),meta:{filter:{type:"number"}},enableHiding:true,size:180,cell:({row:{original:row}})=>{
return <>{row.outputTokenCount ?? "—"}</>;}},{id:"estimatedCost",header:"Cost",accessorFn:row=>loadedListValue(row,"estimatedCost"),meta:{filter:{type:"number"}},enableHiding:true,size:180,cell:({row:{original:row}})=>{
return <>{row.estimatedCost !== null ? `$${row.estimatedCost.toFixed(5)}` : "—"}</>;}},{id:"documentId",header:"Document",accessorFn:row=>loadedListValue(row,"documentId"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:row}})=>{
return <>{row.documentId ?? "—"}</>;}},{id:"durationMs",header:"ms",accessorFn:row=>loadedListValue(row,"durationMs"),meta:{filter:{type:"number"}},enableHiding:true,size:180,cell:({row:{original:row}})=>{
return <>{row.durationMs ?? "—"}</>;}}]} enableRowSelection={false} searchPlaceholder="Search loaded records…" initialPageSize={10} />
      <p className="px-3 py-2 text-xs text-muted-foreground border-t bg-muted/20">
        Showing up to 100 recent events. No prompt, response, or content text is displayed.
      </p>
    </div></QueryReadBoundary>
  );
}
