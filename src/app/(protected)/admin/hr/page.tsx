import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";

/**
 * ERP USERS.4 — HR module entry point.
 * Redirects to the first HR sub-page the user can access.
 * Without this, navigating to /admin/hr produces a 404.
 */
export default async function HrIndexPage() {
  const ctx = await getAuthContext();

  // Redirect to the most appropriate HR page for this user
  if (hasPermission(ctx, "hr.dashboard.view")) {
    redirect("/admin/hr/dashboard");
  }

  if (hasPermission(ctx, "hr.employees.view")) {
    redirect("/admin/hr/employees");
  }

  if (hasPermission(ctx, "hr.actions.view") || hasPermission(ctx, "hr.actions.manage")) {
    redirect("/admin/hr/actions/pro");
  }

  if (hasPermission(ctx, "hr.attendance.view") || hasPermission(ctx, "hr.attendance.manage")) {
    redirect("/admin/hr/time/attendance");
  }

  if (hasPermission(ctx, "hr.recruitment.view") || hasPermission(ctx, "hr.recruitment.manage")) {
    redirect("/admin/hr/recruitment/requisitions");
  }

  // User has some HR access but not to specific sub-modules — send to employees as safe fallback
  if (ctx.roleCodes.includes("hr_manager") || ctx.roleCodes.includes("hr_admin")) {
    redirect("/admin/hr/employees");
  }

  // No HR access at all
  redirect("/access-denied");
}
