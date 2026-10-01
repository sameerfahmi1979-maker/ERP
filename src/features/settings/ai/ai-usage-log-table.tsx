"use client";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { loadedListValue } from "@/components/erp/table/loaded-list-view";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import { CheckCircle2, XCircle, BarChart3 } from "lucide-react";
import { format } from "date-fns";

type UsageLogRow = {
  id: number;
  featureArea: string;
  operationType: string;
  modelId: string | null;
  status: string;
  durationMs: number | null;
  estimatedCost: number | null;
  errorMessage: string | null;
  createdAt: string;
  providerName?: string | null;
};

interface AiUsageLogTableProps {
  logs: UsageLogRow[];
}

export function AiUsageLogTable({ logs }: AiUsageLogTableProps) {
  if (logs.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
          <BarChart3 className="h-8 w-8 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">No usage logs yet.</p>
          <p className="text-xs text-muted-foreground">
            Logs will appear here after running test connections or using AI features.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          {/* UI05 explicit table: authorized loaded rows, original permission-aware actions */}<ERPDataTable tableId="special.settings.ai.ai-usage-log-table" data={logs} columns={[{id:"createdAt",header:"Time",accessorFn:log=>loadedListValue(log,"createdAt"),meta:{filter:{type:"text"}},enableHiding:false,size:220,cell:({row:{original:log}})=>{
return <>{format(new Date(log.createdAt), "dd MMM HH:mm")}</>;}},{id:"providerName",header:"Provider",accessorFn:log=>loadedListValue(log,"providerName"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:log}})=>{
return <>{log.providerName ?? <span className="text-muted-foreground">—</span>}</>;}},{id:"featureArea",header:"Area",accessorFn:log=>loadedListValue(log,"featureArea"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:log}})=>{
return <><Badge variant="outline" className="text-xs font-normal">
                      {log.featureArea}
                    </Badge></>;}},{id:"operationType",header:"Operation",accessorFn:log=>loadedListValue(log,"operationType"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:log}})=>{
return <>{log.operationType}</>;}},{id:"modelId",header:"Model",accessorFn:log=>loadedListValue(log,"modelId"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:log}})=>{
return <>{log.modelId ?? <span className="text-muted-foreground">—</span>}</>;}},{id:"status",header:"Status",accessorFn:log=>loadedListValue(log,"status"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:log}})=>{
return <>{log.status === "success" ? (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Success
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-destructive">
                        <XCircle className="h-3.5 w-3.5" />
                        {log.status}
                        {log.errorMessage && (
                          <span className="text-muted-foreground ml-1 truncate max-w-[150px]" title={log.errorMessage}>
                            — {log.errorMessage.substring(0, 40)}
                          </span>
                        )}
                      </span>
                    )}</>;}},{id:"durationMs",header:"Duration (ms)",accessorFn:log=>loadedListValue(log,"durationMs"),meta:{filter:{type:"number"}},enableHiding:true,size:180,cell:({row:{original:log}})=>{
return <>{log.durationMs != null ? `${log.durationMs}ms` : "—"}</>;}},{id:"estimatedCost",header:"Estimated cost",accessorFn:log=>loadedListValue(log,"estimatedCost"),meta:{filter:{type:"number"}},enableHiding:true,size:180,cell:({row:{original:log}})=>{
return <>{log.estimatedCost != null ? `$${log.estimatedCost.toFixed(6)}` : "—"}</>;}}]} enableRowSelection={false} searchPlaceholder="Search loaded records…" initialPageSize={10} />
        </div>
      </CardContent>
    </Card>
  );
}
