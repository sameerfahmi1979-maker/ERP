"use client";
import {useCallback,useRef,useState} from "react";
import {useQueryClient} from "@tanstack/react-query";

import {useRealtimeSync} from "@/hooks/realtime/use-realtime-sync";
import {invalidateHrDailyAttendance} from "@/lib/query/invalidation";
import {hasPermission} from "@/lib/rbac/scope";
import type {AuthContext} from "@/lib/rbac/check";
import type {HrTimeAttendanceRow} from "@/lib/reads/hr-time-schema";
import {useHrTimeInquiryIdentity} from "@/hooks/use-hr-time-read";
import {HrTimeReadList,type HrTimeReadAdmission} from "../hr-time-read-list";
import{TimeRecordEditor,type TimeTarget}from'@/features/hr/employees/time-record-editor';
import{HrChildRecoveryPanel}from'@/features/hr/employees/hr-child-recovery-panel';
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
  const qc=useQueryClient(),[target,setTarget]=useState<(TimeTarget&{employeeId:number;criteria:string})|null>(null),[readState,setReadState]=useState<HrTimeReadAdmission>({ready:false,criteria:'',ids:[]}),admission=useRef<HrTimeReadAdmission>({ready:false,criteria:'',ids:[]});
  const onReadAdmission=useCallback((next:HrTimeReadAdmission)=>{admission.current=next;setTarget(old=>old&&(old.criteria!==next.criteria||next.ready&&!next.ids.includes(old.id!))?null:old);setReadState(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);},[]);
  const canManage=hasPermission(authContext,'hr.attendance.manage'),isPending=false;
  useRealtimeSync({table:'employee_attendance_daily_summary',event:'*',debounceMs:400,onEvent:()=>invalidateHrDailyAttendance(qc)});
  const canDispatch=()=>admission.current.ready&&!!target&&admission.current.ids.includes(target.id!);
  const handleApprove=(row:HrTimeAttendanceRow)=>{if(admission.current.ready&&admission.current.ids.includes(row.id))setTarget({kind:'attendance-summary',id:row.id,employeeId:row.employee_id,criteria:admission.current.criteria,action:'approve'});};
  return <><HrChildRecoveryPanel authContext={authContext}/>{target&&<TimeRecordEditor target={target}employeeId={target.employeeId}authContext={authContext}canDispatch={canDispatch}blocked={!readState.ready||!readState.ids.includes(target.id!)}retry={()=>invalidateHrDailyAttendance(qc)}onClose={()=>setTarget(null)}onSaved={()=>{toast.success("Attendance approved");invalidateHrDailyAttendance(qc);}}/>}<HrTimeReadList onReadAdmission={onReadAdmission} kind="attendance" authContext={authContext} initialPage={{kind: "attendance", rows: initialRows, totalCount: initialCount, page: 1, pageSize: 25}} initialUpdatedAt={initialUpdatedAt} initialReadIdentity={initialReadIdentity} renderRecord={row => {
    if (!("attendance_date" in row)) return null;
    const badge = getAttendanceStatusBadge(row.approval_status);
    return <div className="flex flex-wrap items-center gap-2 text-sm"><span>{formatTimeInquiryDate(row.attendance_date)}</span><span className="text-xs text-muted-foreground">EMP-{row.employee_id}</span><span>{getAttendanceTypeLabel(row.attendance_type)}</span><span>{formatHours(row.total_hours)}</span><span>OT {formatHours(row.overtime_hours)}</span><Badge variant={badge.variant}>{badge.label}</Badge>{row.is_missing_punch && <Badge variant="destructive">Missing</Badge>}
      {canManage && row.approval_status === "pending" && <Button size="sm" variant="ghost" onClick={() => handleApprove(row)} disabled={isPending||!readState.ready}><CheckCircle className="h-3.5 w-3.5 mr-1" />Approve</Button>}
      <Link href={`/admin/hr/employees/record/${row.employee_id}?section=time`}><Button aria-label="Open record" size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5" /></Button></Link></div>;
  }} /></>;
}
