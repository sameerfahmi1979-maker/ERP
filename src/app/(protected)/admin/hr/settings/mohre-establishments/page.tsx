import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrMohreEstablishments } from "@/server/actions/hr/settings";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPSectionCard } from "@/components/erp/section-card";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { Badge } from "@/components/ui/badge";
import { Building } from "lucide-react";

export default async function HrMohreEstablishmentsPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const result = await listHrMohreEstablishments({});
  const rows = result.data?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <ERPPageHeader
        title="MOHRE Establishments"
        description="Ministry of Human Resources & Emiratisation registered establishment numbers per company"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR Settings", href: "/admin/hr/settings" }, { label: "MOHRE Establishments" }]}
      />
      <ERPSectionCard title="Registered Establishments" description={`${rows.length} establishment${rows.length !== 1 ? "s" : ""}`} noPadding>
        {rows.length === 0 ? (
          <ERPEmptyState icon={Building} title="No MOHRE establishments configured" description="Contact your HR administrator to configure MOHRE establishment numbers." />
        ) : (
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{row.establishment_name}</span>
                    <Badge variant="outline" className="text-[10px] font-mono">{row.establishment_number}</Badge>
                    <Badge variant={row.status === "active" ? "secondary" : "destructive"} className="text-[10px]">{row.status}</Badge>
                  </div>
                  {row.owner_company && (
                    <p className="text-xs text-muted-foreground">{(row.owner_company as { legal_name_en: string }).legal_name_en}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ERPSectionCard>
    </div>
  );
}
