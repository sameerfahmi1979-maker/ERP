"use client";

import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, CheckCircle, AlertTriangle, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { queryKeys } from "@/lib/query/query-keys";
import {
  listDailyAttendance,
  approveAttendanceDailySummary,
  type AttendanceDailySummaryRow,
} from "@/server/actions/hr/time";
import { getAttendanceStatusBadge, getAttendanceTypeLabel } from "@/lib/hr/time/status";
import { formatHours } from "@/lib/hr/time/date-utils";
import type { AuthContext } from "@/lib/rbac/check";
import { useRealtimeSync } from "@/hooks/realtime/use-realtime-sync";
import { invalidateHrDailyAttendance } from "@/lib/query/invalidation";

type Props = {
  initialRows: AttendanceDailySummaryRow[];
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

export function HrAttendancePageClient({ initialRows, initialCount, authContext }: Props) {
  const qc = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const canManage = checkPerm(authContext, "hr.attendance.manage");

  const params = {
    page,
    page_size: pageSize,
    ...(dateFilter ? { attendance_date: dateFilter } : {}),
    ...(statusFilter ? { approval_status: statusFilter } : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.hr.time.dailyAttendance(params),
    queryFn: async () => {
      const r = await listDailyAttendance(params);
      return r.success && r.data ? r.data : { data: initialRows, count: initialCount };
    },
    initialData: { data: initialRows, count: initialCount },
    staleTime: 30_000,
  });

  // ERP REALTIME.1C — live daily attendance list sync.
  useRealtimeSync({
    table: "employee_attendance_daily_summary",
    event: "*",
    debounceMs: 400,
    onEvent: () => {
      invalidateHrDailyAttendance(qc);
    },
  });

  function handleApprove(id: number) {
    startTransition(async () => {
      const r = await approveAttendanceDailySummary(id);
      if (r.success) {
        toast.success("Attendance approved");
        qc.invalidateQueries({ queryKey: ["hr", "time", "daily-attendance"] });
      } else toast.error(r.error ?? "Failed to approve");
    });
  }

  const rows = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Input
          type="date"
          value={dateFilter}
          onChange={(e) => { setDateFilter(e.target.value); setPage(1); }}
          className="w-40"
          placeholder="Date"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="border rounded-md px-3 py-2 text-sm bg-background"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="queried">Queried</option>
        </select>
        {(dateFilter || statusFilter) && (
          <Button variant="ghost" size="sm" onClick={() => { setDateFilter(""); setStatusFilter(""); setPage(1); }}>
            Clear
          </Button>
        )}
      </div>

      {/* Count */}
      <p className="text-xs text-muted-foreground">{totalCount} records</p>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">No attendance records found.</div>
      ) : (
        <div className="border rounded-md divide-y">
          <div className="px-4 py-2 grid grid-cols-12 text-xs font-medium text-muted-foreground bg-muted/30">
            <span className="col-span-2">Date</span>
            <span className="col-span-1">Employee</span>
            <span className="col-span-2">Type</span>
            <span className="col-span-1">Hours</span>
            <span className="col-span-1">OT</span>
            <span className="col-span-1">Late</span>
            <span className="col-span-2">Status</span>
            <span className="col-span-2 text-right">Actions</span>
          </div>
          {rows.map((row) => {
            const badge = getAttendanceStatusBadge(row.approval_status);
            return (
              <div key={row.id} className="px-4 py-2.5 grid grid-cols-12 items-center text-sm gap-2">
                <span className="col-span-2 text-muted-foreground">{fmtDate(row.attendance_date)}</span>
                <span className="col-span-1 text-xs text-muted-foreground">EMP-{row.employee_id}</span>
                <span className="col-span-2">{getAttendanceTypeLabel(row.attendance_type)}</span>
                <span className="col-span-1 text-xs">{formatHours(row.total_hours)}</span>
                <span className="col-span-1 text-xs">{formatHours(row.overtime_hours)}</span>
                <span className="col-span-1 text-xs">{row.late_minutes > 0 ? `${row.late_minutes}m` : "—"}</span>
                <span className="col-span-2">
                  <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                  {row.is_missing_punch && <Badge variant="destructive" className="text-xs ml-1">Missing</Badge>}
                </span>
                <div className="col-span-2 flex justify-end gap-1">
                  {canManage && row.approval_status === "pending" && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleApprove(row.id)} disabled={isPending}>
                      <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
                    </Button>
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

      {/* Pagination */}
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
