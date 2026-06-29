import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { EmployeeWorkspaceForm } from "@/features/hr/employees/employee-workspace-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EmployeeNewPage() {
  const authContext = await getAuthContext();

  if (
    !hasPermission(authContext, "hr.employees.view") &&
    !authContext.roleCodes?.includes("system_admin")
  ) {
    redirect("/access-denied");
  }

  if (
    !hasPermission(authContext, "hr.employees.create") &&
    !authContext.roleCodes?.includes("system_admin")
  ) {
    redirect("/admin/hr/employees");
  }

  return (
    <div className="h-full">
      <EmployeeWorkspaceForm mode="add" authContext={authContext} />
    </div>
  );
}

