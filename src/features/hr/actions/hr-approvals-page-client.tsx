"use client";
import { useReasonDialog } from "@/hooks/use-reason-dialog";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { loadedListValue } from "@/components/erp/table/loaded-list-view";
import { useGuardedTransition as useTransition } from "@/hooks/use-guarded-transition";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";

import {} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query/query-keys";
import {
  listGlobalApprovalRequests,
  approveEmployeeApprovalRequest,
  rejectEmployeeApprovalRequest,
} from "@/server/actions/hr/actions";
import { invalidateHrGlobalApprovals } from "@/lib/query/invalidation";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CheckSquare, CheckCircle, XCircle } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";

type Props = { authContext: AuthContext };

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export function HrApprovalsPageClient({ authContext }: Props) {
  const { askReason, reasonDialog } = useReasonDialog();
  const qc = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const canManage = authContext.permissionCodes.includes("hr.actions.manage") ||
    authContext.roleCodes.includes("system_admin") || authContext.roleCodes.includes("group_admin");

  const uiRead1 = useQuery({
    queryKey: queryKeys.hr.actions.globalApprovals(),
    queryFn: () => listGlobalApprovalRequests(),
  });
  const { data: items = [], isLoading } = uiRead1;

  const handleApprove = (id: number) => {
    startTransition(async () => {
      const result = await approveEmployeeApprovalRequest(id);
      if (result.success) { toast.success("Request approved"); invalidateHrGlobalApprovals(qc); }
      else toast.error(result.error);
    });
  };

  const handleReject = async (id: number) => {
    const reason = await askReason("Reject approval request");
    if (!reason) return;
    startTransition(async () => {
      const result = await rejectEmployeeApprovalRequest(id, reason);
      if (result.success) { toast.success("Request rejected"); invalidateHrGlobalApprovals(qc); }
      else toast.error(result.error);
    });
  };

  return (
    <QueryReadBoundary queries={[uiRead1]}><div className="p-6 max-w-7xl mx-auto space-y-4">{reasonDialog}
      <div className="flex items-center gap-3">
        <CheckSquare className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Approval Requests</h1>
          <p className="text-muted-foreground text-sm">All employee HR approval requests.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No approval requests found.</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          {/* UI04 explicit table: loaded authorized rows only */}<ERPDataTable tableId="hr.actions.hr-approvals-page-client" data={items} columns={[{id:"request_title",header:"Request",accessorFn:item=>loadedListValue(item,"request_title"),enableHiding:false,size:240,cell:({row:{original:item}}:{row:{original:(typeof items)[number]}})=><>{item.request_title}</>},{id:"approval_type",header:"Type",accessorFn:item=>loadedListValue(item,"approval_type"),enableHiding:true,size:160,cell:({row:{original:item}}:{row:{original:(typeof items)[number]}})=><>{item.approval_type.replace(/_/g, " ")}</>},{id:"request_status",header:"Status",accessorFn:item=>loadedListValue(item,"request_status"),enableHiding:true,size:160,cell:({row:{original:item}}:{row:{original:(typeof items)[number]}})=><><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[item.request_status] ?? "bg-slate-100 text-slate-600"}`}>
                      {item.request_status.charAt(0).toUpperCase() + item.request_status.slice(1)}
                    </span></>},{id:"requested_at",header:"Requested",accessorFn:item=>loadedListValue(item,"requested_at"),enableHiding:true,size:160,cell:({row:{original:item}}:{row:{original:(typeof items)[number]}})=><>{new Date(item.requested_at).toLocaleDateString()}</>},...(canManage?[{id:"actions",header:"Actions",enableHiding:true,size:200,enableSorting:false,meta:{exportable:false},cell:({row:{original:item}}:{row:{original:(typeof items)[number]}})=><>{item.request_status === "pending" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-300" disabled={isPending} onClick={() => handleApprove(item.id)}>
                            <CheckCircle className="h-3 w-3 mr-1" />Approve
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-red-700 border-red-300" disabled={isPending} onClick={() => handleReject(item.id)}>
                            <XCircle className="h-3 w-3 mr-1" />Reject
                          </Button>
                        </div>
                      )}</>}]:[])]} enableRowSelection={false} initialPageSize={25} searchPlaceholder="Search loaded records…"/>
        </div>
      )}
    </div></QueryReadBoundary>
  );
}
