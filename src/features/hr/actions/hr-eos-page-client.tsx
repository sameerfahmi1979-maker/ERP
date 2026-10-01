"use client";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { loadedListValue } from "@/components/erp/table/loaded-list-view";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";

import { Skeleton } from "@/components/ui/skeleton";
import { queryKeys } from "@/lib/query/query-keys";
import type { AuthContext } from "@/lib/rbac/check";
import { listGlobalEosCases } from "@/server/actions/hr/actions";
import { useQuery } from "@tanstack/react-query";
import { UserMinus } from "lucide-react";

type Props = { authContext: AuthContext };

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  notice_served: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-200",
  clearance_in_progress: "bg-indigo-100 text-indigo-700",
  pending_final_settlement: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-200",
  closed: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

export function HrEosPageClient({ authContext }: Props) {
  const uiRead1 = useQuery({
    queryKey: queryKeys.hr.actions.globalEosCases(),
    queryFn: () => listGlobalEosCases(),
  });
  const { data: items = [], isLoading } = uiRead1;

  return (
    <QueryReadBoundary queries={[uiRead1]}><div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <UserMinus className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">EOS & Clearance</h1>
          <p className="text-muted-foreground text-sm">All end-of-service cases. Financial settlement is handled by Finance.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No EOS cases found.</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          {/* UI04 explicit table: loaded authorized rows only */}<ERPDataTable tableId="hr.actions.hr-eos-page-client" data={items} columns={[{id:"eos_type",header:"EOS Type",accessorFn:item=>loadedListValue(item,"eos_type"),enableHiding:false,size:240,cell:({row:{original:item}})=><>{item.eos_type.replace(/_/g, " ")}</>},{id:"case_status",header:"Status",accessorFn:item=>loadedListValue(item,"case_status"),enableHiding:true,size:160,cell:({row:{original:item}})=><><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[item.case_status] ?? "bg-muted text-muted-foreground"}`}>
                      {item.case_status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                    </span></>},{id:"notice_date",header:"Notice Date",accessorFn:item=>loadedListValue(item,"notice_date"),enableHiding:true,size:160,cell:({row:{original:item}})=><>{item.notice_date ?? "—"}</>},{id:"last_working_date",header:"Last Working Date",accessorFn:item=>loadedListValue(item,"last_working_date"),enableHiding:true,size:160,cell:({row:{original:item}})=><>{item.last_working_date ?? "—"}</>},{id:"final_settlement_status",header:"Settlement",accessorFn:item=>loadedListValue(item,"final_settlement_status"),enableHiding:true,size:160,cell:({row:{original:item}})=><>{item.final_settlement_status.replace(/_/g, " ")}</>},{id:"clearance_completed",header:"Clearance",accessorFn:item=>loadedListValue(item,"clearance_completed"),enableHiding:true,size:160,cell:({row:{original:item}})=><>{item.clearance_completed ? <span className="text-green-600 font-medium dark:text-green-300">Completed</span> : <span className="text-muted-foreground">Pending</span>}</>}]} enableRowSelection={false} initialPageSize={25} searchPlaceholder="Search loaded records…"/>
        </div>
      )}
    </div></QueryReadBoundary>
  );
}
