"use client";

import { useTransition } from "react";
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
  const qc = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const canManage = authContext.permissionCodes.includes("hr.actions.manage") ||
    authContext.roleCodes.includes("system_admin") || authContext.roleCodes.includes("group_admin");

  const { data: items = [], isLoading } = useQuery({
    queryKey: queryKeys.hr.actions.globalApprovals(),
    queryFn: () => listGlobalApprovalRequests(),
  });

  const handleApprove = (id: number) => {
    startTransition(async () => {
      const result = await approveEmployeeApprovalRequest(id);
      if (result.success) { toast.success("Request approved"); invalidateHrGlobalApprovals(qc); }
      else toast.error(result.error);
    });
  };

  const handleReject = (id: number) => {
    const reason = prompt("Rejection reason:");
    if (!reason) return;
    startTransition(async () => {
      const result = await rejectEmployeeApprovalRequest(id, reason);
      if (result.success) { toast.success("Request rejected"); invalidateHrGlobalApprovals(qc); }
      else toast.error(result.error);
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
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
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Request</th>
                <th className="text-left p-3 font-medium">Type</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Requested</th>
                {canManage && <th className="text-left p-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-medium">{item.request_title}</td>
                  <td className="p-3 capitalize text-muted-foreground">{item.approval_type.replace(/_/g, " ")}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[item.request_status] ?? "bg-slate-100 text-slate-600"}`}>
                      {item.request_status.charAt(0).toUpperCase() + item.request_status.slice(1)}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">{new Date(item.requested_at).toLocaleDateString()}</td>
                  {canManage && (
                    <td className="p-3">
                      {item.request_status === "pending" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-300" disabled={isPending} onClick={() => handleApprove(item.id)}>
                            <CheckCircle className="h-3 w-3 mr-1" />Approve
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-red-700 border-red-300" disabled={isPending} onClick={() => handleReject(item.id)}>
                            <XCircle className="h-3 w-3 mr-1" />Reject
                          </Button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
