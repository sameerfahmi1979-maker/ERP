"use client";
import {UserMinus} from "lucide-react";
import {useHrActionInquiry, useHrActionInquiryIdentity, type HrActionInquiryProps} from "@/hooks/use-hr-action-inquiry";
import {HrActionInquiryTable} from "./hr-action-inquiry-table";
import {HrChildRecoveryPanel} from "@/features/hr/employees/hr-child-recovery-panel";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground", notice_served: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-200",
  clearance_in_progress: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200",
  pending_final_settlement: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-200",
  closed: "bg-muted text-muted-foreground", cancelled: "bg-muted text-muted-foreground",
};
export function HrEosPageClient(props: HrActionInquiryProps) {
  const identity = useHrActionInquiryIdentity("eos", props.authContext);
  return <EosSession key={identity} {...props} identity={identity} />;
}
function EosSession(props: HrActionInquiryProps & {identity: string}) {
  const read = useHrActionInquiry("eos", props, props.identity);
  return <div className="p-6 max-w-7xl mx-auto space-y-4"><HrChildRecoveryPanel authContext={props.authContext}/>
    <div className="flex items-center gap-3"><UserMinus className="h-6 w-6 text-primary" /><div>
      <h1 className="text-2xl font-bold tracking-tight">EOS &amp; Clearance</h1>
      <p className="text-muted-foreground text-sm">All end-of-service cases. Financial settlement is handled by Finance.</p>
    </div></div>
    <HrActionInquiryTable kind="eos" identity={props.identity} read={read} columns={[
      {id: "eos_type", header: "EOS Type", accessorFn: row => row.eos_type.replaceAll("_", " "), enableHiding: false, size: 240},
      {id: "case_status", header: "Status", accessorKey: "case_status", size: 160, cell: ({row}) => <span className={"inline-flex items-center px-2 py-0.5 rounded text-xs font-medium " + (STATUS_COLORS[row.original.case_status] ?? "bg-muted text-muted-foreground")}>{row.original.case_status.replaceAll("_", " ")}</span>},
      {id: "notice_date", header: "Notice Date", accessorFn: row => row.notice_date ?? "—", size: 160},
      {id: "last_working_date", header: "Last Working Date", accessorFn: row => row.last_working_date ?? "—", size: 160},
      {id: "final_settlement_status", header: "Settlement", accessorFn: row => row.final_settlement_status.replaceAll("_", " "), size: 160},
      {id: "clearance_completed", header: "Clearance", accessorKey: "clearance_completed", size: 160, cell: ({row}) => row.original.clearance_completed ? <span className="text-green-600 font-medium dark:text-green-300">Completed</span> : <span className="text-muted-foreground">Pending</span>},
    ]} />
  </div>;
}
