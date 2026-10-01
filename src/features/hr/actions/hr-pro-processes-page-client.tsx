"use client";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { loadedListValue } from "@/components/erp/table/loaded-list-view";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";

import { Skeleton } from "@/components/ui/skeleton";
import { queryKeys } from "@/lib/query/query-keys";
import type { AuthContext } from "@/lib/rbac/check";
import { listGlobalProProcesses } from "@/server/actions/hr/actions";
import { useQuery } from "@tanstack/react-query";
import { Globe } from "lucide-react";

type Props = { authContext: AuthContext };

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  requested: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200",
  waiting_for_document: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-200",
  submitted: "bg-indigo-100 text-indigo-700",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
  rejected: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200",
  cancelled: "bg-muted text-muted-foreground",
  completed: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-200",
};

export function HrProProcessesPageClient({ authContext }: Props) {
  const uiRead1 = useQuery({
    queryKey: queryKeys.hr.actions.globalProProcesses(),
    queryFn: () => listGlobalProProcesses(),
  });
  const { data: items = [], isLoading } = uiRead1;

  return (
    <QueryReadBoundary queries={[uiRead1]}><div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Globe className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">PRO Processes</h1>
          <p className="text-muted-foreground text-sm">All employee PRO, government, and visa processes.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No PRO processes found.</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          {/* UI04 explicit table: loaded authorized rows only */}<ERPDataTable tableId="hr.actions.hr-pro-processes-page-client" data={items} columns={[{id:"process_title",header:"Process",accessorFn:item=>loadedListValue(item,"process_title"),enableHiding:false,size:240,cell:({row:{original:item}})=><>{item.process_title}</>},{id:"process_status",header:"Status",accessorFn:item=>loadedListValue(item,"process_status"),enableHiding:true,size:160,cell:({row:{original:item}})=><><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[item.process_status] ?? "bg-muted text-muted-foreground"}`}>
                      {item.process_status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                    </span></>},{id:"priority",header:"Priority",accessorFn:item=>loadedListValue(item,"priority"),enableHiding:true,size:160,cell:({row:{original:item}})=><>{item.priority}</>},{id:"request_date",header:"Request Date",accessorFn:item=>loadedListValue(item,"request_date"),enableHiding:true,size:160,cell:({row:{original:item}})=><>{item.request_date}</>},{id:"target_date",header:"Target Date",accessorFn:item=>loadedListValue(item,"target_date"),enableHiding:true,size:160,cell:({row:{original:item}})=><>{item.target_date ?? "—"}</>}]} enableRowSelection={false} initialPageSize={25} searchPlaceholder="Search loaded records…"/>
        </div>
      )}
    </div></QueryReadBoundary>
  );
}
