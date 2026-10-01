import { LoadError } from "@/components/erp/load-error";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { listHrApprovalWorkflows } from "@/server/actions/hr/settings";
import { ERPPageHeader } from "@/components/erp/page-header";
import { HrApprovalWorkflowsList } from "@/features/hr/settings/hr-approval-workflows-list";

export default async function HrApprovalWorkflowsPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.settings.view") && !hasPermission(ctx, "hr.settings.manage") && !hasPermission(ctx, "hr.admin")) redirect("/admin/hr/settings");
  const result = await listHrApprovalWorkflows({ page_size: 100 });
  if (!result.success) return <LoadError title="HR records" retryHref="/admin/hr/settings/approval-workflows" />;
  const rows = result.data?.data ?? [];


  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Approval Workflows"
        description="Multi-step approval chains for leave, payroll changes, and PRO processes"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR Settings", href: "/admin/hr/settings" }, { label: "Approval Workflows" }]}
      />
      <HrApprovalWorkflowsList rows={rows} />
    </div>
  );
}
