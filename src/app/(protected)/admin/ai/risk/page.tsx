import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
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
    hasPermission(ctx, "ai.risk.view") ||
    hasPermission(ctx, "ai.common.admin") ||
    ctx.roleCodes.includes("system_admin");

  if (!canView) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const summaryResult = await getRiskScoreSummary();
  const defaultSummary = {
    critical: 0,
    high: 0,
    stale: 0,
    unreviewed: 0,
    featureEnabled: false,
  };

  const entityId = params.entityId ? Number(params.entityId) : undefined;

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
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
