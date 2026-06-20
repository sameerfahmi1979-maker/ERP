import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { HrDashboardPageClient } from "@/features/hr/dashboard/hr-dashboard-page-client";
import type { HrDashboardPermissions } from "@/features/hr/dashboard/hr-dashboard-page-client";

export const metadata = { title: "HR Dashboard" };

export default async function HrDashboardPage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "hr.dashboard.view") && !hasPermission(ctx, "hr.employees.view")) {
    redirect("/admin/hr/employees");
  }

  const permissions: HrDashboardPermissions = {
    canViewEmployees: hasPermission(ctx, "hr.employees.view"),
    canViewCompliance: hasPermission(ctx, "hr.compliance.view"),
    canViewMedical: hasPermission(ctx, "hr.medical.view"),
    canViewAttendance: hasPermission(ctx, "hr.attendance.view"),
    canViewLeave: hasPermission(ctx, "hr.leave.view"),
    canViewPayroll: hasPermission(ctx, "hr.payroll.view"),
    canViewAssignments: hasPermission(ctx, "hr.assignments.view"),
    canViewActions: hasPermission(ctx, "hr.actions.view"),
    canViewEos: hasPermission(ctx, "hr.eos.view"),
    canViewRecruitment: hasPermission(ctx, "hr.recruitment.view"),
  };

  return <HrDashboardPageClient permissions={permissions} />;
}
