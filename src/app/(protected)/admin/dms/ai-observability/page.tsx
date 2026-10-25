import { getDmsAiObservabilityConfig } from "@/server/actions/dms/ai-observability";
import { DmsAiObservabilityPageClient } from "@/features/dms/ai-observability/dms-ai-observability-page-client";
import { LoadError } from "@/components/erp/load-error";

export const metadata = {
  title: "DMS AI Observability",
};

export default async function DmsAiObservabilityPage() {
  const configResult = await getDmsAiObservabilityConfig();
  if (!configResult.success || !configResult.data) return <LoadError title="DMS AI observability" retryHref="/admin/dms/ai-observability" />;
  const config = configResult.data ?? {
    featureFlagEnabled: false,
    hasViewPermission: false,
    hasAdminPermission: false,
  };

  return <DmsAiObservabilityPageClient config={config} />;
}
