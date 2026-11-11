import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import {HrDashboardWorkspace} from '@/features/hr/dashboard/hr-dashboard-workspace';

export const metadata = { title: "HR Dashboard" };

export default async function HrDashboardPage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "hr.dashboard.view") && !hasPermission(ctx, "hr.employees.view")) {
    redirect("/admin/hr/employees");
  }

  // Match DMS: one identity-scoped read path, no second private SSR snapshot.
  return <HrDashboardWorkspace authContext={ctx}/>;
}
