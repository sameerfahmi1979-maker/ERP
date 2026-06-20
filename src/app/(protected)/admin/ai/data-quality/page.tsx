import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import {
  isDataQualityMonitorEnabled,
  getDataQualitySummary,
} from "@/server/actions/ai/common/data-quality";
import { AiDataQualityPageClient } from "@/features/ai/common/data-quality";
import type { DataQualityPermissionState } from "@/lib/ai/common/data-quality/types";

export const metadata = {
  title: "AI Data Quality Monitor | ERP",
  description: "Deterministic data quality monitoring for existing ERP scope",
};

export default async function DataQualityPage() {
  const ctx = await getAuthContext();

  const canView =
    hasPermission(ctx, "ai.data_quality.view") ||
    hasPermission(ctx, "ai.common.view") ||
    hasPermission(ctx, "ai.common.admin") ||
    ctx.roleCodes.includes("system_admin");

  if (!canView) {
    redirect("/dashboard");
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
    <AiDataQualityPageClient
      initialSummary={initialSummary}
      permissions={permissions}
      isEnabled={isEnabled}
    />
  );
}
