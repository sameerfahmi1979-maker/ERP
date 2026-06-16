import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPSectionCard } from "@/components/erp/section-card";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Plus } from "lucide-react";
import { listWorkSites } from "@/server/actions/common-master-data/work-sites";
import Link from "next/link";

export default async function WorkSitesPage() {
  const ctx = await getAuthContext();
  const canManage = hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.work_sites.manage");
  const result = await listWorkSites({});
  const sites = result.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <ERPPageHeader
        title="Work Sites"
        description="Operational locations, yards, workshops, and facilities"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Common Master Data", href: "/admin/common-master-data" },
          { label: "Work Sites" },
        ]}
        actions={canManage ? <Link href="/admin/common-master-data/work-sites/record/new"><Button size="sm"><Plus className="h-4 w-4 mr-1" />Add Work Site</Button></Link> : null}
      />
      <ERPSectionCard title="All Work Sites" noPadding actions={<span className="text-xs text-muted-foreground">{sites.length} total</span>}>
        {sites.length === 0 ? <ERPEmptyState icon={MapPin} title="No work sites yet" description="Create your first work site." /> : (
          <div className="divide-y">
            {sites.map(s => (
              <Link key={s.id} href={`/admin/common-master-data/work-sites/record/${s.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {s.site_name}
                    <span className="text-xs text-muted-foreground">({s.site_code})</span>
                    <Badge variant="outline" className="text-[10px]">{s.site_type}</Badge>
                    {s.status !== "active" && <Badge variant="destructive" className="text-[10px]">{s.status}</Badge>}
                  </div>
                  {s.owner_company && <p className="text-xs text-muted-foreground">{(s.owner_company as {legal_name_en: string}).legal_name_en}</p>}
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
