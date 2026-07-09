import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listEmployees } from "@/server/actions/hr/employees";
import { EmployeesTable } from "@/features/hr/employees/employees-table";
import { ERPPageHeader } from "@/components/erp/page-header";
import { HrReportsMenu } from "@/components/erp/hr-reports-menu";
import { isHrAiFeatureEnabled } from "@/lib/hr/ai/feature-flags";

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

  const result = await listEmployees({ page: 1, pageSize: 25 });
  const rows = result.success && result.data ? result.data.rows : [];
  const totalCount = result.success && result.data ? result.data.totalCount : 0;

  const documentWizardEnabled = authContext.roleCodes?.includes("system_admin")
    ? true
    : await isHrAiFeatureEnabled("ERP_AI_HR_DOCUMENT_TO_EMPLOYEE");

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Employees"
        description="Manage employee master records. Search, filter, create, edit, and archive employees."
        breadcrumbs={[
          { label: "HR", href: "/admin/hr" },
          { label: "Employees" },
        ]}
        actions={
          <HrReportsMenu
            reports={[
              { reportCode: "HR_EMPLOYEE_LIST", label: "Employee List" },
              { reportCode: "HR_COMPLIANCE_EXPIRY", label: "Compliance Expiry" },
            ]}
          />
        }
      />

      <EmployeesTable
        initialRows={rows}
        initialTotal={totalCount}
        authContext={authContext}
        documentWizardEnabled={documentWizardEnabled}
      />
    </div>
  );
}
