import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrSiteRequirementMatrix } from "@/server/actions/hr/settings";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPSectionCard } from "@/components/erp/section-card";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { Badge } from "@/components/ui/badge";
import { Map } from "lucide-react";

export default async function HrSiteRequirementMatrixPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const result = await listHrSiteRequirementMatrix({ page_size: 100 });
  const rows = result.data?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <ERPPageHeader
        title="Site Requirement Matrix"
        description="Defines access card and training requirements per work site"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR Settings", href: "/admin/hr/settings" }, { label: "Site Requirement Matrix" }]}
      />
      <ERPSectionCard title="Site Mappings" description={`${rows.length} mapping${rows.length !== 1 ? "s" : ""}`} noPadding>
        {rows.length === 0 ? (
          <ERPEmptyState icon={Map} title="No site requirement mappings" description="Mappings define which access cards and training are required at each work site." />
        ) : (
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {row.work_site_id && <span className="text-sm">Site #{row.work_site_id}</span>}
                  {row.access_card_type_id && <Badge variant="secondary" className="text-[10px]">Access Card #{row.access_card_type_id}</Badge>}
                  {row.training_type_id && <Badge variant="secondary" className="text-[10px]">Training #{row.training_type_id}</Badge>}
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
