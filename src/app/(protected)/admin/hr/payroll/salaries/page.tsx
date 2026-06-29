import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listGlobalSalaryProfiles } from "@/server/actions/hr/payroll";
import { HrSalariesPageClient } from "@/features/hr/payroll/salaries/hr-salaries-page-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HrSalariesPage() {
  const authContext = await getAuthContext();
  const canView =
    hasPermission(authContext, "hr.payroll.view") ||
    authContext.roleCodes?.includes("system_admin");

  if (!canView) redirect("/access-denied");

  const result = await listGlobalSalaryProfiles({ page: 1, page_size: 50 });
  const initialData = result.success && result.data
    ? result.data
    : { data: [], count: 0 };

  return <HrSalariesPageClient initialData={initialData} />;
}

