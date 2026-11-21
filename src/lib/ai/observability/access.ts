import type { AuthContext } from "@/lib/rbac/check";
import { hasGlobalPermission } from "@/lib/rbac/scope";

export const aiDailyDashboardViewPermissions = [
  "ai.dashboard.view",
  "ai.dashboard.admin",
  "ai.common.view",
  "ai.common.admin",
] as const;

export const dmsAiObservabilityViewPermissions = [
  "dms.ai_observability.view",
  "dms.ai_observability.admin",
  "dms.admin",
  "settings.ai.view",
  "settings.ai.manage",
] as const;

export function canViewAiDailyDashboard(ctx: AuthContext): boolean {
  return aiDailyDashboardViewPermissions.some(code => hasGlobalPermission(ctx, code));
}

export function canViewDmsAiObservability(ctx: AuthContext): boolean {
  return dmsAiObservabilityViewPermissions.some(code => hasGlobalPermission(ctx, code));
}
