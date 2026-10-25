import "server-only";
import { logDmsAiUsage } from "@/lib/ai/observability/log-dms-ai-usage";
import { logger } from "@/lib/logger";

type HrUsage = {
  featureCode: string; entityType?: string; entityId: number; outputType: string;
  status: "success" | "failure"; durationMs: number; model: string | null;
  promptTokens: number | null; completionTokens: number | null; profileId: number | null;
  providerCode: string | null; configCode: string | null; configId: number | null;
};
/** Canonical schema; the provider bridge supplies an erp_ai_provider_configs id.
 * This is supplementary telemetry, never authority to alter an employee. */
export async function logHrAiUsage(params: HrUsage): Promise<void> {
  const id = await logDmsAiUsage({
    featureArea: params.featureCode, operationType: params.outputType,
    status: params.status === "failure" ? "failed" : "success", durationMs: params.durationMs,
    modelId: params.model, inputTokenCount: params.promptTokens, outputTokenCount: params.completionTokens,
    createdBy: params.profileId, providerConfigId: params.configId,
    metadata: { entity_type: params.entityType ?? "employee", entity_id: params.entityId },
  });
  if (id === null) logger.warn("HR AI usage recording unavailable", { eventCode: "F17_HR_USAGE_UNAVAILABLE" });
}
