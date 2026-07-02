import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ERPPageHeader } from "@/components/erp/page-header";
import { HrSearchPageClient } from "@/features/hr/search";
import type { HrSearchPermissions } from "@/features/hr/search";

export const metadata = {
  title: "HR Search — ALGT ERP",
};

export default async function HrSearchPage() {
  const ctx = await getAuthContext();

  const canEmployees = hasPermission(ctx, "hr.employees.view");
  const canRecruitment = hasPermission(ctx, "hr.recruitment.view");
  const canCompliance = hasPermission(ctx, "hr.compliance.view");
  const canTime =
    hasPermission(ctx, "hr.attendance.view") || hasPermission(ctx, "hr.leave.view");
  const canPayroll = hasPermission(ctx, "hr.payroll.view");
  const canOperations = hasPermission(ctx, "hr.assignments.view");
  const canActions = hasPermission(ctx, "hr.actions.view");

  const hasAnyAccess =
    canEmployees || canRecruitment || canCompliance || canTime ||
    canPayroll || canOperations || canActions;

  if (!hasAnyAccess) {
    redirect("/admin/hr");
  }

  const canAiUse = hasPermission(ctx, "hr.ai.use");

  const permissions: HrSearchPermissions = {
    canEmployees,
    canRecruitment,
    canCompliance,
    canTime,
    canPayroll,
    canOperations,
    canActions,
    canAiUse,
  };

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="HR Search"
        description="Search across employees, candidates, compliance, time, payroll, operations, and HR actions."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "HR" },
          { label: "HR Search" },
        ]}
      />
      <HrSearchPageClient permissions={permissions} />
    </div>
  );
}
