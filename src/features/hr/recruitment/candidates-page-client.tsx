"use client";
import Link from "next/link";
import {Plus} from "lucide-react";
import {Button} from "@/components/ui/button";
import {useQueryClient} from "@tanstack/react-query";
import {useRealtimeSync} from "@/hooks/realtime/use-realtime-sync";
import {invalidateHrCandidates} from "@/lib/query/invalidation";
import {hasPermission} from "@/lib/rbac/scope";
import {useRecruitmentInquiry, useRecruitmentInquiryIdentity, type RecruitmentInquiryProps} from "@/hooks/use-hr-recruitment-inquiry";
import {RecruitmentInquiryTable} from "./recruitment-inquiry-table";

export function CandidatesPageClient(props: RecruitmentInquiryProps) {
  const identity = useRecruitmentInquiryIdentity("candidates", props.authContext);
  return <CandidatesSession key={identity} {...props} identity={identity} />;
}
function CandidatesSession(props: RecruitmentInquiryProps & {identity: string}) {
  const read = useRecruitmentInquiry("candidates", props, props.identity), qc = useQueryClient();
  const canManage = hasPermission(props.authContext, "hr.recruitment.manage");
  useRealtimeSync({table: "hr_candidates", event: "*", debounceMs: 400, onEvent: () => {invalidateHrCandidates(qc);}});
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-xl font-semibold">Candidates</h1>
      {canManage && <Link href="/admin/hr/recruitment/candidates/record/new"><Button size="sm"><Plus className="mr-1 h-4 w-4" />New Candidate</Button></Link>}
    </div>
    <RecruitmentInquiryTable kind="candidates" identity={props.identity} read={read} columns={[
      {id: "candidate_code", header: "Code", accessorKey: "candidate_code", enableHiding: false, size: 140},
      {id: "full_name_en", header: "Candidate", accessorKey: "full_name_en", enableHiding: false, size: 240, cell: ({row}) => <Link prefetch={false} className="text-primary underline underline-offset-2" href={`/admin/hr/recruitment/candidates/record/${row.original.id}`}>{row.original.full_name_en}</Link>},
      {id: "full_name_ar", header: "Name (Arabic)", accessorFn: row => row.full_name_ar ?? "—", size: 200},
      {id: "candidate_status", header: "Status", accessorKey: "candidate_status", size: 130},
      {id: "pipeline_stage", header: "Pipeline stage", accessorKey: "pipeline_stage", size: 150},
      {id: "mobile_number", header: "Mobile", accessorFn: row => row.mobile_number ?? "—", size: 150},
      {id: "email", header: "Email", accessorFn: row => row.email ?? "—", size: 220},
      {id: "source", header: "Source", accessorFn: row => row.source ?? "—", size: 150},
      {id: "requisition", header: "Requisition", accessorFn: row => row.requisition ? `${row.requisition.requisition_code ?? ""} — ${row.requisition.requisition_title}` : "—", size: 240, enableSorting: false},
      {id: "actions", header: "Actions", enableSorting: false, cell: ({row}) => <Link prefetch={false} aria-label={`Open ${row.original.candidate_code ?? "candidate"}`} className="inline-flex min-h-11 items-center text-primary" href={`/admin/hr/recruitment/candidates/record/${row.original.id}`}>Open</Link>},
    ]} />
  </div>;
}
