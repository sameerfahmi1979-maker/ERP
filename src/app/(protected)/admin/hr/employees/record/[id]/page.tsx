import { redirect, notFound } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getEmployee } from "@/server/actions/hr/employees";
import { EmployeeWorkspaceForm } from "@/features/hr/employees/employee-workspace-form";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface EmployeeRecordPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}

export default async function EmployeeRecordPage({
  params,
  searchParams,
}: EmployeeRecordPageProps) {
  const { id: idStr } = await params;
  const { mode: modeParam } = await searchParams;

  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    notFound();
  }

  const authContext = await getAuthContext();

  if (
    !hasPermission(authContext, "hr.employees.view") &&
    !authContext.roleCodes?.includes("system_admin")
  ) {
    redirect("/access-denied");
  }

  const result = await getEmployee(id);

  if (!result.success || !result.data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <p className="text-lg font-medium">Employee not found</p>
        <p className="text-sm">
          The employee with ID {idStr} does not exist or you do not have permission to view it.
        </p>
        <Link href="/admin/hr/employees" className="text-sm underline text-primary">
          Back to All Employees
        </Link>
      </div>
    );
  }

  const canEdit =
    hasPermission(authContext, "hr.employees.update") ||
    authContext.roleCodes?.includes("system_admin");

  let mode: "view" | "edit" = "view";
  if (modeParam === "edit" && canEdit) {
    mode = "edit";
  } else if (modeParam === "edit" && !canEdit) {
    mode = "view";
  } else if (modeParam === "view") {
    mode = "view";
  }

  return (
    <div className="h-full">
      <EmployeeWorkspaceForm
        employee={result.data}
        mode={mode}
        authContext={authContext}
      />
    </div>
  );
}
