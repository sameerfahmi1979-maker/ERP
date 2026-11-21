import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { canBrowseEmployees } from "@/lib/rbac/employee-access";

const HR_LANDING_ROUTES = [
  ["hr.actions.view", "/admin/hr/actions/pro"],
  ["hr.attendance.view", "/admin/hr/time/attendance"],
  ["hr.recruitment.view", "/admin/hr/recruitment/requisitions"],
  ["hr.recruitment.manage", "/admin/hr/recruitment/requisitions"],
  ["hr.leave.view", "/admin/hr/time/leave"],
  ["hr.eos.view", "/admin/hr/actions/eos"],
  ["hr.assignments.view", "/admin/hr/operations/assignments"],
] as const;

/**
 * ERP USERS.4 — HR module entry point.
 * Redirects to the first HR sub-page the user can access.
 * Without this, navigating to /admin/hr produces a 404.
 */
export default async function HrIndexPage() {
  const ctx = await getAuthContext();

  if (hasPermission(ctx, "hr.dashboard.view")) {
    redirect("/admin/hr/dashboard");
  }

  if (canBrowseEmployees(ctx)) {
    redirect("/admin/hr/employees");
  }

  for (const [permission, route] of HR_LANDING_ROUTES) {
    if (hasPermission(ctx, permission)) redirect(route);
  }

  redirect("/access-denied");
}
