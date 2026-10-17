"use client";
import {useCallback, useEffect, useRef, useState} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {useReasonDialog} from "@/hooks/use-reason-dialog";
import {useGuardedTransition as useTransition} from "@/hooks/use-guarded-transition";
import {useRealtimeSync} from "@/hooks/realtime/use-realtime-sync";
import {invalidateHrGlobalLeaveRequests} from "@/lib/query/invalidation";
import {hasPermission} from "@/lib/rbac/scope";
import type {AuthContext} from "@/lib/rbac/check";
import type {HrTimeLeaveRow} from "@/lib/reads/hr-time-schema";
import {useHrTimeInquiryIdentity} from "@/hooks/use-hr-time-read";
import {HrTimeReadList, type HrTimeReadAdmission} from "../hr-time-read-list";
import {approveLeaveRequest, rejectLeaveRequest} from "@/server/actions/hr/time";
import {getLeaveApprovalStatusBadge} from "@/lib/hr/time/status";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {CheckCircle, XCircle, ExternalLink} from "lucide-react";
import Link from "next/link";
import {toast} from "sonner";
import {formatTimeInquiryDate} from "@/lib/hr/time/date-utils";
type Props = {initialRows: HrTimeLeaveRow[]; initialCount: number; authContext: AuthContext; initialReadIdentity?: string; initialUpdatedAt?: number};
export function HrLeavePageClient(props: Props) {
  const identity = useHrTimeInquiryIdentity("leave", props.authContext);
  // Retire pending reasons and guarded mutation state together with the account.
  // The outer identity hook also cancels/removes the retired read cache.
  return <LeaveSession key={identity} {...props} />;
}
function LeaveSession({initialRows, initialCount, authContext, initialReadIdentity, initialUpdatedAt}: Props) {
  const admission = useRef<HrTimeReadAdmission>({ready: false, criteria: "", ids: []});
  const target = useRef<{id: number; criteria: string} | null>(null);
  const [reasonReady, setReasonReady] = useState(true);
  const {askReason, reasonDialog, cancelReason} = useReasonDialog(reasonReady), qc = useQueryClient(), [isPending, startTransition] = useTransition(), mounted = useRef(true);
  const onReadAdmission = useCallback((next: HrTimeReadAdmission) => {
    admission.current = next;
    if (target.current && (target.current.criteria !== next.criteria || next.ready && !next.ids.includes(target.current.id))) {target.current = null; cancelReason();}
    setReasonReady(!target.current ? false : next.ready && next.ids.includes(target.current.id));
  }, [cancelReason]);
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  const canManage = hasPermission(authContext, "hr.leave.manage");
  useRealtimeSync({table: "employee_leave_requests", event: "*", debounceMs: 400, onEvent: () => invalidateHrGlobalLeaveRequests(qc)});
  function handleApprove(id: number) {
    startTransition(async () => {const r = await approveLeaveRequest(id); if (!mounted.current) return;
      if (r.success) {toast.success("Leave approved"); void qc.invalidateQueries({queryKey: ["hr", "time", "global-leave-requests"]});} else toast.error(r.error ?? "Failed to approve");});
  }
  async function handleReject(id: number) {
    if (!admission.current.ready || !admission.current.ids.includes(id)) return;
    const selected = {id, criteria: admission.current.criteria};
    target.current = selected; setReasonReady(true);
    const reason = await askReason("Reject leave request", false);
    if (reason === null || !mounted.current || target.current !== selected || !admission.current.ready || !admission.current.ids.includes(id)) return;
    target.current = null;
    startTransition(async () => {const r = await rejectLeaveRequest(id, reason || undefined); if (!mounted.current) return;
      if (r.success) {toast.success("Leave rejected"); void qc.invalidateQueries({queryKey: ["hr", "time", "global-leave-requests"]});} else toast.error(r.error ?? "Failed to reject");});
  }
  return <>{reasonDialog}<HrTimeReadList kind="leave" onReadAdmission={onReadAdmission} authContext={authContext} initialPage={{kind: "leave", rows: initialRows, totalCount: initialCount, page: 1, pageSize: 25}} initialUpdatedAt={initialUpdatedAt} initialReadIdentity={initialReadIdentity} renderRecord={row => {
    if (!("start_date" in row)) return null;
    const badge = getLeaveApprovalStatusBadge(row.approval_status);
    return <div className="flex flex-wrap items-center gap-2 text-sm"><div><p>{row.employee?.full_name_en ?? "—"}</p><p className="text-xs text-muted-foreground">{row.employee?.employee_code ?? `EMP-${row.employee_id}`}</p></div><span>{row.leave_type?.name_en ?? "—"}</span><span>{formatTimeInquiryDate(row.start_date)} — {formatTimeInquiryDate(row.end_date)}</span><span>{row.total_days ?? "—"} days</span><Badge variant={badge.variant}>{badge.label}</Badge>
      {canManage && row.approval_status === "pending" && <><Button aria-label="Approve" title="Approve" size="sm" variant="ghost" disabled={isPending} onClick={() => handleApprove(row.id)}><CheckCircle className="h-3.5 w-3.5" /></Button><Button aria-label="Reject" title="Reject" size="sm" variant="ghost" className="text-destructive" disabled={isPending} onClick={() => handleReject(row.id)}><XCircle className="h-3.5 w-3.5" /></Button></>}
      <Link href={`/admin/hr/employees/record/${row.employee_id}?section=time`}><Button aria-label="Open record" size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5" /></Button></Link></div>;
  }} /></>;
}
