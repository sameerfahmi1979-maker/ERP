import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ERPPageHeader } from "@/components/erp/page-header";
import { DmsApprovalsQueuePageClient } from "@/features/dms/approvals/dms-approvals-queue-page-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DmsApprovalsQueuePage() {
  const ctx = await getAuthContext();

  const canView =
    hasPermission(ctx, "dms.approvals.view") ||
    hasPermission(ctx, "dms.approvals.act") ||
    hasPermission(ctx, "dms.approvals.submit") ||
    hasPermission(ctx, "dms.approvals.withdraw") ||
    hasPermission(ctx, "dms.approvals.admin") ||
    hasPermission(ctx, "dms.approvals.history.view") ||
    hasPermission(ctx, "dms.documents.approve") ||
    hasPermission(ctx, "dms.admin") ||
    ctx.roleCodes.includes("system_admin");

  if (!canView) redirect("/access-denied");

  const canAct =
    hasPermission(ctx, "dms.approvals.act") ||
    hasPermission(ctx, "dms.documents.approve") ||
    hasPermission(ctx, "dms.admin") ||
    ctx.roleCodes.includes("system_admin");

  const isAdmin =
    hasPermission(ctx, "dms.approvals.admin") ||
    hasPermission(ctx, "dms.admin") ||
    ctx.roleCodes.includes("system_admin");

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="DMS Approval Queue"
        description="Review pending document approvals and track your submissions."
        breadcrumbs={[{ label: "DMS", href: "/dms" }, { label: "Approval Queue" }]}
      />
      <DmsApprovalsQueuePageClient canAct={canAct} isAdmin={isAdmin} />
    </div>
  );
}
