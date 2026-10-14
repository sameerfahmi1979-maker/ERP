"use client";
import {useQueryClient} from "@tanstack/react-query";
import {useLayoutEffect, useRef} from "react";
import {toast} from "sonner";
import {CheckSquare, CheckCircle, XCircle} from "lucide-react";
import {useReasonDialog} from "@/hooks/use-reason-dialog";
import {useGuardedTransition as useTransition} from "@/hooks/use-guarded-transition";
import {useHrActionInquiry, useHrActionInquiryIdentity, type HrActionInquiryProps} from "@/hooks/use-hr-action-inquiry";
import {approveEmployeeApprovalRequest, rejectEmployeeApprovalRequest} from "@/server/actions/hr/actions";
import {invalidateHrGlobalApprovals} from "@/lib/query/invalidation";
import {Button} from "@/components/ui/button";
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
  const {askReason, reasonDialog, cancelReason} = useReasonDialog(ready), qc = useQueryClient(), [isPending, startTransition] = useTransition();
  const target = useRef<{id: number; criteria: string} | null>(null);
  const current = useRef({ready, ids: read.data.map(row => row.id), criteria: read.criteriaIdentity});
  useLayoutEffect(() => {
    current.current = {ready, ids: read.data.map(row => row.id), criteria: read.criteriaIdentity};
    if (target.current && (target.current.criteria !== read.criteriaIdentity || ready && !current.current.ids.includes(target.current.id))) {target.current = null; cancelReason();}
    return () => {current.current.ready = false;};
  }, [ready, read.data, read.criteriaIdentity, cancelReason]);
  const canManage = authContext.permissionCodes.includes("hr.actions.manage") || authContext.roleCodes.includes("system_admin") || authContext.roleCodes.includes("group_admin");
  const handleApprove = (id: number) => {if (!canManage || !current.current.ready || !current.current.ids.includes(id)) return; startTransition(async () => {
    const result = await approveEmployeeApprovalRequest(id);
    if (result.success) {toast.success("Request approved"); invalidateHrGlobalApprovals(qc);} else toast.error(result.error);
  });};
  const handleReject = async (id: number) => {
    if (!canManage || !current.current.ready || !current.current.ids.includes(id)) return;
    const selected = {id, criteria: current.current.criteria}; target.current = selected;
    const reason = await askReason("Reject approval request");
    if (!reason || target.current !== selected || !current.current.ready || !current.current.ids.includes(id)) return;
    target.current = null;
    startTransition(async () => {
      const result = await rejectEmployeeApprovalRequest(id, reason);
      if (result.success) {toast.success("Request rejected"); invalidateHrGlobalApprovals(qc);} else toast.error(result.error);
    });
  };
  if (read.denied) return <p role="alert">HR records are unavailable for this session. Sign in again or refresh after permitted access is restored.</p>;
  return <div className="p-6 max-w-7xl mx-auto space-y-4">{reasonDialog}
    <div className="flex items-center gap-3"><CheckSquare className="h-6 w-6 text-primary" /><div>
      <h1 className="text-2xl font-bold tracking-tight">Approval Requests</h1>
      <p className="text-muted-foreground text-sm">All employee HR approval requests.</p>
    </div></div>
    <HrActionInquiryTable kind="approvals" identity={props.identity} read={read} columns={[
      {id: "request_title", header: "Request", accessorKey: "request_title", enableHiding: false, size: 240},
      {id: "approval_type", header: "Type", accessorFn: row => row.approval_type.replaceAll("_", " "), size: 160},
      {id: "request_status", header: "Status", accessorKey: "request_status", size: 160, cell: ({row}) => <span className={"inline-flex items-center px-2 py-0.5 rounded text-xs font-medium " + (STATUS_COLORS[row.original.request_status] ?? "bg-muted text-muted-foreground")}>{row.original.request_status}</span>},
      {id: "requested_at", header: "Requested", accessorKey: "requested_at", size: 160, cell: ({row}) => new Date(row.original.requested_at).toLocaleDateString()},
      ...(canManage ? [{id: "actions", header: "Actions", enableSorting: false, size: 200, meta: {exportable: false}, cell: ({row}: {row: {original: {id: number; request_status: string}}}) => row.original.request_status === "pending" ? <div className="flex gap-1">
        <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-300 dark:text-green-200 dark:border-green-800" disabled={isPending} onClick={() => handleApprove(row.original.id)}><CheckCircle className="h-3 w-3 mr-1" />Approve</Button>
        <Button size="sm" variant="outline" className="h-7 text-xs text-red-700 border-red-300 dark:text-red-200 dark:border-red-800" disabled={isPending} onClick={() => void handleReject(row.original.id)}><XCircle className="h-3 w-3 mr-1" />Reject</Button>
      </div> : null}] : []),
    ]} />
  </div>;
}
