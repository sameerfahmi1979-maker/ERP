import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrApprovalWorkflows } from "@/server/actions/hr/settings";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { Badge } from "@/components/ui/badge";
import { GitBranch } from "lucide-react";

export default async function HrApprovalWorkflowsPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const result = await listHrApprovalWorkflows({ page_size: 100 });
  const rows = result.data?.data ?? [];

  const grouped = rows.reduce<Record<string, typeof rows>>((acc, row) => {
    const key = row.workflow_code;
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Approval Workflows"
        description="Multi-step approval chains for leave, payroll changes, and PRO processes"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR Settings", href: "/admin/hr/settings" }, { label: "Approval Workflows" }]}
      />
      {rows.length === 0 ? (
        <ERPEmptyState icon={GitBranch} title="No approval workflows configured" description="Approval workflows define who must approve leave and payroll changes." />
      ) : (
        <div className="rounded-md border overflow-hidden">
          <div className="divide-y">
            {Object.entries(grouped).map(([code, steps]) => (
              <div key={code} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium">{steps[0]?.workflow_name_en}</span>
                  <Badge variant="outline" className="text-[10px] font-mono">{code}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{steps[0]?.workflow_type}</Badge>
                  {!steps[0]?.is_active && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                </div>
                <div className="flex flex-wrap gap-1.5 ml-2">
                  {steps.sort((a, b) => a.approval_step - b.approval_step).map(step => (
                    <div key={step.id} className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono font-medium">Step {step.approval_step}</span>
                      {step.sla_hours && <span>{step.sla_hours}h SLA</span>}
                      {step.is_required && <span className="text-destructive">required</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
