import { redirect } from "next/navigation";
import { getAuthContext, hasGlobalPermission } from "@/lib/rbac/check";
import { getAuditExplainerOverview, isAuditExplainerEnabled } from "@/server/actions/ai/common/audit-explainer";
import { AuditExplainerPageClient } from "@/features/ai/common/audit-explainer";

export const metadata = {
  title: "AI Audit Trail Explainer | ERP",
  description: "AI-assisted plain-English explanation of ERP audit trail and AI activity",
};

export default async function AuditExplainerPage() {
  const ctx = await getAuthContext();

  const canView =
    hasGlobalPermission(ctx, "ai.audit_explainer.view") ||
    hasGlobalPermission(ctx, "ai.audit_explainer.use") ||
    hasGlobalPermission(ctx, "ai.audit_explainer.admin") ||
    hasGlobalPermission(ctx, "ai.common.view") ||
    hasGlobalPermission(ctx, "ai.common.admin");

  if (!canView) {
    redirect("/access-denied");
  }

  const canUseAi =
    hasGlobalPermission(ctx, "ai.audit_explainer.use") ||
    hasGlobalPermission(ctx, "ai.common.admin");

  const isEnabled = await isAuditExplainerEnabled();

  const overviewResult = await getAuditExplainerOverview({ scope: "today" });
  const initialTimeline =
    overviewResult.success && overviewResult.data ? overviewResult.data.timeline : [];

  return (
    <AuditExplainerPageClient
      initialTimeline={initialTimeline}
      initialUnavailableSources={overviewResult.data?.unavailableSources}
      initialReadFailed={!overviewResult.success}
      canUseAi={canUseAi}
      isEnabled={isEnabled}
    />
  );
}
