import { redirect } from "next/navigation";
import { getAuthContext, hasGlobalPermission } from "@/lib/rbac/check";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ComplianceFindingsPageClient } from "@/features/ai/common/compliance-checker";
import { getComplianceFindingSummary } from "@/server/actions/ai/common/compliance-checker";

export const metadata = {
  title: "AI Compliance | ERP",
  description: "Review AI compliance findings for entities and linked DMS documents",
};

type PageProps = {
  searchParams: Promise<{
    entityType?: string;
    entityId?: string;
  }>;
};

export default async function AiCompliancePage({ searchParams }: PageProps) {
  const ctx = await getAuthContext();
  const canView =
    hasGlobalPermission(ctx, "ai.compliance.view") ||
    hasGlobalPermission(ctx, "ai.common.admin");

  if (!canView) {
    redirect("/access-denied");
  }

  const params = await searchParams;
  const summaryResult = await getComplianceFindingSummary();
  const defaultSummary = {
    open: null,
    critical: null,
    high: null,
    waivedResolved: null,
    featureEnabled: null,
  };

  const entityId = params.entityId ? Number(params.entityId) : undefined;

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="AI Compliance Review"
        description="Review compliance findings for required documents, expiry, risk, and cross-AI conflicts. No automatic fix or waive."
        breadcrumbs={[
          { label: "Admin", href: "/dashboard" },
          { label: "AI Compliance" },
        ]}
      />

      <ComplianceFindingsPageClient
        summary={summaryResult.data ?? defaultSummary}
        initialEntityType={params.entityType}
        initialEntityId={entityId && !Number.isNaN(entityId) ? entityId : undefined}
      />
    </div>
  );
}
