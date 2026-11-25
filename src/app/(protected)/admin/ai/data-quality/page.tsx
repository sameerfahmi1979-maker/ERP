import { redirect } from "next/navigation";
import { getAuthContext, hasGlobalPermission, hasPermission } from "@/lib/rbac/check";
import {
  isDataQualityMonitorEnabled,
  getDataQualitySummary,
} from "@/server/actions/ai/common/data-quality";
import { AiDataQualityPageClient } from "@/features/ai/common/data-quality";
import type { DataQualityPermissionState } from "@/lib/ai/common/data-quality/types";
import {AiQualityPanel} from '@/features/ai/quality/ai-quality-panel';

export const metadata = {
  title: "AI Data Quality Monitor | ERP",
  description: "Deterministic data quality monitoring for existing ERP scope",
};

export default async function DataQualityPage() {
  const ctx = await getAuthContext();

  const canView =
    hasGlobalPermission(ctx, "ai.data_quality.view") ||
    hasGlobalPermission(ctx, "ai.common.view") ||
    hasGlobalPermission(ctx, "ai.common.admin");

  if (!canView) {
    redirect("/access-denied");
  }

  const canScan =
    hasPermission(ctx, "ai.data_quality.scan") ||
    hasPermission(ctx, "ai.common.admin") ||
    ctx.roleCodes.includes("system_admin");

  const canReview =
    hasPermission(ctx, "ai.data_quality.review") ||
    hasPermission(ctx, "ai.common.admin") ||
    ctx.roleCodes.includes("system_admin");

  const canAdmin =
    hasPermission(ctx, "ai.data_quality.admin") ||
    ctx.roleCodes.includes("system_admin");

  const permissions: DataQualityPermissionState = {
    canView,
    canScan,
    canReview,
    canAdmin,
  };

  const [isEnabled, summaryResult] = await Promise.all([
    isDataQualityMonitorEnabled(),
    getDataQualitySummary(),
  ]);

  const initialSummary = summaryResult.data ?? null;

  return (
    <><AiQualityPanel/>
      {summaryResult.error && <p role="status" className="text-sm text-muted-foreground">Data quality summary could not be loaded. Reload to try again.</p>}
      <AiDataQualityPageClient
      initialSummary={initialSummary}
      permissions={permissions}
      isEnabled={isEnabled}
    /></>
  );
}
