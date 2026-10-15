"use client";
import Link from "next/link";
import {useRecruitmentInquiry, useRecruitmentInquiryIdentity, type RecruitmentInquiryProps} from "@/hooks/use-hr-recruitment-inquiry";
import {RecruitmentInquiryTable} from "./recruitment-inquiry-table";
export function GlobalOnboardingPageClient(props: RecruitmentInquiryProps) {
  const identity = useRecruitmentInquiryIdentity("onboarding", props.authContext);
  return <OnboardingSession key={identity} {...props} identity={identity} />;
}
function OnboardingSession(props: RecruitmentInquiryProps & {identity: string}) {
  const read = useRecruitmentInquiry("onboarding", props, props.identity);
  return <div className="p-6 max-w-7xl mx-auto space-y-4"><h1 className="text-xl font-semibold">Onboarding Tasks</h1>
    <RecruitmentInquiryTable kind="onboarding" identity={props.identity} read={read} columns={[
      {id: "task_title", header: "Task", accessorKey: "task_title", enableHiding: false, size: 240},
      {id: "candidate_name", header: "Candidate", accessorFn: row => row.candidate?.full_name_en ?? "Restricted or unavailable", size: 200},
      {id: "candidate_code", header: "Candidate code", accessorFn: row => row.candidate?.candidate_code ?? "—", size: 150},
      {id: "task_status", header: "Status", accessorKey: "task_status", size: 150},
      {id: "task_category", header: "Category", accessorFn: row => row.task_category ?? "—", size: 150},
      {id: "due_date", header: "Due date", accessorFn: row => row.due_date ?? "—", size: 150},
      {id: "assigned_user", header: "Assigned to", accessorFn: row => row.assigned_user?.full_name_en ?? "Restricted or unavailable", enableSorting: false, size: 200},
      {id: "actions", header: "Actions", enableSorting: false, cell: ({row}) => row.original.candidate && <Link prefetch={false} className="text-primary underline" href={`/admin/hr/recruitment/candidates/record/${row.original.candidate_id}`}>View Candidate</Link>},
    ]} />
  </div>;
}
