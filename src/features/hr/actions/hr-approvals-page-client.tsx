"use client";
import {useQueryClient} from "@tanstack/react-query";
import {useLayoutEffect, useRef, useState} from "react";
import {toast} from "sonner";
import {CheckSquare, CheckCircle, XCircle} from "lucide-react";
import {useHrActionInquiry, useHrActionInquiryIdentity, type HrActionInquiryProps} from "@/hooks/use-hr-action-inquiry";
import {invalidateHrGlobalApprovals} from "@/lib/query/invalidation";
import {Button} from "@/components/ui/button";
import {hasPermission} from "@/lib/rbac/scope";
import {HrRecordEditor} from "@/features/hr/employees/hr-record-editor";
import {HrChildRecoveryPanel} from "@/features/hr/employees/hr-child-recovery-panel";
import {HrActionInquiryTable} from "./hr-action-inquiry-table";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200",
  approved: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-200",
  rejected: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200", cancelled: "bg-muted text-muted-foreground",
};
export function HrApprovalsPageClient(props: HrActionInquiryProps) {
  const identity = useHrActionInquiryIdentity("approvals", props.authContext);
  return <ApprovalsSession key={identity} {...props} identity={identity} />;
}
function ApprovalsSession(props: HrActionInquiryProps & {identity: string}) {
  const read = useHrActionInquiry("approvals", props, props.identity), {authContext} = props;
  const ready = !read.busy && !read.isError && !read.invalid && !read.denied;
  const qc=useQueryClient();
  const [opening,setOpening]=useState<{id:number;employeeId:number;action:'approve'|'reject';criteria:string}|null>(null),[denied,setDenied]=useState(false);
  const current=useRef({ready,ids:read.data.map(row=>row.id),criteria:read.criteriaIdentity});
  useLayoutEffect(()=>{current.current={ready,ids:read.data.map(row=>row.id),criteria:read.criteriaIdentity};return()=>{current.current.ready=false;};},[ready,read.data,read.criteriaIdentity]);
  const canManage=!!authContext.profile&&authContext.isAccountActive&&!authContext.profile.must_change_password&&['hr.actions.view','hr.actions.manage'].every(code=>hasPermission(authContext,code));
  const open=(row:{id:number;employee_id:number},action:'approve'|'reject')=>{if(canManage&&current.current.ready&&current.current.ids.includes(row.id))setOpening({id:row.id,employeeId:row.employee_id,action,criteria:current.current.criteria});};
  if (read.denied||denied) return <p role="alert">HR records are unavailable for this session. Sign in again or refresh after permitted access is restored.</p>;
  return <div className="p-6 max-w-7xl mx-auto space-y-4"><HrChildRecoveryPanel authContext={authContext}/>
    <div className="flex items-center gap-3"><CheckSquare className="h-6 w-6 text-primary" /><div>
      <h1 className="text-2xl font-bold tracking-tight">Approval Requests</h1>
      <p className="text-muted-foreground text-sm">All employee HR approval requests.</p>
    </div></div>
    <HrActionInquiryTable kind="approvals" identity={props.identity} read={read} columns={[
      {id: "request_title", header: "Request", accessorKey: "request_title", enableHiding: false, size: 240},
      {id: "approval_type", header: "Type", accessorFn: row => row.approval_type.replaceAll("_", " "), size: 160},
      {id: "request_status", header: "Status", accessorKey: "request_status", size: 160, cell: ({row}) => <span className={"inline-flex items-center px-2 py-0.5 rounded text-xs font-medium " + (STATUS_COLORS[row.original.request_status] ?? "bg-muted text-muted-foreground")}>{row.original.request_status}</span>},
      {id: "requested_at", header: "Requested", accessorKey: "requested_at", size: 160, cell: ({row}) => new Date(row.original.requested_at).toLocaleDateString()},
      ...(canManage ? [{id: "actions", header: "Actions", enableSorting: false, size: 200, meta: {exportable: false}, cell: ({row}: {row: {original: {id: number; employee_id:number; request_status: string}}}) => row.original.request_status === "pending" ? <div className="flex gap-1">
        <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-300 dark:text-green-200 dark:border-green-800" disabled={!ready||opening!==null} onClick={() => open(row.original,'approve')}><CheckCircle className="h-3 w-3 mr-1" />Approve</Button>
        <Button size="sm" variant="outline" className="h-7 text-xs text-red-700 border-red-300 dark:text-red-200 dark:border-red-800" disabled={!ready||opening!==null} onClick={() => open(row.original,'reject')}><XCircle className="h-3 w-3 mr-1" />Reject</Button>
      </div> : null}] : []),
    ]} />
    {opening&&<HrRecordEditor kind="approval" employeeId={opening.employeeId} authContext={authContext} target={{id:opening.id,action:opening.action}} canDispatch={()=>ready&&canManage&&current.current.ready&&current.current.criteria===opening.criteria&&current.current.ids.includes(opening.id)} admission={{blocked:!ready||!canManage||read.criteriaIdentity!==opening.criteria||!read.data.some(row=>row.id===opening.id),message:'The approval list changed or is unavailable. Your decision wording is retained; restore the original permitted list or close without submitting.',retry:()=>void read.refetch()}} onDenied={()=>setDenied(true)} onClose={()=>setOpening(null)} onSaved={(_receipt,action)=>{toast.success(action==='approve'?'Request approved':'Request rejected');invalidateHrGlobalApprovals(qc);void qc.invalidateQueries({queryKey:['hr','actions','approvals',opening.employeeId],refetchType:'none'});}}/>}
  </div>;
}
