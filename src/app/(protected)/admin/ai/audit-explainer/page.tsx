import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getAuditExplainerOverview, isAuditExplainerEnabled } from "@/server/actions/ai/common/audit-explainer";
import { AuditExplainerPageClient } from "@/features/ai/common/audit-explainer";

export const metadata = {
  title: "AI Audit Trail Explainer | ERP",
  description: "AI-assisted plain-English explanation of ERP audit trail and AI activity",
};

export default async function AuditExplainerPage() {
  const ctx = await getAuthContext();

  const canView =
    hasPermission(ctx, "ai.audit_explainer.view") ||
    hasPermission(ctx, "ai.audit_explainer.use") ||
    hasPermission(ctx, "ai.audit_explainer.admin") ||
    hasPermission(ctx, "ai.common.view") ||
    hasPermission(ctx, "ai.common.admin") ||
    ctx.roleCodes.includes("system_admin");

  if (!canView) {
    redirect("/dashboard");
  }

  const canUseAi =
    hasPermission(ctx, "ai.audit_explainer.use") ||
    hasPermission(ctx, "ai.common.admin") ||
    ctx.roleCodes.includes("system_admin");

  const isEnabled = await isAuditExplainerEnabled();

  const overviewResult = await getAuditExplainerOverview({ scope: "today" });
  const initialTimeline =
    overviewResult.success && overviewResult.data ? overviewResult.data.timeline : [];

  return (
    <AuditExplainerPageClient
      initialTimeline={initialTimeline}
      canUseAi={canUseAi}
      isEnabled={isEnabled}
    />
  );
}
