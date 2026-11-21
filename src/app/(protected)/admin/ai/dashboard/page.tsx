import { redirect } from "next/navigation";
import { LoadError } from "@/components/erp/load-error";
import { getAuthContext } from "@/lib/rbac/check";
import { canViewAiDailyDashboard } from "@/lib/ai/observability/access";
import { getAiDailyDashboard, getAiDailyDashboardAvailability } from "@/server/actions/ai/common/dashboard";
import { AiDailyDashboardPageClient } from "@/features/ai/common/dashboard";

export const metadata = {
  title: "AI Daily Dashboard | ERP",
  description: "Read-only AI daily dashboard for existing ERP scope",
};

export default async function AiDailyDashboardPage() {
  const ctx = await getAuthContext();

  if (!canViewAiDailyDashboard(ctx)) {
    redirect("/access-denied");
  }

  const availability = await getAiDailyDashboardAvailability();
  if (availability === "unavailable") return <LoadError title="AI dashboard availability" retryHref="/admin/ai/dashboard" />;
  if (availability !== "enabled") {
    return (
      <div role="status" className="p-8 text-center text-muted-foreground">
        <h1 className="text-lg font-medium">{availability === "setup_required" ? "AI Daily Dashboard setup required" : "AI Daily Dashboard is disabled"}</h1>
        <p className="mt-1 text-sm">{availability === "setup_required"
          ? "An administrator needs to complete the feature setup."
          : "An administrator can review this feature in AI Settings."}</p>
      </div>
    );
  }

  const result = await getAiDailyDashboard({ scope: "today" });
  if (!result.success || !result.data) return <LoadError title="AI dashboard" retryHref="/admin/ai/dashboard" />;
  const initialData = result.success && result.data ? result.data : null;

  return <AiDailyDashboardPageClient initialData={initialData} />;
}
