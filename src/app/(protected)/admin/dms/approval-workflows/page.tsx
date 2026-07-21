import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ERPPageHeader } from "@/components/erp/page-header";
import { adminListApprovalWorkflows } from "@/server/actions/dms/document-approvals";
import { getDmsDocumentTypes } from "@/server/actions/dms/document-types";
import { DmsApprovalWorkflowsAdminPageClient } from "@/features/dms/approvals/admin/dms-approval-workflows-admin-page-client";

export const metadata = {
  title: "Approval Workflows | DMS Admin | ERP",
  description: "Configure DMS document approval workflows and approval steps.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DmsApprovalWorkflowsAdminPage() {
  const ctx = await getAuthContext();

  const canView =
    hasPermission(ctx, "dms.approvals.admin") ||
    hasPermission(ctx, "dms.admin") ||
    ctx.roleCodes.includes("system_admin");

  if (!canView) redirect("/access-denied");

  const [workflowsResult, docTypesResult] = await Promise.all([
    adminListApprovalWorkflows(),
    getDmsDocumentTypes({ is_active: true }),
  ]);

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Approval Workflows"
        description="Configure DMS document approval workflows and approval steps."
        breadcrumbs={[
          { label: "Admin", href: "/dashboard" },
          { label: "DMS Admin", href: "/admin/dms" },
          { label: "Approval Workflows" },
        ]}
      />

      <DmsApprovalWorkflowsAdminPageClient
        initialWorkflows={workflowsResult.data ?? []}
        documentTypes={docTypesResult.data ?? []}
      />
    </div>
  );
}
