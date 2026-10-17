import {getAuthContext} from "@/lib/rbac/check";
import {canReadPayrollInquiry, payrollInquiryIdentity} from "@/lib/reads/hr-payroll-inquiries-schema";
import {readPayrollInquiry} from "@/server/reads/hr-payroll-inquiries";
import {HrSalariesPageClient} from "@/features/hr/payroll/salaries/hr-salaries-page-client";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function PayrollInquiryPage() {
  const ctx = await getAuthContext();
  if (!canReadPayrollInquiry(ctx, "salary")) redirect("/access-denied");
  const result = await readPayrollInquiry({kind: "salary"}, ctx);
  if (result.error === "Permission denied") redirect("/access-denied");
  return <HrSalariesPageClient authContext={ctx} initialPage={result.data} initialUpdatedAt={result.updatedAt} initialReadIdentity={payrollInquiryIdentity(ctx)} initialReadError={!result.success} />;
}
import {redirect} from "next/navigation";
