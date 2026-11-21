import { getDmsAiObservabilityConfig } from "@/server/actions/dms/ai-observability";
import { DmsAiObservabilityPageClient } from "@/features/dms/ai-observability/dms-ai-observability-page-client";
import { LoadError } from "@/components/erp/load-error";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/rbac/check";
import { canViewDmsAiObservability } from "@/lib/ai/observability/access";

export const metadata = {
  title: "DMS AI Observability",
};

export default async function DmsAiObservabilityPage() {
  const ctx = await getAuthContext();
  if (!canViewDmsAiObservability(ctx)) redirect("/access-denied");

  const configResult = await getDmsAiObservabilityConfig();
  if (!configResult.success || !configResult.data) return <LoadError title="DMS AI observability" retryHref="/admin/dms/ai-observability" />;
  if (configResult.data.setupRequired) return (
    <div role="status" className="p-8 text-center text-muted-foreground">
      <h1 className="text-lg font-medium">DMS AI Observability setup required</h1>
      <p className="mt-1 text-sm">An administrator needs to complete the feature setup.</p>
    </div>
  );
  return <DmsAiObservabilityPageClient config={configResult.data} />;
}
