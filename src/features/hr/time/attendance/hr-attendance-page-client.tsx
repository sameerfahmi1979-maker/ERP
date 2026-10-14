"use client";
import {useEffect, useRef} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {useGuardedTransition as useTransition} from "@/hooks/use-guarded-transition";
import {useRealtimeSync} from "@/hooks/realtime/use-realtime-sync";
import {invalidateHrDailyAttendance} from "@/lib/query/invalidation";
import {hasPermission} from "@/lib/rbac/scope";
import type {AuthContext} from "@/lib/rbac/check";
import type {HrTimeAttendanceRow} from "@/lib/reads/hr-time-schema";
import {useHrTimeInquiryIdentity} from "@/hooks/use-hr-time-read";
import {HrTimeReadList} from "../hr-time-read-list";
import {approveAttendanceDailySummary} from "@/server/actions/hr/time";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {getAttendanceStatusBadge, getAttendanceTypeLabel} from "@/lib/hr/time/status";
import {formatHours, formatTimeInquiryDate} from "@/lib/hr/time/date-utils";
import {CheckCircle, ExternalLink} from "lucide-react";
import Link from "next/link";
import {toast} from "sonner";
type Props = {initialRows: HrTimeAttendanceRow[]; initialCount: number; authContext: AuthContext; initialReadIdentity?: string; initialUpdatedAt?: number};
export function HrAttendancePageClient(props: Props) {
  const identity = useHrTimeInquiryIdentity("attendance", props.authContext);
  return <AttendanceSession key={identity} {...props} />;
}
function AttendanceSession({initialRows, initialCount, authContext, initialReadIdentity, initialUpdatedAt}: Props) {
  const qc = useQueryClient(), [isPending, startTransition] = useTransition(), mounted = useRef(true);
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  const canManage = hasPermission(authContext, "hr.attendance.manage");
  useRealtimeSync({table: "employee_attendance_daily_summary", event: "*", debounceMs: 400, onEvent: () => invalidateHrDailyAttendance(qc)});
  function handleApprove(id: number) {
    startTransition(async () => {const r = await approveAttendanceDailySummary(id); if (!mounted.current) return;
      if (r.success) {toast.success("Attendance approved"); void qc.invalidateQueries({queryKey: ["hr", "time", "daily-attendance"]});} else toast.error(r.error ?? "Failed to approve");});
  }
  return <HrTimeReadList kind="attendance" authContext={authContext} initialPage={{kind: "attendance", rows: initialRows, totalCount: initialCount, page: 1, pageSize: 25}} initialUpdatedAt={initialUpdatedAt} initialReadIdentity={initialReadIdentity} renderRecord={row => {
    if (!("attendance_date" in row)) return null;
    const badge = getAttendanceStatusBadge(row.approval_status);
    return <div className="flex flex-wrap items-center gap-2 text-sm"><span>{formatTimeInquiryDate(row.attendance_date)}</span><span className="text-xs text-muted-foreground">EMP-{row.employee_id}</span><span>{getAttendanceTypeLabel(row.attendance_type)}</span><span>{formatHours(row.total_hours)}</span><span>OT {formatHours(row.overtime_hours)}</span><Badge variant={badge.variant}>{badge.label}</Badge>{row.is_missing_punch && <Badge variant="destructive">Missing</Badge>}
      {canManage && row.approval_status === "pending" && <Button size="sm" variant="ghost" onClick={() => handleApprove(row.id)} disabled={isPending}><CheckCircle className="h-3.5 w-3.5 mr-1" />Approve</Button>}
      <Link href={`/admin/hr/employees/record/${row.employee_id}?section=time`}><Button aria-label="Open record" size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5" /></Button></Link></div>;
  }} />;
}
