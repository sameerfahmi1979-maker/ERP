"use client";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { loadedListValue } from "@/components/erp/table/loaded-list-view";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";

import { getDmsAiErrorBreakdown, type ObservabilityFilters } from "@/server/actions/dms/ai-observability";
import { useQuery } from "@tanstack/react-query";

interface Props {
  filters: ObservabilityFilters;
  refreshKey: number;
}

export function AiErrorBreakdown({ filters, refreshKey }: Props) {
  const uiRead1 = useQuery({
    queryKey: ["dms-observability", "getDmsAiErrorBreakdown", filters, refreshKey],
    queryFn: async () => {
      const result = await getDmsAiErrorBreakdown(filters);
      if (!result.success || !result.data) throw new Error(result.error ?? "Failed to load.");
      return result.data;
    },
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
 const { data, isPending: loading, error: queryError } = uiRead1;
  const error = queryError?.message;

  if (loading) return <QueryReadBoundary queries={[uiRead1]}><div className="text-sm text-muted-foreground">Loading error analysis...</div></QueryReadBoundary>;
  if (error) return <QueryReadBoundary queries={[uiRead1]}><div className="text-sm text-destructive">{error}</div></QueryReadBoundary>;
  if (!data || data.length === 0) return <QueryReadBoundary queries={[uiRead1]}><div className="text-sm text-muted-foreground text-green-600">No errors in selected period.</div></QueryReadBoundary>;

  return (
    <QueryReadBoundary queries={[uiRead1]}><div className="overflow-x-auto rounded-lg border">
      {/* UI05 explicit table: authorized loaded rows, original permission-aware actions */}<ERPDataTable tableId="special.dms.ai-observability.sections.ai-error-breakdown" data={data} columns={[{id:"errorMessage",header:"Error summary",accessorFn:row=>loadedListValue(row,"errorMessage"),meta:{filter:{type:"text"}},enableHiding:false,size:220,cell:({row:{original:row}})=>{
return <>{row.errorMessage}</>;}},{id:"featureArea",header:"Feature",accessorFn:row=>loadedListValue(row,"featureArea"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:row}})=>{
return <>{row.featureArea}</>;}},{id:"operationType",header:"Operation",accessorFn:row=>loadedListValue(row,"operationType"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:row}})=>{
return <>{row.operationType}</>;}},{id:"count",header:"Count",accessorFn:row=>loadedListValue(row,"count"),meta:{filter:{type:"number"}},enableHiding:true,size:180,cell:({row:{original:row}})=>{
return <>{row.count}</>;}},{id:"lastSeen",header:"Last seen",accessorFn:row=>loadedListValue(row,"lastSeen"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:row}})=>{
return <>{new Date(row.lastSeen).toLocaleDateString()}</>;}}]} enableRowSelection={false} searchPlaceholder="Search loaded records…" initialPageSize={10} />
    </div></QueryReadBoundary>
  );
}
