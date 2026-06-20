"use server";

/**
 * ERP COMMON AI.14 — AI Audit Trail Explainer Server Actions
 *
 * Read-only audit explanation. Optional AI generation via provider bridge.
 * No mutations to audit logs. No rollback. No undo. No action execution.
 * No raw OCR / content_text / prompt / AI response / API key stored or returned.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { AUDIT_EXPLAINER_PROMPT_VERSION } from "@/lib/ai/common/audit-explainer/types";
import {
  collectAuditLogEntries,
  collectEntityAuditTimeline,
  collectAiEventTimeline,
  collectDmsEventTimeline,
  collectAuditExplainerOverview,
} from "@/lib/ai/common/audit-explainer/audit-collectors";
import {
  generateAuditExplanation,
  buildDeterministicAuditSummary,
} from "@/lib/ai/common/audit-explainer/explanation-builder";
import {
  saveAuditExplanation,
  getCachedAuditExplanation,
  softDeleteAuditExplanation,
} from "@/lib/ai/common/audit-explainer/explanation-cache";
import type {
  AuditExplainerScope,
  AuditExplainerSourceType,
  AuditTimelineItem,
  AuditExplanationSummary,
  AuditExplainerOverview,
} from "@/lib/ai/common/audit-explainer/types";

export type ActionResult<T = undefined> = T extends undefined
  ? { success: boolean; error?: string }
  : { success: boolean; data?: T; error?: string };

// ── Feature flag check ─────────────────────────────────────────────────────────

export async function isAuditExplainerEnabled(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "ERP_AI_AUDIT_EXPLAINER")
      .single();
    return data?.is_enabled === true;
  } catch {
    return false;
  }
}

// ── Permission helpers ─────────────────────────────────────────────────────────

type AuthCtx = Awaited<ReturnType<typeof getAuthContext>>;

function canViewExplainer(ctx: AuthCtx): boolean {
  return (
    hasPermission(ctx, "ai.audit_explainer.view") ||
    hasPermission(ctx, "ai.audit_explainer.use") ||
    hasPermission(ctx, "ai.audit_explainer.admin") ||
    hasPermission(ctx, "ai.common.view") ||
    hasPermission(ctx, "ai.common.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

function canUseAi(ctx: AuthCtx): boolean {
  return (
    hasPermission(ctx, "ai.audit_explainer.use") ||
    hasPermission(ctx, "ai.common.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

function canAdmin(ctx: AuthCtx): boolean {
  return (
    hasPermission(ctx, "ai.audit_explainer.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

// ── Input validation ───────────────────────────────────────────────────────────

const OverviewInputSchema = z.object({
  scope: z.enum(["today", "last_7_days", "last_30_days"]).optional(),
  entityType: z.string().max(100).optional(),
  entityId: z.number().int().positive().optional(),
});

const ExplainInputSchema = z.object({
  scope: z.enum(["today", "last_7_days", "last_30_days"]).optional(),
  entityType: z.string().max(100).optional(),
  entityId: z.number().int().positive().optional(),
  auditLogId: z.number().int().positive().optional(),
  sourceType: z.enum(["audit_log", "audit_group", "entity_timeline", "ai_event_group", "dms_event_group"]).optional(),
  forceRefresh: z.boolean().optional(),
});

// ── Usage logging helper ───────────────────────────────────────────────────────

async function logAiUsage(input: {
  operationType: string;
  entityType?: string;
  entityId?: number;
  eventCount: number;
  modelName?: string;
  promptTokens?: number;
  completionTokens?: number;
  durationMs?: number;
  status: "success" | "error";
  errorMessage?: string;
}): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from("erp_ai_usage_logs").insert({
      feature_area: "ERP_AI_AUDIT_EXPLAINER",
      operation_type: input.operationType,
      model_id: input.modelName ?? null,
      status: input.status,
      input_token_count: input.promptTokens ?? null,
      output_token_count: input.completionTokens ?? null,
      duration_ms: input.durationMs ?? null,
      error_message: input.errorMessage ? input.errorMessage.slice(0, 300) : null,
      metadata_json: {
        entity_type: input.entityType,
        entity_id: input.entityId,
        event_count: input.eventCount,
        prompt_version: AUDIT_EXPLAINER_PROMPT_VERSION,
      },
    });
  } catch {
    // non-fatal
  }
}

// ── Server Actions ─────────────────────────────────────────────────────────────

/**
 * Overview: timeline of recent audit events (deterministic, no AI call)
 */
export async function getAuditExplainerOverview(input?: {
  scope?: AuditExplainerScope;
  entityType?: string;
  entityId?: number;
}): Promise<ActionResult<AuditExplainerOverview>> {
  try {
    const ctx = await getAuthContext();
    if (!canViewExplainer(ctx)) {
      return { success: false, error: "Insufficient permissions." };
    }

    const parsed = OverviewInputSchema.safeParse(input ?? {});
    const scope: AuditExplainerScope = parsed.success ? (parsed.data.scope ?? "today") : "today";
    const entityType = parsed.success ? parsed.data.entityType : undefined;
    const entityId = parsed.success ? parsed.data.entityId : undefined;

    const overview = await collectAuditExplainerOverview(scope, entityType, entityId);

    return {
      success: true,
      data: {
        scope,
        generatedAt: new Date().toISOString(),
        ...overview,
      },
    };
  } catch (err) {
    return { success: false, error: `Failed to load overview: ${String(err)}` };
  }
}

/**
 * Full audit timeline for an entity
 */
export async function getAuditTimeline(input?: {
  scope?: AuditExplainerScope;
  entityType?: string;
  entityId?: number;
}): Promise<ActionResult<AuditTimelineItem[]>> {
  try {
    const ctx = await getAuthContext();
    if (!canViewExplainer(ctx)) {
      return { success: false, error: "Insufficient permissions." };
    }

    const scope: AuditExplainerScope = input?.scope ?? "today";
    const items = await collectAuditLogEntries(scope, input?.entityType, input?.entityId, 50);
    return { success: true, data: items };
  } catch (err) {
    return { success: false, error: `Failed to load timeline: ${String(err)}` };
  }
}

/**
 * Explain a single audit log entry
 */
export async function explainAuditLogEntry(input: {
  auditLogId: number;
  forceRefresh?: boolean;
}): Promise<ActionResult<AuditExplanationSummary>> {
  try {
    const ctx = await getAuthContext();
    if (!canViewExplainer(ctx)) {
      return { success: false, error: "Insufficient permissions." };
    }

    const aiEnabled = await isAuditExplainerEnabled();
    const userId = ctx.profile?.id ?? 0;

    const supabase = createAdminClient();
    const { data: logRow } = await supabase
      .from("audit_logs")
      .select("id, module_code, entity_name, entity_id, entity_reference, action, old_values, new_values, created_at")
      .eq("id", input.auditLogId)
      .single();

    if (!logRow) {
      return { success: false, error: "Audit log entry not found." };
    }

    // Check for cached explanation first
    if (!input.forceRefresh) {
      const cached = await getCachedAuditExplanation("audit_log", input.auditLogId).catch(() => null);
      if (cached) {
        return {
          success: true,
          data: {
            explanationId: cached.id,
            sourceType: "audit_log",
            sourceId: input.auditLogId,
            scope: "single_event",
            explanation: null,
            deterministicSummary: cached.explanationText,
            isAiGenerated: !!cached.modelName,
            modelName: cached.modelName,
            generatedAt: cached.createdAt,
            warnings: [],
          },
        };
      }
    }

    // Build timeline item from this single log
    const items: AuditTimelineItem[] = [{
      id: Number(logRow.id),
      source: "audit_log",
      entityType: logRow.entity_name ?? "unknown",
      entityId: logRow.entity_id ? Number(logRow.entity_id) : undefined,
      entityReference: logRow.entity_reference ?? undefined,
      action: logRow.action ?? "update",
      occurredAt: logRow.created_at,
      moduleCode: logRow.module_code ?? undefined,
      safeLabel: `${logRow.action} on ${logRow.entity_name}${logRow.entity_reference ? ` (${logRow.entity_reference})` : ""}`,
    }];

    const deterministicSummary = buildDeterministicAuditSummary(items, {
      entityType: logRow.entity_name ?? undefined,
      entityId: logRow.entity_id ? Number(logRow.entity_id) : undefined,
      scope: "single_event",
    });

    if (!aiEnabled || !canUseAi(ctx)) {
      return {
        success: true,
        data: {
          sourceType: "audit_log",
          sourceId: input.auditLogId,
          scope: "single_event",
          explanation: null,
          deterministicSummary,
          isAiGenerated: false,
          generatedAt: new Date().toISOString(),
          warnings: aiEnabled ? [] : ["AI Audit Explainer feature is disabled."],
        },
      };
    }

    const start = Date.now();
    const result = await generateAuditExplanation(items, {
      entityType: logRow.entity_name ?? undefined,
      entityId: logRow.entity_id ? Number(logRow.entity_id) : undefined,
      scope: "single_event",
      sourceType: "audit_log",
    });

    const duration = Date.now() - start;

    if (result.isAiGenerated && result.explanation) {
      const explanationId = await saveAuditExplanation({
        sourceType: "audit_log",
        sourceId: input.auditLogId,
        entityType: logRow.entity_name ?? undefined,
        entityId: logRow.entity_id ? Number(logRow.entity_id) : undefined,
        scope: "today",
        explanationText: result.explanation.plainEnglishSummary,
        summaryJson: {
          eventCount: 1,
          entityType: logRow.entity_name ?? undefined,
          entityId: logRow.entity_id ? Number(logRow.entity_id) : undefined,
          actionCodes: [logRow.action ?? "update"],
          sourceType: "audit_log",
        },
        modelName: result.modelName,
        promptVersion: AUDIT_EXPLAINER_PROMPT_VERSION,
        createdBy: userId || undefined,
      }).catch(() => null);

      await logAiUsage({
        operationType: "explain_audit_log",
        entityType: logRow.entity_name ?? undefined,
        entityId: logRow.entity_id ? Number(logRow.entity_id) : undefined,
        eventCount: 1,
        modelName: result.modelName,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        durationMs: duration,
        status: "success",
      });

      return {
        success: true,
        data: {
          explanationId: explanationId ?? undefined,
          sourceType: "audit_log",
          sourceId: input.auditLogId,
          scope: "single_event",
          explanation: result.explanation,
          deterministicSummary: result.deterministicSummary,
          isAiGenerated: true,
          modelName: result.modelName,
          generatedAt: new Date().toISOString(),
          warnings: [],
        },
      };
    }

    return {
      success: true,
      data: {
        sourceType: "audit_log",
        sourceId: input.auditLogId,
        scope: "single_event",
        explanation: null,
        deterministicSummary: result.deterministicSummary,
        isAiGenerated: false,
        generatedAt: new Date().toISOString(),
        warnings: result.error ? [result.error] : [],
      },
    };
  } catch (err) {
    return { success: false, error: `Explanation failed: ${String(err)}` };
  }
}

/**
 * Explain entity audit timeline
 */
export async function explainEntityAuditTimeline(input: {
  entityType: string;
  entityId: number;
  scope?: AuditExplainerScope;
}): Promise<ActionResult<AuditExplanationSummary>> {
  try {
    const ctx = await getAuthContext();
    if (!canViewExplainer(ctx)) {
      return { success: false, error: "Insufficient permissions." };
    }

    const scope: AuditExplainerScope = input.scope ?? "today";
    const aiEnabled = await isAuditExplainerEnabled();
    const userId = ctx.profile?.id ?? 0;

    const items = await collectEntityAuditTimeline(scope, input.entityType, input.entityId, 30);
    const deterministicSummary = buildDeterministicAuditSummary(items, {
      entityType: input.entityType,
      entityId: input.entityId,
      scope,
    });

    if (!aiEnabled || !canUseAi(ctx)) {
      return {
        success: true,
        data: {
          sourceType: "entity_timeline",
          entityType: input.entityType,
          entityId: input.entityId,
          scope,
          explanation: null,
          deterministicSummary,
          isAiGenerated: false,
          generatedAt: new Date().toISOString(),
          warnings: aiEnabled ? [] : ["AI Audit Explainer is disabled."],
        },
      };
    }

    const start = Date.now();
    const result = await generateAuditExplanation(items, {
      entityType: input.entityType,
      entityId: input.entityId,
      scope,
      sourceType: "entity_timeline",
    });
    const duration = Date.now() - start;

    if (result.isAiGenerated && result.explanation) {
      await saveAuditExplanation({
        sourceType: "entity_timeline",
        entityType: input.entityType,
        entityId: input.entityId,
        scope,
        explanationText: result.explanation.plainEnglishSummary,
        summaryJson: {
          eventCount: items.length,
          entityType: input.entityType,
          entityId: input.entityId,
          sourceType: "entity_timeline",
        },
        modelName: result.modelName,
        promptVersion: AUDIT_EXPLAINER_PROMPT_VERSION,
        createdBy: userId || undefined,
      }).catch(() => null);

      await logAiUsage({
        operationType: "explain_entity_timeline",
        entityType: input.entityType,
        entityId: input.entityId,
        eventCount: items.length,
        modelName: result.modelName,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        durationMs: duration,
        status: "success",
      });
    }

    return {
      success: true,
      data: {
        sourceType: "entity_timeline",
        entityType: input.entityType,
        entityId: input.entityId,
        scope,
        explanation: result.explanation,
        deterministicSummary: result.deterministicSummary,
        isAiGenerated: result.isAiGenerated,
        modelName: result.modelName,
        generatedAt: new Date().toISOString(),
        warnings: result.error ? [result.error] : [],
      },
    };
  } catch (err) {
    return { success: false, error: `Timeline explanation failed: ${String(err)}` };
  }
}

/**
 * Explain AI event group (risk/compliance/duplicates/suggestions)
 */
export async function explainAiEventGroup(input: {
  scope?: AuditExplainerScope;
  entityType?: string;
  entityId?: number;
}): Promise<ActionResult<AuditExplanationSummary>> {
  try {
    const ctx = await getAuthContext();
    if (!canViewExplainer(ctx)) {
      return { success: false, error: "Insufficient permissions." };
    }

    const scope: AuditExplainerScope = input.scope ?? "today";
    const aiEnabled = await isAuditExplainerEnabled();
    const userId = ctx.profile?.id ?? 0;

    const items = await collectAiEventTimeline(scope, input.entityType, input.entityId, 30);
    const deterministicSummary = buildDeterministicAuditSummary(items, {
      entityType: input.entityType,
      scope,
    });

    if (!aiEnabled || !canUseAi(ctx)) {
      return {
        success: true,
        data: {
          sourceType: "ai_event_group",
          entityType: input.entityType,
          entityId: input.entityId,
          scope,
          explanation: null,
          deterministicSummary,
          isAiGenerated: false,
          generatedAt: new Date().toISOString(),
          warnings: aiEnabled ? [] : ["AI Audit Explainer is disabled."],
        },
      };
    }

    const start = Date.now();
    const result = await generateAuditExplanation(items, {
      entityType: input.entityType,
      entityId: input.entityId,
      scope,
      sourceType: "ai_event_group",
    });
    const duration = Date.now() - start;

    if (result.isAiGenerated && result.explanation) {
      await saveAuditExplanation({
        sourceType: "ai_event_group",
        entityType: input.entityType,
        entityId: input.entityId,
        scope,
        explanationText: result.explanation.plainEnglishSummary,
        summaryJson: {
          eventCount: items.length,
          entityType: input.entityType,
          sourceType: "ai_event_group",
        },
        modelName: result.modelName,
        promptVersion: AUDIT_EXPLAINER_PROMPT_VERSION,
        createdBy: userId || undefined,
      }).catch(() => null);

      await logAiUsage({
        operationType: "explain_ai_event_group",
        entityType: input.entityType,
        entityId: input.entityId,
        eventCount: items.length,
        modelName: result.modelName,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        durationMs: duration,
        status: "success",
      });
    }

    return {
      success: true,
      data: {
        sourceType: "ai_event_group",
        entityType: input.entityType,
        entityId: input.entityId,
        scope,
        explanation: result.explanation,
        deterministicSummary: result.deterministicSummary,
        isAiGenerated: result.isAiGenerated,
        modelName: result.modelName,
        generatedAt: new Date().toISOString(),
        warnings: result.error ? [result.error] : [],
      },
    };
  } catch (err) {
    return { success: false, error: `AI event explanation failed: ${String(err)}` };
  }
}

/**
 * Get explanation history (admin or own explanations)
 */
export async function getAuditExplanationHistory(input?: {
  entityType?: string;
  entityId?: number;
  limit?: number;
}): Promise<ActionResult<Array<{ id: number; sourceType: string; entityType?: string; entityId?: number; explanationText: string; createdAt: string; modelName?: string }>>> {
  try {
    const ctx = await getAuthContext();
    if (!canViewExplainer(ctx)) {
      return { success: false, error: "Insufficient permissions." };
    }

    const supabase = createAdminClient();
    let query = supabase
      .from("erp_ai_audit_explanations")
      .select("id, source_type, entity_type, entity_id, explanation_text, created_at, model_name")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(input?.limit ?? 20);

    if (!canAdmin(ctx)) {
      query = query.eq("created_by", ctx.profile?.id ?? 0);
    }
    if (input?.entityType) query = query.eq("entity_type", input.entityType);
    if (input?.entityId) query = query.eq("entity_id", input.entityId);

    const { data } = await query;

    return {
      success: true,
      data: (data ?? []).map((row) => ({
        id: Number(row.id),
        sourceType: row.source_type,
        entityType: row.entity_type ?? undefined,
        entityId: row.entity_id ? Number(row.entity_id) : undefined,
        explanationText: row.explanation_text,
        createdAt: row.created_at,
        modelName: row.model_name ?? undefined,
      })),
    };
  } catch (err) {
    return { success: false, error: `Failed to load history: ${String(err)}` };
  }
}
