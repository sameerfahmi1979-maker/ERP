import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPSectionCard } from "@/components/erp/section-card";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Plus } from "lucide-react";
import { listDesignations } from "@/server/actions/common-master-data/designations";
import Link from "next/link";

export default async function DesignationsPage() {
  const ctx = await getAuthContext();
  const canManage = hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.designations.manage");
  const result = await listDesignations({});
  const designations = result.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <ERPPageHeader
        title="Designations"
        description="Job titles and authority levels"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Common Master Data", href: "/admin/common-master-data" },
          { label: "Designations" },
        ]}
        actions={canManage ? <Link href="/admin/common-master-data/designations/record/new"><Button size="sm"><Plus className="h-4 w-4 mr-1" />Add Designation</Button></Link> : null}
      />
      <ERPSectionCard title="All Designations" noPadding actions={<span className="text-xs text-muted-foreground">{designations.length} total</span>}>
        {designations.length === 0 ? <ERPEmptyState icon={Briefcase} title="No designations yet" description="Create your first job title." /> : (
          <div className="divide-y">
            {designations.map(d => (
              <Link key={d.id} href={`/admin/common-master-data/designations/record/${d.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {d.designation_name_en}
                    <span className="text-xs text-muted-foreground">({d.designation_code})</span>
                    {!d.is_active && <Badge variant="destructive" className="text-[10px]">Inactive</Badge>}
                    {d.management_level && <Badge variant="outline" className="text-[10px]">{d.management_level}</Badge>}
                  </div>
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
