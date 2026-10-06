import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { ERPPageHeader } from "@/components/erp/page-header";
import { LoadError } from "@/components/erp/load-error";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { readDepartments } from "@/server/reads/departments";
import Link from "next/link";
import { DepartmentsListClient } from "@/features/common-master-data/departments/departments-list-client";

export default async function DepartmentsPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "common_md.view") && !hasPermission(ctx, "common_md.departments.view")) {
    redirect("/admin/common-master-data");
  }
  const canManage = hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.departments.manage");
  const result = await readDepartments({},ctx);
  if(!result.success)return <LoadError title="Departments" retryHref="/admin/common-master-data/departments" />;
  const departments = result.data ?? [];

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
      <DepartmentsListClient departments={departments} canManage={canManage} />
    </div>
  );
}
