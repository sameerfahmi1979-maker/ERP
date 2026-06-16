import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPSectionCard } from "@/components/erp/section-card";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Building2, Plus } from "lucide-react";
import { listDepartments } from "@/server/actions/common-master-data/departments";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export default async function DepartmentsPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "common_md.view") && !hasPermission(ctx, "common_md.departments.view")) {
    redirect("/admin/common-master-data");
  }
  const canManage = hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.departments.manage");
  const result = await listDepartments({});
  const departments = result.data ?? [];

  return (
    <div className="flex flex-col gap-6">
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
      <ERPSectionCard title="All Departments" description="Departments across all organizations" noPadding
        actions={<span className="text-xs text-muted-foreground">{departments.length} total</span>}
      >
        {departments.length === 0 ? (
          <ERPEmptyState icon={Building2} title="No departments yet" description="Create your first department." />
        ) : (
          <div className="divide-y">
            {departments.map((d) => (
              <Link key={d.id} href={`/admin/common-master-data/departments/record/${d.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {d.department_name_en}
                    <span className="text-xs text-muted-foreground">({d.department_code})</span>
                    {!d.is_active && <Badge variant="destructive" className="text-[10px]">Inactive</Badge>}
                  </div>
                  {d.owner_company && <p className="text-xs text-muted-foreground">{(d.owner_company as {legal_name_en: string}).legal_name_en}</p>}
                </div>
                <span className="text-xs text-muted-foreground">→</span>
              </Link>
            ))}
          </div>
        )}
      </ERPSectionCard>
    </div>
  );
}
