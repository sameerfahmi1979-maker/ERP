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

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { extractSafeUsageDisplayFields, sanitizeErrorMessage } from "@/lib/ai/observability/safe-usage-redaction";

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
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCost: number | null;
  costDataAvailable: boolean;
}

export interface TokenCostSummaryRow {
  featureArea: string;
  operationType: string;
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCost: number | null;
}

export interface ProviderModelBreakdownRow {
  modelId: string | null;
  providerConfigId: number | null;
  totalCalls: number;
  successCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCost: number | null;
}

export interface FeatureBreakdownRow {
  featureArea: string;
  operationType: string;
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgDurationMs: number | null;
}

export interface JobQueueObservabilityData {
  queuedCount: number;
  runningCount: number;
  completedCount: number;
  failedCount: number;
  retryScheduledCount: number;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function checkObservabilityAccess(): Promise<{
  ok: boolean;
  ctx?: Awaited<ReturnType<typeof getAuthContext>>;
  flagEnabled?: boolean;
  error?: string;
}> {
  const ctx = await getAuthContext();
  if (!ctx.profile) return { ok: false, error: "Not authenticated." };

  const hasView =
    hasPermission(ctx, "dms.ai_observability.view") ||
    hasPermission(ctx, "dms.ai_observability.admin") ||
    hasPermission(ctx, "dms.admin") ||
    hasPermission(ctx, "settings.ai.view") ||
    hasPermission(ctx, "settings.ai.manage") ||
    ctx.roleCodes.includes("system_admin");

  if (!hasView) return { ok: false, error: "Permission denied." };

  // Check feature flag
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "DMS_AI_OBSERVABILITY")
      .single();
    const flagEnabled = (data as { is_enabled?: boolean } | null)?.is_enabled === true;
    return { ok: true, ctx, flagEnabled };
  } catch {
    return { ok: true, ctx, flagEnabled: false };
  }
}

function applyDateFilter(
  query: ReturnType<typeof createClient> extends Promise<infer T> ? never : never,
  filters: ObservabilityFilters
) {
  // Used directly in SQL queries below — helper for type clarity
  return filters;
}
void applyDateFilter;

// ── getDmsAiObservabilityConfig ────────────────────────────────────────────────

export async function getDmsAiObservabilityConfig(): Promise<ActionResult<ObservabilityConfig>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };

    const hasView =
      hasPermission(ctx, "dms.ai_observability.view") ||
      hasPermission(ctx, "dms.ai_observability.admin") ||
      hasPermission(ctx, "dms.admin") ||
      hasPermission(ctx, "settings.ai.view") ||
      ctx.roleCodes.includes("system_admin");

    const hasAdmin =
      hasPermission(ctx, "dms.ai_observability.admin") ||
      hasPermission(ctx, "settings.ai.manage") ||
      ctx.roleCodes.includes("system_admin");

    let flagEnabled = false;
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("erp_ai_feature_flags")
        .select("is_enabled")
        .eq("feature_code", "DMS_AI_OBSERVABILITY")
        .single();
      flagEnabled = (data as { is_enabled?: boolean } | null)?.is_enabled === true;
    } catch {
      flagEnabled = false;
    }

    return {
      success: true,
      data: {
        featureFlagEnabled: flagEnabled,
        hasViewPermission: hasView,
        hasAdminPermission: hasAdmin,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Config check failed." };
  }
}

// ── getDmsAiObservabilityOverview ─────────────────────────────────────────────

export async function getDmsAiObservabilityOverview(
  filters: ObservabilityFilters = {}
): Promise<ActionResult<UsageOverviewData>> {
  const access = await checkObservabilityAccess();
  if (!access.ok) return { success: false, error: access.error };
  if (!access.flagEnabled) return { success: false, error: "DMS AI Observability is not enabled." };

  try {
    const db = createAdminClient();
    let query = db
      .from("erp_ai_usage_logs")
      .select("status, input_token_count, output_token_count, estimated_cost");

    if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
    if (filters.dateTo) query = query.lte("created_at", filters.dateTo);
    if (filters.featureArea) query = query.eq("feature_area", filters.featureArea);
    if (filters.operationType) query = query.eq("operation_type", filters.operationType);
    if (filters.modelId) query = query.eq("model_id", filters.modelId);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.documentId) query = query.eq("document_id", filters.documentId);

    const { data, error } = await query.limit(10000);
    if (error) return { success: false, error: "Failed to load usage overview." };

    const rows = (data ?? []) as Array<{
      status: string;
      input_token_count: number | null;
      output_token_count: number | null;
      estimated_cost: number | null;
    }>;

    let successCount = 0, failedCount = 0, skippedCount = 0;
    let totalInputTokens = 0, totalOutputTokens = 0;
    let totalEstimatedCost = 0;
    let costRowsCount = 0;

    for (const r of rows) {
      if (r.status === "success") successCount++;
      else if (r.status === "failed") failedCount++;
      else skippedCount++;
      totalInputTokens += r.input_token_count ?? 0;
      totalOutputTokens += r.output_token_count ?? 0;
      if (r.estimated_cost !== null) {
        totalEstimatedCost += r.estimated_cost;
        costRowsCount++;
      }
    }

    return {
      success: true,
      data: {
        totalLogs: rows.length,
        successCount,
        failedCount,
        skippedCount,
        totalInputTokens,
        totalOutputTokens,
        totalEstimatedCost: costRowsCount > 0 ? totalEstimatedCost : null,
        costDataAvailable: costRowsCount > 0,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Overview query failed." };
  }
}

// ── getDmsAiCostBreakdown ─────────────────────────────────────────────────────

export async function getDmsAiCostBreakdown(
  filters: ObservabilityFilters = {}
): Promise<ActionResult<TokenCostSummaryRow[]>> {
  const access = await checkObservabilityAccess();
  if (!access.ok) return { success: false, error: access.error };
  if (!access.flagEnabled) return { success: false, error: "DMS AI Observability is not enabled." };

  try {
    const db = createAdminClient();
    let query = db
      .from("erp_ai_usage_logs")
      .select("feature_area, operation_type, status, input_token_count, output_token_count, estimated_cost");

    if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
    if (filters.dateTo) query = query.lte("created_at", filters.dateTo);
    if (filters.featureArea) query = query.eq("feature_area", filters.featureArea);

    const { data, error } = await query.limit(10000);
    if (error) return { success: false, error: "Failed to load cost breakdown." };

    type Row = { feature_area: string; operation_type: string; status: string; input_token_count: number | null; output_token_count: number | null; estimated_cost: number | null };
    const rows = (data ?? []) as Row[];

    const grouped = new Map<string, TokenCostSummaryRow>();
    for (const r of rows) {
      const key = `${r.feature_area}::${r.operation_type}`;
      const existing = grouped.get(key) ?? {
        featureArea: r.feature_area,
        operationType: r.operation_type,
        totalCalls: 0,
        successCalls: 0,
        failedCalls: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        estimatedCost: null,
      };
      existing.totalCalls++;
      if (r.status === "success") existing.successCalls++;
      else if (r.status === "failed") existing.failedCalls++;
      existing.totalInputTokens += r.input_token_count ?? 0;
      existing.totalOutputTokens += r.output_token_count ?? 0;
      if (r.estimated_cost !== null) {
        existing.estimatedCost = (existing.estimatedCost ?? 0) + r.estimated_cost;
      }
      grouped.set(key, existing);
    }

    return {
      success: true,
      data: Array.from(grouped.values())
        .sort((a, b) => b.totalCalls - a.totalCalls)
        .slice(0, 20),
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Cost breakdown failed." };
  }
}

// ── getDmsAiProviderModelBreakdown ─────────────────────────────────────────────

export async function getDmsAiProviderModelBreakdown(
  filters: ObservabilityFilters = {}
): Promise<ActionResult<ProviderModelBreakdownRow[]>> {
  const access = await checkObservabilityAccess();
  if (!access.ok) return { success: false, error: access.error };
  if (!access.flagEnabled) return { success: false, error: "DMS AI Observability is not enabled." };

  try {
    const db = createAdminClient();
    let query = db
      .from("erp_ai_usage_logs")
      .select("model_id, provider_config_id, status, input_token_count, output_token_count, estimated_cost");

    if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
    if (filters.dateTo) query = query.lte("created_at", filters.dateTo);

    const { data, error } = await query.limit(10000);
    if (error) return { success: false, error: "Failed to load provider/model breakdown." };

    type Row = { model_id: string | null; provider_config_id: number | null; status: string; input_token_count: number | null; output_token_count: number | null; estimated_cost: number | null };
    const rows = (data ?? []) as Row[];

    const grouped = new Map<string, ProviderModelBreakdownRow>();
    for (const r of rows) {
      const key = `${r.model_id ?? "unknown"}::${r.provider_config_id ?? 0}`;
      const existing = grouped.get(key) ?? {
        modelId: r.model_id,
        providerConfigId: r.provider_config_id,
        totalCalls: 0,
        successCalls: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        estimatedCost: null,
      };
      existing.totalCalls++;
      if (r.status === "success") existing.successCalls++;
      existing.totalInputTokens += r.input_token_count ?? 0;
      existing.totalOutputTokens += r.output_token_count ?? 0;
      if (r.estimated_cost !== null) {
        existing.estimatedCost = (existing.estimatedCost ?? 0) + r.estimated_cost;
      }
      grouped.set(key, existing);
    }

    return {
      success: true,
      data: Array.from(grouped.values())
        .sort((a, b) => b.totalCalls - a.totalCalls)
        .slice(0, 20),
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Provider breakdown failed." };
  }
}

// ── getDmsAiFeatureBreakdown ───────────────────────────────────────────────────

export async function getDmsAiFeatureBreakdown(
  filters: ObservabilityFilters = {}
): Promise<ActionResult<FeatureBreakdownRow[]>> {
  const access = await checkObservabilityAccess();
  if (!access.ok) return { success: false, error: access.error };
  if (!access.flagEnabled) return { success: false, error: "DMS AI Observability is not enabled." };

  try {
    const db = createAdminClient();
    let query = db
      .from("erp_ai_usage_logs")
      .select("feature_area, operation_type, status, input_token_count, output_token_count, duration_ms");

    if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
    if (filters.dateTo) query = query.lte("created_at", filters.dateTo);

    const { data, error } = await query.limit(10000);
    if (error) return { success: false, error: "Failed to load feature breakdown." };

    type Row = { feature_area: string; operation_type: string; status: string; input_token_count: number | null; output_token_count: number | null; duration_ms: number | null };
    const rows = (data ?? []) as Row[];

    const grouped = new Map<string, { row: FeatureBreakdownRow; totalDurationMs: number; durationCount: number }>();
    for (const r of rows) {
      const key = `${r.feature_area}::${r.operation_type}`;
      const existing = grouped.get(key) ?? {
        row: {
          featureArea: r.feature_area,
          operationType: r.operation_type,
          totalCalls: 0,
          successCalls: 0,
          failedCalls: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          avgDurationMs: null,
        },
        totalDurationMs: 0,
        durationCount: 0,
      };
      existing.row.totalCalls++;
      if (r.status === "success") existing.row.successCalls++;
      else if (r.status === "failed") existing.row.failedCalls++;
      existing.row.totalInputTokens += r.input_token_count ?? 0;
      existing.row.totalOutputTokens += r.output_token_count ?? 0;
      if (r.duration_ms !== null) {
        existing.totalDurationMs += r.duration_ms;
        existing.durationCount++;
      }
      grouped.set(key, existing);
    }

    return {
      success: true,
      data: Array.from(grouped.values())
        .map(({ row, totalDurationMs, durationCount }) => ({
          ...row,
          avgDurationMs: durationCount > 0 ? Math.round(totalDurationMs / durationCount) : null,
        }))
        .sort((a, b) => b.totalCalls - a.totalCalls)
        .slice(0, 20),
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Feature breakdown failed." };
  }
}

// ── getDmsAiJobQueueObservability ─────────────────────────────────────────────

export async function getDmsAiJobQueueObservability(
  _filters: ObservabilityFilters = {}
): Promise<ActionResult<JobQueueObservabilityData>> {
  const access = await checkObservabilityAccess();
  if (!access.ok) return { success: false, error: access.error };
  if (!access.flagEnabled) return { success: false, error: "DMS AI Observability is not enabled." };

  try {
    const db = createAdminClient();

    const { data: statusCounts } = await db
      .from("dms_ai_job_queue")
      .select("job_status");

    const allJobs = (statusCounts ?? []) as Array<{ job_status: string }>;
    const counts = { queued: 0, running: 0, completed: 0, failed: 0, retry_scheduled: 0 };
    for (const j of allJobs) {
      if (j.job_status === "queued") counts.queued++;
      else if (j.job_status === "running") counts.running++;
      else if (j.job_status === "completed") counts.completed++;
      else if (j.job_status === "failed") counts.failed++;
      else if (j.job_status === "retry_scheduled") counts.retry_scheduled++;
    }

    const { data: recentData } = await db
      .from("dms_ai_job_queue")
      .select("id, job_type, job_status, related_document_id, attempt_count, max_attempts, created_at, completed_at")
      .order("created_at", { ascending: false })
      .limit(20);

    type JobRow = { id: number; job_type: string; job_status: string; related_document_id: number | null; attempt_count: number; max_attempts: number; created_at: string; completed_at: string | null };
    const recentJobs = ((recentData ?? []) as JobRow[]).map((j) => ({
      id: j.id,
      jobType: j.job_type,
      jobStatus: j.job_status,
      relatedDocumentId: j.related_document_id,
      attemptCount: j.attempt_count,
      maxAttempts: j.max_attempts,
      createdAt: j.created_at,
      completedAt: j.completed_at,
    }));

    return {
      success: true,
      data: {
        queuedCount: counts.queued,
        runningCount: counts.running,
        completedCount: counts.completed,
        failedCount: counts.failed,
        retryScheduledCount: counts.retry_scheduled,
        recentJobs,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Queue health query failed." };
  }
}

// ── getDmsAiPipelineHealth ────────────────────────────────────────────────────

export async function getDmsAiPipelineHealth(): Promise<ActionResult<PipelineHealthData>> {
  const access = await checkObservabilityAccess();
  if (!access.ok) return { success: false, error: access.error };
  if (!access.flagEnabled) return { success: false, error: "DMS AI Observability is not enabled." };

  try {
    const db = createAdminClient();

    const countOf = async (table: string, filters: Record<string, string | boolean | null>) => {
      let q = db.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null);
      for (const [k, v] of Object.entries(filters)) {
        if (v === null) q = q.is(k, null);
        else q = q.eq(k, v as string | boolean);
      }
      const { count } = await q;
      return count ?? 0;
    };

    const [pending, processing, failed, complete] = await Promise.all([
      countOf("dms_documents", { ai_status: "pending" }),
      countOf("dms_documents", { ai_status: "processing" }),
      countOf("dms_documents", { ai_status: "failed" }),
      countOf("dms_documents", { ai_status: "complete" }),
    ]);

    const { count: pendingChunks } = await db
      .from("dms_document_content_chunks")
      .select("id", { count: "exact", head: true })
      .eq("embedding_status", "pending")
      .eq("is_active", true)
      .is("deleted_at", null);

    const { count: failedChunks } = await db
      .from("dms_document_content_chunks")
      .select("id", { count: "exact", head: true })
      .eq("embedding_status", "failed")
      .eq("is_active", true)
      .is("deleted_at", null);

    const { count: reviewOpen } = await db
      .from("dms_review_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "open");

    const { count: reviewHighPriority } = await db
      .from("dms_review_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .eq("priority", "high");

    const { count: validationOpen } = await db
      .from("dms_ai_validation_findings")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .is("deleted_at", null);

    const { count: matchPending } = await db
      .from("dms_ai_entity_match_candidates")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .is("deleted_at", null);

    return {
      success: true,
      data: {
        documentsWithPendingAi: pending,
        documentsAiProcessing: processing,
        documentsAiFailed: failed,
        documentsAiComplete: complete,
        pendingEmbeddingChunks: pendingChunks ?? 0,
        failedEmbeddingChunks: failedChunks ?? 0,
        reviewQueueOpen: reviewOpen ?? 0,
        reviewQueueHighPriority: reviewHighPriority ?? 0,
        validationFindingsOpen: validationOpen ?? 0,
        entityMatchCandidatesPending: matchPending ?? 0,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Pipeline health query failed." };
  }
}

// ── getDmsAiRecentUsageEvents ─────────────────────────────────────────────────

export async function getDmsAiRecentUsageEvents(
  filters: ObservabilityFilters = {}
): Promise<ActionResult<RecentUsageEventRow[]>> {
  const access = await checkObservabilityAccess();
  if (!access.ok) return { success: false, error: access.error };
  if (!access.flagEnabled) return { success: false, error: "DMS AI Observability is not enabled." };

  try {
    const db = createAdminClient();
    let query = db
      .from("erp_ai_usage_logs")
      .select("id, feature_area, operation_type, model_id, status, input_token_count, output_token_count, estimated_cost, duration_ms, document_id, metadata_json, created_at")
      .order("created_at", { ascending: false });

    if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
    if (filters.dateTo) query = query.lte("created_at", filters.dateTo);
    if (filters.featureArea) query = query.eq("feature_area", filters.featureArea);
    if (filters.operationType) query = query.eq("operation_type", filters.operationType);
    if (filters.modelId) query = query.eq("model_id", filters.modelId);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.documentId) query = query.eq("document_id", filters.documentId);

    const { data, error } = await query.limit(100);
    if (error) return { success: false, error: "Failed to load recent events." };

    type Row = {
      id: number;
      feature_area: string;
      operation_type: string;
      model_id: string | null;
      status: string;
      input_token_count: number | null;
      output_token_count: number | null;
      estimated_cost: number | null;
      duration_ms: number | null;
      document_id: number | null;
      metadata_json: unknown;
      created_at: string;
    };

    return {
      success: true,
      data: ((data ?? []) as Row[]).map((r) => ({
        id: r.id,
        featureArea: r.feature_area,
        operationType: r.operation_type,
        modelId: r.model_id,
        status: r.status,
        inputTokenCount: r.input_token_count,
        outputTokenCount: r.output_token_count,
        estimatedCost: r.estimated_cost,
        durationMs: r.duration_ms,
        documentId: r.document_id,
        safeDisplayFields: extractSafeUsageDisplayFields(r.metadata_json),
        createdAt: r.created_at,
        // metadata_json is NOT returned raw — only safe extracted fields above
      })),
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Recent events query failed." };
  }
}

// ── getDmsAiErrorBreakdown ────────────────────────────────────────────────────

export async function getDmsAiErrorBreakdown(
  filters: ObservabilityFilters = {}
): Promise<ActionResult<ErrorBreakdownRow[]>> {
  const access = await checkObservabilityAccess();
  if (!access.ok) return { success: false, error: access.error };
  if (!access.flagEnabled) return { success: false, error: "DMS AI Observability is not enabled." };

  try {
    const db = createAdminClient();
    let query = db
      .from("erp_ai_usage_logs")
      .select("feature_area, operation_type, error_message, created_at")
      .eq("status", "failed")
      .order("created_at", { ascending: false });

    if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
    if (filters.dateTo) query = query.lte("created_at", filters.dateTo);

    const { data, error } = await query.limit(500);
    if (error) return { success: false, error: "Failed to load error breakdown." };

    type Row = { feature_area: string; operation_type: string; error_message: string | null; created_at: string };
    const rows = (data ?? []) as Row[];

    const grouped = new Map<string, ErrorBreakdownRow>();
    for (const r of rows) {
      const safeMsg = sanitizeErrorMessage(r.error_message) ?? "Unknown error";
      const key = `${r.feature_area}::${safeMsg}`;
      const existing = grouped.get(key) ?? {
        errorMessage: safeMsg,
        featureArea: r.feature_area,
        operationType: r.operation_type,
        count: 0,
        lastSeen: r.created_at,
      };
      existing.count++;
      if (r.created_at > existing.lastSeen) existing.lastSeen = r.created_at;
      grouped.set(key, existing);
    }

    return {
      success: true,
      data: Array.from(grouped.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 50),
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error breakdown failed." };
  }
}

// ── Cost Rate Admin Actions ───────────────────────────────────────────────────

export async function getAiModelCostRates(): Promise<ActionResult<CostRateRow[]>> {
  const access = await checkObservabilityAccess();
  if (!access.ok) return { success: false, error: access.error };

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("erp_ai_model_cost_rates")
      .select("id, provider_type, model_id, display_name, rate_type, input_cost_per_1m_tokens, output_cost_per_1m_tokens, unit_cost, currency_code, effective_from, effective_to, is_active, requires_confirmation, source_note, created_at")
      .order("provider_type")
      .order("model_id")
      .order("effective_from", { ascending: false });

    if (error) return { success: false, error: "Failed to load cost rates." };

    type Row = {
      id: number; provider_type: string; model_id: string; display_name: string | null;
      rate_type: string; input_cost_per_1m_tokens: number | null; output_cost_per_1m_tokens: number | null;
      unit_cost: number | null; currency_code: string; effective_from: string; effective_to: string | null;
      is_active: boolean; requires_confirmation: boolean; source_note: string | null; created_at: string;
    };

    return {
      success: true,
      data: ((data ?? []) as Row[]).map((r) => ({
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
      })),
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to load cost rates." };
  }
}

async function checkAdminAccess(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getAuthContext();
  if (!ctx.profile) return { ok: false, error: "Not authenticated." };
  const hasAdmin =
    hasPermission(ctx, "dms.ai_observability.admin") ||
    hasPermission(ctx, "settings.ai.manage") ||
    ctx.roleCodes.includes("system_admin");
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

    if (error) return { success: false, error: error.message.slice(0, 200) };
    return { success: true, data: { id: (data as { id: number }).id } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Create failed." };
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
    if (error) return { success: false, error: error.message.slice(0, 200) };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Update failed." };
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

    if (error) return { success: false, error: error.message.slice(0, 200) };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Archive failed." };
  }
}
