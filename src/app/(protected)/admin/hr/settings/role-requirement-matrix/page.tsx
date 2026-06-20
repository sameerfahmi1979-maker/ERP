import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrRoleRequirementMatrix } from "@/server/actions/hr/settings";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPSectionCard } from "@/components/erp/section-card";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { Badge } from "@/components/ui/badge";
import { Grid3X3 } from "lucide-react";

export default async function HrRoleRequirementMatrixPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const result = await listHrRoleRequirementMatrix({ page_size: 100 });
  const rows = result.data?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <ERPPageHeader
        title="Role Requirement Matrix"
        description="Maps employee categories and designations to required compliance readiness rules"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR Settings", href: "/admin/hr/settings" }, { label: "Role Requirement Matrix" }]}
      />
      <ERPSectionCard title="Requirement Mappings" description={`${rows.length} mapping${rows.length !== 1 ? "s" : ""}`} noPadding>
        {rows.length === 0 ? (
          <ERPEmptyState icon={Grid3X3} title="No role requirement mappings" description="Mappings link employee categories to required readiness rules." />
        ) : (
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm">Readiness Rule #{row.readiness_rule_template_id}</span>
                  {row.employee_category_id && <Badge variant="secondary" className="text-[10px]">Category #{row.employee_category_id}</Badge>}
                  {!row.is_active && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                  <Badge variant={row.is_required ? "destructive" : "outline"} className="text-[10px]">{row.is_required ? "Required" : "Optional"}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </ERPSectionCard>
    </div>
  );
}
