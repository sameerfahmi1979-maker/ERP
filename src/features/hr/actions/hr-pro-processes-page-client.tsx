"use client";
import {Globe} from "lucide-react";
import {useHrActionInquiry, useHrActionInquiryIdentity, type HrActionInquiryProps} from "@/hooks/use-hr-action-inquiry";
import {HrActionInquiryTable} from "./hr-action-inquiry-table";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground", requested: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200",
  waiting_for_document: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-200",
  submitted: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
  rejected: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200", cancelled: "bg-muted text-muted-foreground",
  completed: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-200",
};
export function HrProProcessesPageClient(props: HrActionInquiryProps) {
  const identity = useHrActionInquiryIdentity("pro", props.authContext);
  return <ProSession key={identity} {...props} identity={identity} />;
}
function ProSession(props: HrActionInquiryProps & {identity: string}) {
  const read = useHrActionInquiry("pro", props, props.identity);
  return <div className="p-6 max-w-7xl mx-auto space-y-4">
    <div className="flex items-center gap-3"><Globe className="h-6 w-6 text-primary" /><div>
      <h1 className="text-2xl font-bold tracking-tight">PRO Processes</h1>
      <p className="text-muted-foreground text-sm">All employee PRO, government, and visa processes.</p>
    </div></div>
    <HrActionInquiryTable kind="pro" identity={props.identity} read={read} columns={[
      {id: "process_title", header: "Process", accessorKey: "process_title", enableHiding: false, size: 240},
      {id: "process_status", header: "Status", accessorKey: "process_status", size: 160, cell: ({row}) => <span className={"inline-flex items-center px-2 py-0.5 rounded text-xs font-medium " + (STATUS_COLORS[row.original.process_status] ?? "bg-muted text-muted-foreground")}>{row.original.process_status.replaceAll("_", " ")}</span>},
      {id: "priority", header: "Priority", accessorKey: "priority", size: 160},
      {id: "request_date", header: "Request Date", accessorKey: "request_date", size: 160},
      {id: "target_date", header: "Target Date", accessorFn: row => row.target_date ?? "—", size: 160},
    ]} />
  </div>;
}
