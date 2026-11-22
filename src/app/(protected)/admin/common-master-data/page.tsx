import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ERPPageHeader } from "@/components/erp/page-header";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import Link from "next/link";
import { Building2, Briefcase, MapPin, Calendar, ShieldCheck, FileCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { verifiedHead } from "@/server/reads/verified-aggregate";

const tiles = [
  { table: "departments", href: "/admin/common-master-data/departments", icon: Building2, label: "Departments", desc: "Organizational units and reporting structure" },
  { table: "designations", href: "/admin/common-master-data/designations", icon: Briefcase, label: "Designations", desc: "Job titles and authority levels" },
  { table: "work_sites", href: "/admin/common-master-data/work-sites", icon: MapPin, label: "Work Sites", desc: "Operational locations and facilities" },
  { table: "work_calendars", href: "/admin/common-master-data/work-calendars", icon: Calendar, label: "Work Calendars", desc: "Shifts and working day configurations" },
  { table: "approval_roles", href: "/admin/common-master-data/approval-roles", icon: ShieldCheck, label: "Approval Roles", desc: "Authority levels and approval chains" },
  { table: "dms_required_document_rules", href: "/admin/common-master-data/dms-required-documents", icon: FileCheck, label: "Required Document Rules", desc: "DMS document compliance requirements" },
] as const;

export default async function CommonMasterDataPage() {
  const ctx = await getAuthContext();
  const canView = hasPermission(ctx, "common_md.view");

  const db = canView ? await createClient().catch(() => null) : null;
  const counts = await Promise.all(tiles.map(async ({ table }) => {
    if (!canView) return "Restricted";
    if (!db) return "Unavailable";
    try {
      const query = db.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null);
      const result = await verifiedHead(table === "work_sites" ? query.eq("status", "active") : query.eq("is_active", true));
      return result.count;
    } catch {
      return "Unavailable";
    }
  }));

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Common Master Data"
        description="Cross-module foundation data shared by all ERP modules"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Administration" },
          { label: "Common Master Data" },
        ]}
      />
      {counts.includes("Unavailable") && <p role="alert" className="text-sm text-muted-foreground">
        Some catalogue totals could not be loaded. <a href="/admin/common-master-data" className="text-primary underline">Try loading totals again</a>
      </p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiles.map((tile, i) => (
          <Link key={tile.href} href={tile.href}>
            <Card className="hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between mb-1">
                  <tile.icon className="h-5 w-5 text-muted-foreground" />
                  <span className="text-2xl font-bold text-foreground">{counts[i]}</span>
                </div>
                <CardTitle className="text-sm">{tile.label}</CardTitle>
                <CardDescription className="text-xs">{tile.desc}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
