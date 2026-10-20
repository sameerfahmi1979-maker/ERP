"use client";
import {useCallback,useRef,useState} from "react";
import {useQueryClient} from "@tanstack/react-query";


import {useRealtimeSync} from "@/hooks/realtime/use-realtime-sync";
import {invalidateHrGlobalLeaveRequests} from "@/lib/query/invalidation";
import {hasPermission} from "@/lib/rbac/scope";
import type {AuthContext} from "@/lib/rbac/check";
import type {HrTimeLeaveRow} from "@/lib/reads/hr-time-schema";
import {useHrTimeInquiryIdentity} from "@/hooks/use-hr-time-read";
import {HrTimeReadList, type HrTimeReadAdmission} from "../hr-time-read-list";
import{TimeRecordEditor,type TimeTarget}from'@/features/hr/employees/time-record-editor';
import{HrChildRecoveryPanel}from'@/features/hr/employees/hr-child-recovery-panel';
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
  const qc=useQueryClient(),admission=useRef<HrTimeReadAdmission>({ready:false,criteria:'',ids:[]}),[readState,setReadState]=useState<HrTimeReadAdmission>({ready:false,criteria:'',ids:[]}),[target,setTarget]=useState<(TimeTarget&{employeeId:number;criteria:string})|null>(null);
  const onReadAdmission=useCallback((next:HrTimeReadAdmission)=>{admission.current=next;setTarget(old=>old&&(old.criteria!==next.criteria||next.ready&&!next.ids.includes(old.id!))?null:old);setReadState(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);},[]);
  const canManage=hasPermission(authContext,'hr.leave.manage'),isPending=false;
  useRealtimeSync({table:'employee_leave_requests',event:'*',debounceMs:400,onEvent:()=>invalidateHrGlobalLeaveRequests(qc)});
  const canDispatch=()=>admission.current.ready&&!!target&&admission.current.ids.includes(target.id!);
  const open=(row:HrTimeLeaveRow,action:'approve'|'reject')=>{if(admission.current.ready&&admission.current.ids.includes(row.id))setTarget({kind:'leave-request',id:row.id,employeeId:row.employee_id,criteria:admission.current.criteria,action});};
  return <><HrChildRecoveryPanel authContext={authContext}/>{target&&<TimeRecordEditor target={target}employeeId={target.employeeId}authContext={authContext}canDispatch={canDispatch}blocked={!readState.ready||!readState.ids.includes(target.id!)}retry={()=>invalidateHrGlobalLeaveRequests(qc)}onClose={()=>setTarget(null)}onSaved={()=>{toast.success("Leave change saved");invalidateHrGlobalLeaveRequests(qc);}}/>}<HrTimeReadList kind="leave" onReadAdmission={onReadAdmission} authContext={authContext} initialPage={{kind: "leave", rows: initialRows, totalCount: initialCount, page: 1, pageSize: 25}} initialUpdatedAt={initialUpdatedAt} initialReadIdentity={initialReadIdentity} renderRecord={row => {
    if (!("start_date" in row)) return null;
    const badge = getLeaveApprovalStatusBadge(row.approval_status);
    return <div className="flex flex-wrap items-center gap-2 text-sm"><div><p>{row.employee?.full_name_en ?? "—"}</p><p className="text-xs text-muted-foreground">{row.employee?.employee_code ?? `EMP-${row.employee_id}`}</p></div><span>{row.leave_type?.name_en ?? "—"}</span><span>{formatTimeInquiryDate(row.start_date)} — {formatTimeInquiryDate(row.end_date)}</span><span>{row.total_days ?? "—"} days</span><Badge variant={badge.variant}>{badge.label}</Badge>
      {canManage && row.approval_status === "pending" && <><Button aria-label="Approve" title="Approve" size="sm" variant="ghost" disabled={isPending||!readState.ready} onClick={() => open(row,'approve')}><CheckCircle className="h-3.5 w-3.5" /></Button><Button aria-label="Reject" title="Reject" size="sm" variant="ghost" className="text-destructive" disabled={isPending||!readState.ready} onClick={() => open(row,'reject')}><XCircle className="h-3.5 w-3.5" /></Button></>}
      <Link href={`/admin/hr/employees/record/${row.employee_id}?section=time`}><Button aria-label="Open record" size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5" /></Button></Link></div>;
  }} /></>;
}
