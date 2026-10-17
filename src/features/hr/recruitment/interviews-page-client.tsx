"use client";
import Link from "next/link";
import {useRecruitmentInquiry, useRecruitmentInquiryIdentity, type RecruitmentInquiryProps} from "@/hooks/use-hr-recruitment-inquiry";
import {RecruitmentInquiryTable} from "./recruitment-inquiry-table";
export function InterviewsPageClient(props: RecruitmentInquiryProps) {
  const identity = useRecruitmentInquiryIdentity("interviews", props.authContext);
  return <InterviewsSession key={identity} {...props} identity={identity} />;
}
function InterviewsSession(props: RecruitmentInquiryProps & {identity: string}) {
  const read = useRecruitmentInquiry("interviews", props, props.identity);
  return <div className="p-6 max-w-7xl mx-auto space-y-4"><h1 className="text-xl font-semibold">Interviews</h1>
    <RecruitmentInquiryTable kind="interviews" identity={props.identity} read={read} columns={[
      {id: "candidate_name", header: "Candidate", accessorFn: row => row.candidate?.full_name_en ?? "Restricted or unavailable", enableHiding: false, size: 240},
      {id: "candidate_code", header: "Candidate code", accessorFn: row => row.candidate?.candidate_code ?? "—", size: 150},
      {id: "interview_status", header: "Status", accessorKey: "interview_status", size: 150},
      {id: "interview_round", header: "Round", accessorKey: "interview_round", size: 150},
      {id: "result", header: "Result", accessorFn: row => row.result ?? "—", size: 120},
      {id: "interview_datetime", header: "Interview date", accessorKey: "interview_datetime", size: 200, cell: ({row}) => row.original.interview_datetime ? new Date(row.original.interview_datetime).toLocaleString() : "No date set"},
      {id: "interviewer", header: "Interviewer", accessorFn: row => row.interviewer?.full_name_en ?? "Restricted or unavailable", enableSorting: false, size: 200},
      {id: "interview_location", header: "Location", accessorFn: row => row.interview_location ?? "—", size: 200},
      {id: "actions", header: "Actions", enableSorting: false, cell: ({row}) => row.original.candidate && <Link prefetch={false} className="text-primary underline" href={`/admin/hr/recruitment/candidates/record/${row.original.candidate_id}`}>View Candidate</Link>},
    ]} />
  </div>;
}
