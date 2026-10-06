import { LoadError } from "@/components/erp/load-error";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/rbac/check";
import { canBrowseEmployees } from "@/lib/rbac/employee-access";
import { readEmployees } from "@/server/reads/employees";
import { EmployeesTable } from "@/features/hr/employees/employees-table";
import { ERPPageHeader } from "@/components/erp/page-header";
import { HrReportsMenu } from "@/components/erp/hr-reports-menu";
import { isHrAiFeatureEnabled } from "@/lib/hr/ai/feature-flags";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EmployeesPage() {
  const authContext = await getAuthContext();

  if (
    !canBrowseEmployees(authContext)
  ) {
    redirect("/access-denied");
  }

  const result = await readEmployees({ page: 1, pageSize: 25 }, authContext);
  if (!result.success) return <LoadError title="HR records" retryHref="/admin/hr/employees" />;
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
        initialUpdatedAt={result.data?.updatedAt??0}
        authContext={authContext}
        documentWizardEnabled={documentWizardEnabled}
      />
    </div>
  );
}
