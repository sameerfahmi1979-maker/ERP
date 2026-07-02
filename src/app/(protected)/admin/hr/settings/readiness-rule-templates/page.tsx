import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrReadinessRuleTemplates } from "@/server/actions/hr/settings";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { Badge } from "@/components/ui/badge";
import { CheckSquare } from "lucide-react";

export default async function HrReadinessRuleTemplatesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const result = await listHrReadinessRuleTemplates({ page_size: 100 });
  const rows = result.data?.data ?? [];

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Readiness Rule Templates"
        description="Master template rules defining which documents, training, or access cards employees require"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR Settings", href: "/admin/hr/settings" }, { label: "Readiness Rule Templates" }]}
      />
      {rows.length === 0 ? (
        <ERPEmptyState icon={CheckSquare} title="No readiness rules configured" description="Readiness rules define mandatory compliance requirements for employees." />
      ) : (
        <div className="rounded-md border overflow-hidden">
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.id} className="flex items-start justify-between px-4 py-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{row.rule_name_en}</span>
                    <Badge variant="outline" className="text-[10px] font-mono">{row.rule_code}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{row.readiness_dimension}</Badge>
                    {row.is_critical && <Badge variant="destructive" className="text-[10px]">Critical</Badge>}
                    {!row.is_active && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{row.requirement_type} · Alert {row.expiry_buffer_days}d before expiry</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
