"use client";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { loadedListValue } from "@/components/erp/table/loaded-list-view";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";

import { Badge } from "@/components/ui/badge";
import { getDmsAiProviderModelBreakdown, type ObservabilityFilters } from "@/server/actions/dms/ai-observability";
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

export function AiProviderModelBreakdown({ filters, refreshKey }: Props) {
  const uiRead1 = useQuery({
    queryKey: ["dms-observability", "getDmsAiProviderModelBreakdown", filters, refreshKey],
    queryFn: async () => {
      const result = await getDmsAiProviderModelBreakdown(filters);
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
      {/* UI05 explicit table: authorized loaded rows, original permission-aware actions */}<ERPDataTable tableId="special.dms.ai-observability.sections.ai-provider-model-breakdown" data={data} columns={[{id:"modelId",header:"Model",accessorFn:row=>loadedListValue(row,"modelId"),meta:{filter:{type:"text"}},enableHiding:false,size:220,cell:({row:{original:row}})=>{
return <>{row.modelId ?? "unknown"}</>;}},{id:"totalCalls",header:"Calls",accessorFn:row=>loadedListValue(row,"totalCalls"),meta:{filter:{type:"number"}},enableHiding:true,size:180,cell:({row:{original:row}})=>{
return <>{row.totalCalls}</>;}},{id:"successCalls",header:"Success",accessorFn:row=>loadedListValue(row,"successCalls"),meta:{filter:{type:"number"}},enableHiding:true,size:180,cell:({row:{original:row}})=>{
return <>{row.successCalls}</>;}},{id:"totalInputTokens",header:"Input tokens",accessorFn:row=>loadedListValue(row,"totalInputTokens"),meta:{filter:{type:"number"}},enableHiding:true,size:180,cell:({row:{original:row}})=>{
return <>{fmt(row.totalInputTokens)}</>;}},{id:"totalOutputTokens",header:"Output tokens",accessorFn:row=>loadedListValue(row,"totalOutputTokens"),meta:{filter:{type:"number"}},enableHiding:true,size:180,cell:({row:{original:row}})=>{
return <>{fmt(row.totalOutputTokens)}</>;}},{id:"estimatedCost",header:"Estimated cost",accessorFn:row=>loadedListValue(row,"estimatedCost"),meta:{filter:{type:"number"}},enableHiding:true,size:180,cell:({row:{original:row}})=>{
return <>{row.estimatedCost !== null
                  ? `$${row.estimatedCost.toFixed(4)}`
                  : <Badge variant="outline" className="text-xs">—</Badge>}</>;}}]} enableRowSelection={false} searchPlaceholder="Search loaded records…" initialPageSize={10} />
    </div></QueryReadBoundary>
  );
}
