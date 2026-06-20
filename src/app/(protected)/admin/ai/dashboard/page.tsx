import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getAiDailyDashboard, isAiDailyDashboardEnabled } from "@/server/actions/ai/common/dashboard";
import { AiDailyDashboardPageClient } from "@/features/ai/common/dashboard";

export const metadata = {
  title: "AI Daily Dashboard | ERP",
  description: "Read-only AI daily dashboard for existing ERP scope",
};

export default async function AiDailyDashboardPage() {
  const ctx = await getAuthContext();

  const canView =
    hasPermission(ctx, "ai.dashboard.view") ||
    hasPermission(ctx, "ai.dashboard.admin") ||
    hasPermission(ctx, "ai.common.view") ||
    hasPermission(ctx, "ai.common.admin") ||
    ctx.roleCodes.includes("system_admin");

  if (!canView) {
    redirect("/dashboard");
  }

  const enabled = await isAiDailyDashboardEnabled();

  if (!enabled) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-400">
        <p className="text-lg font-medium">AI Daily Dashboard is not enabled.</p>
        <p className="text-sm mt-1">
          Enable the <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-xs">ERP_AI_DAILY_DASHBOARD</code> feature flag in AI Settings to activate.
        </p>
      </div>
    );
  }

  const result = await getAiDailyDashboard({ scope: "today" });
  const initialData = result.success && result.data ? result.data : null;

  return <AiDailyDashboardPageClient initialData={initialData} />;
}
