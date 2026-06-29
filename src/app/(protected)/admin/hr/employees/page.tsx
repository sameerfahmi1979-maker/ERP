import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listEmployees } from "@/server/actions/hr/employees";
import { EmployeesTable } from "@/features/hr/employees/employees-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";
import { HrReportsMenu } from "@/components/erp/hr-reports-menu";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EmployeesPage() {
  const authContext = await getAuthContext();

  if (
    !hasPermission(authContext, "hr.employees.view") &&
    !authContext.roleCodes?.includes("system_admin")
  ) {
    redirect("/access-denied");
  }

  const result = await listEmployees({ page: 1, pageSize: 50 });
  const rows = result.success && result.data ? result.data.rows : [];
  const totalCount = result.success && result.data ? result.data.totalCount : 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Employees</CardTitle>
                <CardDescription>
                  Manage employee master records. Search, filter, create, edit, and archive employees.
                </CardDescription>
              </div>
            </div>
            <HrReportsMenu reports={[
              { reportCode: "HR_EMPLOYEE_LIST", label: "Employee List" },
              { reportCode: "HR_COMPLIANCE_EXPIRY", label: "Compliance Expiry" },
            ]} />
          </div>
        </CardHeader>
        <CardContent>
          <EmployeesTable
            initialRows={rows}
            initialTotal={totalCount}
            authContext={authContext}
          />
        </CardContent>
      </Card>
    </div>
  );
}
