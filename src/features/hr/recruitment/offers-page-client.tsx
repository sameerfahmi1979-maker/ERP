"use client";
import Link from "next/link";
import {hasPermission} from "@/lib/rbac/scope";
import {useRecruitmentInquiry, useRecruitmentInquiryIdentity, type RecruitmentInquiryProps} from "@/hooks/use-hr-recruitment-inquiry";
import {RecruitmentInquiryTable} from "./recruitment-inquiry-table";
export function OffersPageClient(props: RecruitmentInquiryProps) {
  const identity = useRecruitmentInquiryIdentity("offers", props.authContext);
  return <OffersSession key={identity} {...props} identity={identity} />;
}
function OffersSession(props: RecruitmentInquiryProps & {identity: string}) {
  const read = useRecruitmentInquiry("offers", props, props.identity);
  const canManage = hasPermission(props.authContext, "hr.recruitment.manage");
  return <div className="p-6 max-w-7xl mx-auto space-y-4"><h1 className="text-xl font-semibold">Offers</h1>
    <RecruitmentInquiryTable kind="offers" identity={props.identity} read={read} columns={[
      {id: "candidate_name", header: "Candidate", accessorFn: row => row.candidate?.full_name_en ?? "Restricted or unavailable", enableHiding: false, size: 240},
      {id: "candidate_code", header: "Candidate code", accessorFn: row => row.candidate?.candidate_code ?? "—", size: 150},
      {id: "offer_status", header: "Status", accessorKey: "offer_status", size: 160},
      {id: "designation", header: "Designation", accessorFn: row => row.designation?.designation_name_en ?? "—", enableSorting: false, size: 180},
      {id: "basic_salary", header: "Basic salary", accessorFn: row => canManage && row.basic_salary !== null ? `${row.basic_salary.toLocaleString()} ${row.currency}` : "[restricted]", enableSorting: false, size: 160},
      {id: "proposed_joining_date", header: "Joining date", accessorFn: row => row.proposed_joining_date ?? "—", size: 160},
      {id: "valid_until", header: "Valid until", accessorFn: row => row.valid_until ?? "—", size: 160},
      {id: "actions", header: "Actions", enableSorting: false, cell: ({row}) => row.original.candidate && <Link prefetch={false} className="text-primary underline" href={`/admin/hr/recruitment/candidates/record/${row.original.candidate_id}`}>View Candidate</Link>},
    ]} />
  </div>;
}
