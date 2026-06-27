/**
 * ERP DMS AI Phase 14 — Shared DMS AI Usage Logger
 *
 * All DMS AI usage logging goes through this helper.
 * Sanitizes metadata, computes estimated_cost from confirmed rates,
 * and writes canonical erp_ai_usage_logs columns.
 *
 * Security rules:
 *   - Uses createAdminClient (worker-safe, no user session required).
 *   - Non-fatal: all errors are swallowed so AI operations never fail due to logging.
 *   - metadata is sanitized via buildSafeMetadata (no prompts/responses/keys).
 *   - estimated_cost is null when no confirmed rate exists or requires_confirmation=true.
 *   - Never stores raw prompts, responses, OCR text, vectors, or API keys.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { buildSafeMetadata, sanitizeErrorMessage } from "./safe-usage-redaction";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DmsAiUsageStatus = "success" | "failed" | "skipped";

export interface DmsAiUsageInput {
  providerConfigId?: number | null;
  featureArea: string;
  operationType: string;
  modelId?: string | null;
  status: DmsAiUsageStatus;
  inputTokenCount?: number | null;
  outputTokenCount?: number | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  documentId?: number | null;
  aiJobId?: number | null;
  uploadSessionId?: number | null;
  createdBy?: number | null;
  metadata?: Record<string, unknown> | null;
  /** Optional provider_type hint for cost rate lookup when providerConfigId is absent. */
  providerTypeHint?: string | null;
}

// ── Cost estimation ───────────────────────────────────────────────────────────

/**
 * Look up the active confirmed cost rate for provider_type + model_id.
 * Returns null when no confirmed rate exists.
 * Returns 0 when rate_type='zero'.
 */
async function estimateCost(
  db: ReturnType<typeof createAdminClient>,
  providerType: string | null | undefined,
  modelId: string | null | undefined,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined
): Promise<number | null> {
  if (!providerType || !modelId) return null;

  try {
    const today = new Date().toISOString().slice(0, 10);

    const { data: rate } = await db
      .from("erp_ai_model_cost_rates")
      .select("rate_type, input_cost_per_1m_tokens, output_cost_per_1m_tokens, unit_cost, requires_confirmation")
      .eq("provider_type", providerType)
      .eq("model_id", modelId)
      .eq("is_active", true)
      .lte("effective_from", today)
      .or("effective_to.is.null,effective_to.gte." + today)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!rate) return null;

    // Must not compute cost when requires_confirmation is still true
    if ((rate as { requires_confirmation?: boolean }).requires_confirmation === true) return null;

    const r = rate as {
      rate_type: string;
      input_cost_per_1m_tokens?: number | null;
      output_cost_per_1m_tokens?: number | null;
      unit_cost?: number | null;
    };

    if (r.rate_type === "zero") return 0;

    if (r.rate_type === "token") {
      const inputRate = r.input_cost_per_1m_tokens ?? 0;
      const outputRate = r.output_cost_per_1m_tokens ?? 0;
      const inTokens = inputTokens ?? 0;
      const outTokens = outputTokens ?? 0;
      return (inTokens / 1_000_000) * inputRate + (outTokens / 1_000_000) * outputRate;
    }

    return null;
  } catch {
    return null;
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Log a DMS AI usage event to erp_ai_usage_logs.
 * Non-fatal — all internal errors are swallowed.
 * Returns the inserted log id, or null on failure.
 */
export async function logDmsAiUsage(input: DmsAiUsageInput): Promise<number | null> {
  try {
    const db = createAdminClient();

    // Resolve provider_type for cost estimation
    let providerType: string | null = input.providerTypeHint ?? null;

    if (!providerType && input.providerConfigId) {
      try {
        const { data: config } = await db
          .from("erp_ai_provider_configs")
          .select("provider_type")
          .eq("id", input.providerConfigId)
          .maybeSingle();
        providerType = (config as { provider_type?: string } | null)?.provider_type ?? null;
      } catch {
        // non-fatal
      }
    }

    // Compute estimated cost
    const estimatedCost = await estimateCost(
      db,
      providerType,
      input.modelId,
      input.inputTokenCount,
      input.outputTokenCount
    );

    // Sanitize metadata
    const safeMetadata = buildSafeMetadata(input.metadata ?? null);

    // Sanitize error message
    const safeError = sanitizeErrorMessage(input.errorMessage);

    const { data, error } = await db
      .from("erp_ai_usage_logs")
      .insert({
        provider_config_id: input.providerConfigId ?? null,
        feature_area:       input.featureArea,
        operation_type:     input.operationType,
        model_id:           input.modelId ?? null,
        status:             input.status,
        input_token_count:  input.inputTokenCount ?? null,
        output_token_count: input.outputTokenCount ?? null,
        estimated_cost:     estimatedCost,
        duration_ms:        input.durationMs ?? null,
        error_message:      safeError,
        metadata_json:      safeMetadata,
        created_by:         input.createdBy ?? null,
        document_id:        input.documentId ?? null,
        ai_job_id:          input.aiJobId ?? null,
        upload_session_id:  input.uploadSessionId ?? null,
      })
      .select("id")
      .single();

    if (error || !data) return null;
    return (data as { id: number }).id;
  } catch {
    // Never throw — usage logging must not break AI operations
    return null;
  }
}
