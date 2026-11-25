import { redirect } from "next/navigation";
import { getAuthContext, hasGlobalPermission } from "@/lib/rbac/check";
import { ERPPageHeader } from "@/components/erp/page-header";
import { RiskScoresPageClient } from "@/features/ai/common/risk-scoring";
import { getRiskScoreSummary } from "@/server/actions/ai/common/risk-scoring";

export const metadata = {
  title: "AI Risk | ERP",
  description: "Review entity-level AI risk scores aggregated from DMS and COMMON AI signals",
};

type PageProps = {
  searchParams: Promise<{
    entityType?: string;
    entityId?: string;
  }>;
};

export default async function AiRiskPage({ searchParams }: PageProps) {
  const ctx = await getAuthContext();
  const canView =
    hasGlobalPermission(ctx, "ai.risk.view") ||
    hasGlobalPermission(ctx, "ai.common.admin");

  if (!canView) {
    redirect("/access-denied");
  }

  const params = await searchParams;
  const summaryResult = await getRiskScoreSummary();
  const defaultSummary = {
    critical: null,
    high: null,
    stale: null,
    unreviewed: null,
    featureEnabled: null,
  };

  const entityId = params.entityId ? Number(params.entityId) : undefined;

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="AI Risk Review"
        description="Review deterministic entity risk scores from DMS, compliance, duplicate, and conflict signals. No automatic block or status update."
        breadcrumbs={[
          { label: "Admin", href: "/dashboard" },
          { label: "AI Risk" },
        ]}
      />

      <RiskScoresPageClient
        summary={summaryResult.data ?? defaultSummary}
        initialEntityType={params.entityType}
        initialEntityId={entityId && !Number.isNaN(entityId) ? entityId : undefined}
      />
    </div>
  );
}
