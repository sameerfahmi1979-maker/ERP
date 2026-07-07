"use client";

import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle, XCircle, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { queryKeys } from "@/lib/query/query-keys";
import {
  listLeaveRequests,
  approveLeaveRequest,
  rejectLeaveRequest,
  type LeaveRequestRow,
} from "@/server/actions/hr/time";
import { getLeaveApprovalStatusBadge } from "@/lib/hr/time/status";
import type { AuthContext } from "@/lib/rbac/check";
import { useRealtimeSync } from "@/hooks/realtime/use-realtime-sync";
import { invalidateHrGlobalLeaveRequests } from "@/lib/query/invalidation";

type Props = {
  initialRows: LeaveRequestRow[];
  initialCount: number;
  authContext: AuthContext;
};

function checkPerm(ctx: AuthContext, code: string): boolean {
  return (
    ctx.permissionCodes.includes(code) ||
    ctx.roleCodes.includes("system_admin") ||
    ctx.roleCodes.includes("group_admin")
  );
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try { return format(new Date(d), "dd MMM yyyy"); } catch { return d; }
}

export function HrLeavePageClient({ initialRows, initialCount, authContext }: Props) {
  const qc = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const canManage = checkPerm(authContext, "hr.leave.manage");

  const params = {
    page,
    page_size: pageSize,
    ...(statusFilter ? { approval_status: statusFilter } : {}),
    ...(dateFrom ? { date_from: dateFrom } : {}),
    ...(dateTo ? { date_to: dateTo } : {}),
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.hr.time.globalLeaveRequests(params),
    queryFn: async () => {
      const r = await listLeaveRequests(params);
      if (!r.success) throw new Error(r.error ?? "Failed to load leave requests");
      return r.data ?? { data: [], count: 0 };
    },
    refetchOnMount: "always",
  });

  // ERP REALTIME.1C — live leave requests list sync.
  useRealtimeSync({
    table: "employee_leave_requests",
    event: "*",
    debounceMs: 400,
    onEvent: () => {
      invalidateHrGlobalLeaveRequests(qc);
    },
  });

  function handleApprove(id: number) {
    startTransition(async () => {
      const r = await approveLeaveRequest(id);
      if (r.success) {
        toast.success("Leave approved");
        qc.invalidateQueries({ queryKey: ["hr", "time", "global-leave-requests"] });
      } else toast.error(r.error ?? "Failed to approve");
    });
  }

  function handleReject(id: number) {
    const reason = prompt("Enter rejection reason (optional):");
    if (reason === null) return;
    startTransition(async () => {
      const r = await rejectLeaveRequest(id, reason || undefined);
      if (r.success) {
        toast.success("Leave rejected");
        qc.invalidateQueries({ queryKey: ["hr", "time", "global-leave-requests"] });
      } else toast.error(r.error ?? "Failed to reject");
    });
  }

  const rows = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="border rounded-md px-3 py-2 text-sm bg-background"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="w-40" placeholder="From" />
        <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="w-40" placeholder="To" />
        {(statusFilter || dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setStatusFilter(""); setDateFrom(""); setDateTo(""); setPage(1); }}>
            Clear
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{totalCount} requests</p>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : isError ? (
        <div className="text-center py-16 text-destructive text-sm">
          {error instanceof Error ? error.message : "Failed to load leave requests"}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">No leave requests found.</div>
      ) : (
        <div className="border rounded-md divide-y">
          <div className="px-4 py-2 grid grid-cols-12 text-xs font-medium text-muted-foreground bg-muted/30">
            <span className="col-span-2">Employee</span>
            <span className="col-span-2">Leave Type</span>
            <span className="col-span-2">Start</span>
            <span className="col-span-2">End</span>
            <span className="col-span-1">Days</span>
            <span className="col-span-2">Status</span>
            <span className="col-span-1 text-right">Actions</span>
          </div>
          {rows.map((row) => {
            const badge = getLeaveApprovalStatusBadge(row.approval_status);
            return (
              <div key={row.id} className="px-4 py-2.5 grid grid-cols-12 items-center text-sm gap-2">
                <div className="col-span-2 min-w-0">
                  <p className="text-xs font-medium truncate">{row.employee?.full_name_en ?? "—"}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{row.employee?.employee_code ?? `EMP-${row.employee_id}`}</p>
                </div>
                <span className="col-span-2 text-xs">{row.leave_type?.name_en ?? "—"}</span>
                <span className="col-span-2 text-xs">{fmtDate(row.start_date)}</span>
                <span className="col-span-2 text-xs">{fmtDate(row.end_date)}</span>
                <span className="col-span-1 text-xs">{row.total_days ?? "—"}</span>
                <span className="col-span-2">
                  <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                </span>
                <div className="col-span-1 flex justify-end gap-1">
                  {canManage && row.approval_status === "pending" && (
                    <>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleApprove(row.id)} disabled={isPending} title="Approve">
                        <CheckCircle className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={() => handleReject(row.id)} disabled={isPending} title="Reject">
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                  <Link href={`/admin/hr/employees/record/${row.employee_id}?section=time`}>
                    <Button size="sm" variant="ghost" className="h-7 px-2">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
          <span className="text-sm text-muted-foreground self-center">Page {page} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
