import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { ERPPageHeader } from "@/components/erp/page-header";
import { LoadError } from "@/components/erp/load-error";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { listDepartments } from "@/server/actions/common-master-data/departments";
import Link from "next/link";
import { DepartmentsListClient } from "@/features/common-master-data/departments/departments-list-client";
import {readDepartmentScopeCatalogue} from '@/server/department-scope-catalogue';

export default async function DepartmentsPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "common_md.view") && !hasPermission(ctx, "common_md.departments.view")) {
    redirect("/admin/common-master-data");
  }
  const canManage = hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.departments.manage");
  const result = await listDepartments({});
  const scope = result.success ? await readDepartmentScopeCatalogue() : null;
  // This label-only projection does not grant company/branch record access or
  // replace the shared Department read, search, pagination or cache contract.
  const companies = new Map(scope?.success ? scope.data.companies.map(c => [c.id, c]) : []);
  const branches = new Map(scope?.success ? scope.data.branches.map(b => [b.id, b]) : []);
  const departments = (result.data ?? []).map(department => {
    const branch = department.branch_id === null ? undefined : branches.get(department.branch_id);
    return {...department,
      owner_company: companies.get(department.owner_company_id) ?? department.owner_company,
      branch: branch?.owner_company_id === department.owner_company_id ? branch : department.branch,
    };
  });

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Departments"
        description="Organizational departments and reporting structure"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Common Master Data", href: "/admin/common-master-data" },
          { label: "Departments" },
        ]}
        actions={canManage ? (
          <Link href="/admin/common-master-data/departments/record/new">
            <Button size="sm"><Plus className="h-4 w-4 mr-1" />Add Department</Button>
          </Link>
        ) : null}
      />
      {!result.success ? <LoadError title="Departments" retryHref="/admin/common-master-data/departments" /> : !scope?.success ? <LoadError title="Department organizations and branches" retryHref="/admin/common-master-data/departments" /> :
        <DepartmentsListClient departments={departments} canManage={canManage} authContext={ctx} />}
    </div>
  );
}
