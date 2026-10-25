"use server";

/**
 * ERP DMS AI Phase 14 — AI Observability Server Actions
 *
 * Read-only actions for the DMS AI Observability dashboard.
 * Also provides CRUD for erp_ai_model_cost_rates (admin only).
 *
 * Security rules:
 *   - ALL reads require DMS_AI_OBSERVABILITY=true AND dms.ai_observability.view permission.
 *   - Cost rate mutations require dms.ai_observability.admin.
 *   - Never returns raw prompts, responses, OCR text, vectors, or API keys.
 *   - Never returns raw metadata_json — safe fields extracted by extractSafeUsageDisplayFields.
 *   - Never calls AI providers.
 *   - Never mutates dms_documents, dms_document_metadata_values, or any ERP entity.
 */

import { extractSafeUsageDisplayFields } from "@/lib/ai/observability/safe-usage-redaction";
import { getAuthContext, hasGlobalPermission, canUseApplication } from "@/lib/rbac/check";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {verifiedAggregate} from "@/server/reads/verified-aggregate";

import { readDmsUsage, readDmsQueueHealth, readDmsPipelineHealth } from "@/server/reads/dms-ai-observability";
import type { UsageSnapshot } from "@/lib/ai/observability/usage-summary";
import { reportSafeDiagnostic } from "@/lib/observability/safe-diagnostic";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export interface ObservabilityFilters {
  dateFrom?: string | null;
  dateTo?: string | null;
  featureArea?: string | null;
  operationType?: string | null;
  modelId?: string | null;
  status?: string | null;
  documentId?: number | null;
}

export interface UsageOverviewData {
  totalLogs: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  totalEstimatedCost: number | null;
  costDataAvailable: boolean;
  costKnownCount: number;
  otherCount: number;
  asOf: string;
}

export interface TokenCostSummaryRow {
  featureArea: string;
  operationType: string;
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  estimatedCost: number | null;
}

export interface ProviderModelBreakdownRow {
  modelId: string | null;
  providerConfigId: number | null;
  totalCalls: number;
  successCalls: number;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  estimatedCost: number | null;
}

export interface FeatureBreakdownRow {
  featureArea: string;
  operationType: string;
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  avgDurationMs: number | null;
}

export interface JobQueueObservabilityData {
  queuedCount: number;
  runningCount: number;
  completedCount: number;
  failedCount: number;
  retryScheduledCount: number;
  oldestWaitingAt: string | null;
  asOf: string;
  recentJobs: Array<{
    id: number;
    jobType: string;
    jobStatus: string;
    relatedDocumentId: number | null;
    attemptCount: number;
    maxAttempts: number;
    createdAt: string;
    completedAt: string | null;
  }>;
}

export interface PipelineHealthData {
  asOf: string;
  documentsWithPendingAi: number;
  documentsAiProcessing: number;
  documentsAiFailed: number;
  documentsAiComplete: number;
  pendingEmbeddingChunks: number;
  failedEmbeddingChunks: number;
  reviewQueueOpen: number;
  reviewQueueHighPriority: number;
  validationFindingsOpen: number;
  entityMatchCandidatesPending: number;
}

export interface RecentUsageEventRow {
  id: number;
  featureArea: string;
  operationType: string;
  modelId: string | null;
  status: string;
  inputTokenCount: number | null;
  outputTokenCount: number | null;
  estimatedCost: number | null;
  durationMs: number | null;
  documentId: number | null;
  safeDisplayFields: ReturnType<typeof extractSafeUsageDisplayFields>;
  createdAt: string;
}

export interface ErrorBreakdownRow {
  errorMessage: string;
  featureArea: string;
  operationType: string;
  count: number;
  lastSeen: string;
}

export interface ObservabilityConfig {
  featureFlagEnabled: boolean;
  hasViewPermission: boolean;
  hasAdminPermission: boolean;
}

export interface CostRateRow {
  id: number;
  providerType: string;
  modelId: string;
  displayName: string | null;
  rateType: string;
  inputCostPer1mTokens: number | null;
  outputCostPer1mTokens: number | null;
  unitCost: number | null;
  currencyCode: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  requiresConfirmation: boolean;
  sourceNote: string | null;
  createdAt: string;
}

export interface CreateCostRateInput {
  providerType: string;
  modelId: string;
  displayName?: string | null;
  rateType: "token" | "page" | "unit" | "zero";
  inputCostPer1mTokens?: number | null;
  outputCostPer1mTokens?: number | null;
  unitCost?: number | null;
  currencyCode?: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isActive?: boolean;
  requiresConfirmation?: boolean;
  sourceNote?: string | null;
}

// Read authority is checked before elevated monitoring reads and again before delivery.
// There is no role-name bypass, cross-request cache or provider call.
const viewPermissions = ["dms.ai_observability.view", "dms.ai_observability.admin", "dms.admin", "settings.ai.view", "settings.ai.manage"];
async function checkObservabilityAccess() {
  const ctx = await getAuthContext();
  if (!canUseApplication(ctx)) return { ok: false as const, error: "Sign in with an active account." };
  if (!viewPermissions.some(p => hasGlobalPermission(ctx, p))) return { ok: false as const, error: "Permission denied." };
  const db = await createClient();
  const result = await db.from("erp_ai_feature_flags").select("is_enabled").eq("feature_code", "DMS_AI_OBSERVABILITY").maybeSingle();
  if (result.error || !result.data || typeof result.data.is_enabled !== "boolean") return { ok: false as const, error: "Feature availability could not be verified. Try again." };
  return { ok: true as const, ctx, flagEnabled: result.data.is_enabled };
}
async function monitoredRead<T>(read: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const before = await checkObservabilityAccess();
    if (!before.ok) return { success: false, error: before.error };
    if (!before.flagEnabled) return { success: false, error: "DMS AI Observability is not enabled." };
    const data = await read();
    const after = await checkObservabilityAccess();
    if (!after.ok || !after.flagEnabled || after.ctx.profile?.id !== before.ctx.profile?.id) return { success: false, error: "Access changed. Refresh and try again." };
    return { success: true, data };
  } catch (error) {
    const reference = reportSafeDiagnostic(error, { route: "/admin/dms/ai-observability", source: "dashboard", event: "DMS_METRICS_UNAVAILABLE", build: process.env.NEXT_PUBLIC_ALGT_BUILD_COMMIT });
    return { success: false, error: `These metrics could not be verified. Try again or narrow the date range. Reference: ${reference}` };
  }
}
export async function getDmsAiObservabilityConfig(): Promise<ActionResult<ObservabilityConfig>> {
  try {
    const access = await checkObservabilityAccess();
    if (!access.ok) return { success: false, error: access.error };
    return { success: true, data: { featureFlagEnabled: access.flagEnabled, hasViewPermission: true,
      hasAdminPermission: hasGlobalPermission(access.ctx, "dms.ai_observability.admin") || hasGlobalPermission(access.ctx, "settings.ai.manage") } };
  } catch { return { success: false, error: "Feature availability could not be verified. Try again." }; }
}
export async function getDmsAiUsageSnapshot(filters: ObservabilityFilters = {}): Promise<ActionResult<UsageSnapshot>> {
  return monitoredRead(() => readDmsUsage(filters));
}
async function usageSection<K extends keyof UsageSnapshot>(key: K, filters: ObservabilityFilters): Promise<ActionResult<UsageSnapshot[K]>> {
  const result = await getDmsAiUsageSnapshot(filters);
  return result.success && result.data ? { success: true, data: result.data[key] } : { success: false, error: result.error };
}
export async function getDmsAiObservabilityOverview(filters: ObservabilityFilters = {}): Promise<ActionResult<UsageOverviewData>> { return usageSection("overview", filters); }
export async function getDmsAiCostBreakdown(filters: ObservabilityFilters = {}): Promise<ActionResult<TokenCostSummaryRow[]>> { return usageSection("costs", filters); }
export async function getDmsAiProviderModelBreakdown(filters: ObservabilityFilters = {}): Promise<ActionResult<ProviderModelBreakdownRow[]>> { return usageSection("providers", filters); }
export async function getDmsAiFeatureBreakdown(filters: ObservabilityFilters = {}): Promise<ActionResult<FeatureBreakdownRow[]>> { return usageSection("features", filters); }
export async function getDmsAiRecentUsageEvents(filters: ObservabilityFilters = {}): Promise<ActionResult<RecentUsageEventRow[]>> { return usageSection("recent", filters); }
export async function getDmsAiErrorBreakdown(filters: ObservabilityFilters = {}): Promise<ActionResult<ErrorBreakdownRow[]>> { return usageSection("errors", filters); }
export async function getDmsAiJobQueueObservability(_filters: ObservabilityFilters = {}): Promise<ActionResult<JobQueueObservabilityData>> { return monitoredRead(readDmsQueueHealth); }
export async function getDmsAiPipelineHealth(): Promise<ActionResult<PipelineHealthData>> { return monitoredRead(readDmsPipelineHealth); }

// ── Cost Rate Admin Actions ───────────────────────────────────────────────────

export async function getAiModelCostRates(): Promise<ActionResult<CostRateRow[]>> {
  return monitoredRead(async () => {
    const db = createAdminClient();
    const { data } = await verifiedAggregate((from,to) => db
      .from("erp_ai_model_cost_rates")
      .select("id, provider_type, model_id, display_name, rate_type, input_cost_per_1m_tokens, output_cost_per_1m_tokens, unit_cost, currency_code, effective_from, effective_to, is_active, requires_confirmation, source_note, created_at",{count:"exact"})
      .order("provider_type")
      .order("model_id")
      .order("effective_from", { ascending: false }).order("id").range(from,to));


    type Row = {
      id: number; provider_type: string; model_id: string; display_name: string | null;
      rate_type: string; input_cost_per_1m_tokens: number | null; output_cost_per_1m_tokens: number | null;
      unit_cost: number | null; currency_code: string; effective_from: string; effective_to: string | null;
      is_active: boolean; requires_confirmation: boolean; source_note: string | null; created_at: string;
    };

    return (data as Row[]).map((r) => ({
        id: r.id,
        providerType: r.provider_type,
        modelId: r.model_id,
        displayName: r.display_name,
        rateType: r.rate_type,
        inputCostPer1mTokens: r.input_cost_per_1m_tokens,
        outputCostPer1mTokens: r.output_cost_per_1m_tokens,
        unitCost: r.unit_cost,
        currencyCode: r.currency_code,
        effectiveFrom: r.effective_from,
        effectiveTo: r.effective_to,
        isActive: r.is_active,
        requiresConfirmation: r.requires_confirmation,
        sourceNote: r.source_note,
        createdAt: r.created_at,
      }));
  });
}

async function checkAdminAccess(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getAuthContext();
  if (!canUseApplication(ctx)) return { ok: false, error: "Sign in with an active account." };
  const hasAdmin =
    hasGlobalPermission(ctx, "dms.ai_observability.admin") ||
    hasGlobalPermission(ctx, "settings.ai.manage");
  if (!hasAdmin) return { ok: false, error: "Permission denied. Requires dms.ai_observability.admin." };
  return { ok: true };
}

export async function createAiModelCostRate(
  input: CreateCostRateInput
): Promise<ActionResult<{ id: number }>> {
  const access = await checkAdminAccess();
  if (!access.ok) return { success: false, error: access.error };

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("erp_ai_model_cost_rates")
      .insert({
        provider_type:              input.providerType,
        model_id:                   input.modelId,
        display_name:               input.displayName ?? null,
        rate_type:                  input.rateType,
        input_cost_per_1m_tokens:   input.inputCostPer1mTokens ?? null,
        output_cost_per_1m_tokens:  input.outputCostPer1mTokens ?? null,
        unit_cost:                  input.unitCost ?? null,
        currency_code:              input.currencyCode ?? "USD",
        effective_from:             input.effectiveFrom,
        effective_to:               input.effectiveTo ?? null,
        is_active:                  input.isActive ?? true,
        requires_confirmation:      input.requiresConfirmation ?? true,
        source_note:                input.sourceNote ?? null,
      })
      .select("id")
      .single();

    if (error) return { success: false, error: "The cost rate could not be saved. Check the values and try again." };
    return { success: true, data: { id: (data as { id: number }).id } };
  } catch {
    return { success: false, error: "Create failed." };
  }
}

export async function updateAiModelCostRate(
  id: number,
  input: Partial<CreateCostRateInput> & { requiresConfirmation?: boolean }
): Promise<ActionResult> {
  const access = await checkAdminAccess();
  if (!access.ok) return { success: false, error: access.error };

  try {
    const db = createAdminClient();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.displayName !== undefined) updates.display_name = input.displayName;
    if (input.rateType !== undefined) updates.rate_type = input.rateType;
    if (input.inputCostPer1mTokens !== undefined) updates.input_cost_per_1m_tokens = input.inputCostPer1mTokens;
    if (input.outputCostPer1mTokens !== undefined) updates.output_cost_per_1m_tokens = input.outputCostPer1mTokens;
    if (input.unitCost !== undefined) updates.unit_cost = input.unitCost;
    if (input.effectiveTo !== undefined) updates.effective_to = input.effectiveTo;
    if (input.isActive !== undefined) updates.is_active = input.isActive;
    if (input.requiresConfirmation !== undefined) updates.requires_confirmation = input.requiresConfirmation;
    if (input.sourceNote !== undefined) updates.source_note = input.sourceNote;

    const { error } = await db.from("erp_ai_model_cost_rates").update(updates).eq("id", id);
    if (error) return { success: false, error: "The cost rate could not be saved. Check the values and try again." };
    return { success: true };
  } catch {
    return { success: false, error: "Update failed." };
  }
}

export async function archiveAiModelCostRate(id: number): Promise<ActionResult> {
  const access = await checkAdminAccess();
  if (!access.ok) return { success: false, error: access.error };

  try {
    const db = createAdminClient();
    const { error } = await db
      .from("erp_ai_model_cost_rates")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return { success: false, error: "The cost rate could not be saved. Check the values and try again." };
    return { success: true };
  } catch {
    return { success: false, error: "Archive failed." };
  }
}
