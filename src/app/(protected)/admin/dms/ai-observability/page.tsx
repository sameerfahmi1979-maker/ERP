import { getDmsAiObservabilityConfig } from "@/server/actions/dms/ai-observability";
import { DmsAiObservabilityPageClient } from "@/features/dms/ai-observability/dms-ai-observability-page-client";

export const metadata = {
  title: "DMS AI Observability",
};

export default async function DmsAiObservabilityPage() {
  const configResult = await getDmsAiObservabilityConfig();
  const config = configResult.data ?? {
    featureFlagEnabled: false,
    hasViewPermission: false,
    hasAdminPermission: false,
  };

  return <DmsAiObservabilityPageClient config={config} />;
}
