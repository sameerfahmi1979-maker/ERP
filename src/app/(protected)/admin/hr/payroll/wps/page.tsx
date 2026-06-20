import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listWpsReadiness } from "@/server/actions/hr/payroll";
import { HrWpsPageClient } from "@/features/hr/payroll/wps/hr-wps-page-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HrWpsReadinessPage() {
  const authContext = await getAuthContext();
  const canView =
    hasPermission(authContext, "hr.payroll.view") ||
    authContext.roleCodes?.includes("system_admin");

  if (!canView) redirect("/admin");

  const result = await listWpsReadiness({ page: 1, page_size: 50 });
  const initialData = result.success && result.data
    ? result.data
    : { data: [], count: 0 };

  return <HrWpsPageClient initialData={initialData} />;
}
