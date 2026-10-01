"use client";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { loadedListValue } from "@/components/erp/table/loaded-list-view";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";

import { getDmsAiFeatureBreakdown, type ObservabilityFilters } from "@/server/actions/dms/ai-observability";
import { useQuery } from "@tanstack/react-query";

interface Props {
  filters: ObservabilityFilters;
  refreshKey: number;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function AiFeatureBreakdown({ filters, refreshKey }: Props) {
  const uiRead1 = useQuery({
    queryKey: ["dms-observability", "getDmsAiFeatureBreakdown", filters, refreshKey],
    queryFn: async () => {
      const result = await getDmsAiFeatureBreakdown(filters);
      if (!result.success || !result.data) throw new Error(result.error ?? "Failed to load.");
      return result.data;
    },
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
 const { data, isPending: loading, error: queryError } = uiRead1;
  const error = queryError?.message;

  if (loading) return <QueryReadBoundary queries={[uiRead1]}><div className="text-sm text-muted-foreground">Loading...</div></QueryReadBoundary>;
  if (error) return <QueryReadBoundary queries={[uiRead1]}><div className="text-sm text-destructive">{error}</div></QueryReadBoundary>;
  if (!data || data.length === 0) return <QueryReadBoundary queries={[uiRead1]}><div className="text-sm text-muted-foreground">No data.</div></QueryReadBoundary>;

  return (
    <QueryReadBoundary queries={[uiRead1]}><div className="overflow-x-auto rounded-lg border">
      {/* UI05 explicit table: authorized loaded rows, original permission-aware actions */}<ERPDataTable tableId="special.dms.ai-observability.sections.ai-feature-breakdown" data={data} columns={[{id:"featureArea",header:"Feature",accessorFn:row=>loadedListValue(row,"featureArea"),meta:{filter:{type:"text"}},enableHiding:false,size:220,cell:({row:{original:row}})=>{
return <>{row.featureArea}</>;}},{id:"operationType",header:"Operation",accessorFn:row=>loadedListValue(row,"operationType"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:row}})=>{
return <>{row.operationType}</>;}},{id:"totalCalls",header:"Calls",accessorFn:row=>loadedListValue(row,"totalCalls"),meta:{filter:{type:"number"}},enableHiding:true,size:180,cell:({row:{original:row}})=>{
return <>{row.totalCalls}</>;}},{id:"failedCalls",header:"Failed",accessorFn:row=>loadedListValue(row,"failedCalls"),meta:{filter:{type:"number"}},enableHiding:true,size:180,cell:({row:{original:row}})=>{
return <>{row.failedCalls || "—"}</>;}},{id:"totalInputTokens",header:"Input tokens",accessorFn:row=>loadedListValue(row,"totalInputTokens"),meta:{filter:{type:"number"}},enableHiding:true,size:180,cell:({row:{original:row}})=>{
return <>{fmt(row.totalInputTokens)}</>;}},{id:"avgDurationMs",header:"Average ms",accessorFn:row=>loadedListValue(row,"avgDurationMs"),meta:{filter:{type:"number"}},enableHiding:true,size:180,cell:({row:{original:row}})=>{
return <>{row.avgDurationMs !== null ? `${row.avgDurationMs}ms` : "—"}</>;}}]} enableRowSelection={false} searchPlaceholder="Search loaded records…" initialPageSize={10} />
    </div></QueryReadBoundary>
  );
}
