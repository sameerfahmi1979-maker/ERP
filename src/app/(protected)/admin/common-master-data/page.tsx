import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ERPPageHeader } from "@/components/erp/page-header";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import Link from "next/link";
import { Building2, Briefcase, MapPin, Calendar, ShieldCheck, FileCheck } from "lucide-react";
import { listDepartments } from "@/server/actions/common-master-data/departments";
import { listDesignations } from "@/server/actions/common-master-data/designations";
import { listWorkSites } from "@/server/actions/common-master-data/work-sites";
import { listWorkCalendars } from "@/server/actions/common-master-data/work-calendars";
import { listApprovalRoles } from "@/server/actions/common-master-data/approval-roles";
import { listDmsRequiredDocumentRules } from "@/server/actions/common-master-data/dms-required-document-rules";

const tiles = [
  { href: "/admin/common-master-data/departments", icon: Building2, label: "Departments", desc: "Organizational units and reporting structure" },
  { href: "/admin/common-master-data/designations", icon: Briefcase, label: "Designations", desc: "Job titles and authority levels" },
  { href: "/admin/common-master-data/work-sites", icon: MapPin, label: "Work Sites", desc: "Operational locations and facilities" },
  { href: "/admin/common-master-data/work-calendars", icon: Calendar, label: "Work Calendars", desc: "Shifts and working day configurations" },
  { href: "/admin/common-master-data/approval-roles", icon: ShieldCheck, label: "Approval Roles", desc: "Authority levels and approval chains" },
  { href: "/admin/common-master-data/dms-required-documents", icon: FileCheck, label: "Required Document Rules", desc: "DMS document compliance requirements" },
];

export default async function CommonMasterDataPage() {
  const ctx = await getAuthContext();
  const canView = hasPermission(ctx, "common_md.view");

  const [depts, desigs, sites, cals, roles, rules] = await Promise.all([
    canView ? listDepartments({ is_active: true }) : Promise.resolve({ data: [] }),
    canView ? listDesignations({ is_active: true }) : Promise.resolve({ data: [] }),
    canView ? listWorkSites({ status: "active" }) : Promise.resolve({ data: [] }),
    canView ? listWorkCalendars({ is_active: true }) : Promise.resolve({ data: [] }),
    canView ? listApprovalRoles({ is_active: true }) : Promise.resolve({ data: [] }),
    canView ? listDmsRequiredDocumentRules({ is_active: true }) : Promise.resolve({ data: [] }),
  ]);

  const counts = [depts.data?.length ?? 0, desigs.data?.length ?? 0, sites.data?.length ?? 0, cals.data?.length ?? 0, roles.data?.length ?? 0, rules.data?.length ?? 0];

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
