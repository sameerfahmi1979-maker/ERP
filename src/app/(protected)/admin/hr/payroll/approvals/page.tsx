import { PayrollApprovalWorkspace } from "@/features/hr/payroll-approvals/payroll-approval-workspace";

export default async function PayrollApprovalsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <PayrollApprovalWorkspace params={await searchParams} />;
}
