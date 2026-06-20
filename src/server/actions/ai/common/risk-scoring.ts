"use server";

/**
 * ERP COMMON AI.5 — AI Risk Scoring Server Actions
 * Review-based entity risk scores — no auto-block/update/resolve.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import {
  calculateEntityRisk,
  computeIsStale,
  buildStoredRiskJson,
  parseRiskBreakdownJson,
  parseRiskReasonsJson,
  parseSourceCountsJson,
  type RiskBatchCalculationResult,
  type RiskEntityType,
  type RiskLevel,
  type RiskReviewDecision,
  type RiskScoreDetail,
  type RiskScoreEventRow,
  type RiskScoreResult,
  type RiskScoreRow,
  type RiskScoreStatus,
} from "@/lib/ai/common/risk-scoring";
import {
  countMissingRequiredDocuments,
} from "@/lib/ai/common/compliance-checker/rule-engine";
import {
  loadLinkedDocuments,
  loadRulesForEntityType,
} from "@/lib/ai/common/compliance-checker/scan-engine";

export type ActionResult<T = undefined> = T extends undefined
  ? { success: boolean; error?: string; code?: string }
  : { success: boolean; data?: T; error?: string; code?: string };

const entityTypeSchema = z.enum(["company", "party", "branch", "site", "dms_document"]);

const calculateEntitySchema = z.object({
  entityType: entityTypeSchema,
  entityId: z.coerce.number().int().positive(),
  dryRun: z.boolean().optional(),
});

const calculateBatchSchema = z.object({
  entityTypes: z.array(entityTypeSchema).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  dryRun: z.boolean().optional(),
});

const filtersSchema = z.object({
  entityType: entityTypeSchema.optional(),
  entityId: z.coerce.number().int().positive().optional(),
  riskLevel: z.enum(["none", "low", "medium", "high", "critical"]).optional(),
  status: z
    .enum(["pending", "calculated", "stale", "reviewed", "accepted", "superseded", "failed"])
    .optional(),
  staleOnly: z.boolean().optional(),
  unreviewedOnly: z.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const reviewSchema = z.object({
  scoreId: z.coerce.number().int().positive(),
  decision: z.enum([
    "accepted",
    "needs_more_review",
    "false_positive_signal",
    "manual_override_note",
  ]),
  reviewNotes: z.string().max(2000).optional(),
});

const staleSchema = z.object({
  scoreId: z.coerce.number().int().positive(),
  reason: z.string().max(500).optional(),
});

function canViewRisk(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return (
    hasPermission(ctx, "ai.risk.view") ||
    hasPermission(ctx, "ai.common.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

function canGenerateRisk(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return (
    hasPermission(ctx, "ai.risk.generate") ||
    hasPermission(ctx, "ai.common.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

function canReviewRisk(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return (
    hasPermission(ctx, "ai.risk.review") ||
    hasPermission(ctx, "ai.common.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

function isAdminViewer(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return ctx.roleCodes.includes("system_admin") || hasPermission(ctx, "ai.common.admin");
}

async function isRiskScoreEnabled(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "ERP_AI_RISK_SCORE")
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled === true;
  } catch {
    return false;
  }
}

function mapScoreRow(row: Record<string, unknown>, entityLabel: string | null = null): RiskScoreRow {
  const calculatedAt = row.calculated_at as string;
  const staleAt = (row.stale_at as string | null) ?? null;
  const status = row.status as RiskScoreStatus;
  return {
    id: row.id as number,
    entityType: row.entity_type as RiskEntityType,
    entityId: row.entity_id as number,
    entityLabel,
    riskScore: Number(row.risk_score),
    riskLevel: row.risk_level as RiskLevel,
    riskConfidence: Number(row.risk_confidence),
    calculationMethod: row.calculation_method as string,
    status,
    reviewDecision: (row.review_decision as RiskReviewDecision | null) ?? null,
    reviewNotes: (row.review_notes as string | null) ?? null,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    calculatedAt,
    staleAt,
    staleReason: (row.stale_reason as string | null) ?? null,
    isStale: computeIsStale(calculatedAt, staleAt, status),
  };
}

async function resolveEntityLabel(
  supabase: ReturnType<typeof createAdminClient>,
  entityType: string,
  entityId: number
): Promise<string | null> {
  if (entityType === "party") {
    const { data } = await supabase.from("parties").select("display_name").eq("id", entityId).maybeSingle();
    return (data as { display_name?: string } | null)?.display_name ?? null;
  }
  if (entityType === "company") {
    const { data } = await supabase
      .from("owner_companies")
      .select("trade_name, legal_name_en")
      .eq("id", entityId)
      .maybeSingle();
    const row = data as { trade_name?: string; legal_name_en?: string } | null;
    return row?.trade_name ?? row?.legal_name_en ?? null;
  }
  if (entityType === "branch") {
    const { data } = await supabase.from("branches").select("branch_name_en").eq("id", entityId).maybeSingle();
    return (data as { branch_name_en?: string } | null)?.branch_name_en ?? null;
  }
  if (entityType === "site") {
    const { data } = await supabase.from("work_sites").select("site_name").eq("id", entityId).maybeSingle();
    return (data as { site_name?: string } | null)?.site_name ?? null;
  }
  if (entityType === "dms_document") {
    const { data } = await supabase
      .from("dms_documents")
      .select("document_no, title")
      .eq("id", entityId)
      .maybeSingle();
    const row = data as { document_no?: string; title?: string } | null;
    return row?.document_no ?? row?.title ?? null;
  }
  return null;
}

async function insertRiskScoreEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    riskScoreId: number;
    eventType: string;
    actorId: number;
    priorScore?: number | null;
    priorLevel?: string | null;
    newScore?: number | null;
    newLevel?: string | null;
    notes?: string | null;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  await supabase.from("erp_ai_risk_score_events").insert({
    risk_score_id: input.riskScoreId,
    event_type: input.eventType,
    actor_id: input.actorId,
    prior_risk_score: input.priorScore ?? null,
    prior_risk_level: input.priorLevel ?? null,
    new_risk_score: input.newScore ?? null,
    new_risk_level: input.newLevel ?? null,
    notes: input.notes ?? null,
    event_payload_json: input.payload ?? {},
  });
}

async function buildCalculationInput(
  supabase: Awaited<ReturnType<typeof createClient>>,
  admin: ReturnType<typeof createAdminClient>,
  entityType: RiskEntityType,
  entityId: number,
  ctx: Awaited<ReturnType<typeof getAuthContext>>
) {
  const isAdmin = isAdminViewer(ctx);

  if (entityType === "dms_document") {
    const { data: doc } = await supabase
      .from("dms_documents")
      .select(`
        id, document_no, ai_risk_score, ai_risk_level, ai_risk_reasons_json,
        completeness_score, expiry_date, ocr_text_available,
        ai_summary_status, summary_embedding_status, confidentiality_level
      `)
      .eq("id", entityId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!doc) throw new Error("Document not found");

    const d = doc as Record<string, unknown>;

    const { data: findings } = await supabase
      .from("erp_ai_compliance_findings")
      .select("finding_type, severity")
      .eq("document_id", entityId)
      .eq("status", "open")
      .is("deleted_at", null);

    const { count: dupCount } = await supabase
      .from("erp_ai_duplicate_candidates")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .is("deleted_at", null)
      .or(
        `source_document_id.eq.${entityId},` +
          `and(entity_type_a.eq.dms_document,entity_id_a.eq.${entityId}),` +
          `and(entity_type_b.eq.dms_document,entity_id_b.eq.${entityId})`
      );

    return {
      entityType,
      entityId,
      isAdminViewer: isAdmin,
      linkedDocuments: [],
      complianceFindings: (findings ?? []).map((f: Record<string, unknown>) => ({
        findingType: f.finding_type as string,
        severity: f.severity as string,
      })),
      complianceSummary: {
        missingRequiredDocuments: 0,
        expiredDocuments: 0,
        expiringSoonDocuments: 0,
        highRiskDocuments: 0,
        criticalRiskDocuments: 0,
        openComplianceFindings: findings?.length ?? 0,
      },
      pendingDuplicateCount: dupCount ?? 0,
      pendingFieldConflictCount: 0,
      manualNonCompliant: false,
      understandingHealthScore: null,
      dmsDocumentRisk: {
        aiRiskScore: d.ai_risk_score != null ? Number(d.ai_risk_score) : null,
        aiRiskLevel: (d.ai_risk_level as string | null) ?? null,
        aiRiskReasonsJson: d.ai_risk_reasons_json,
      },
    };
  }

  const linkedDocsRaw = await loadLinkedDocuments(admin, entityType, entityId);
  const linkedDocuments = linkedDocsRaw.slice(0, 500).map((d) => ({
    documentId: d.id,
    documentNo: d.documentNo,
    expiryDate: d.expiryDate,
    aiRiskLevel: d.aiRiskLevel,
    completenessScore: d.completenessScore,
    ocrTextAvailable: d.ocrTextAvailable,
    aiSummaryStatus: d.aiSummaryStatus,
    summaryEmbeddingStatus: d.summaryEmbeddingStatus,
    confidentialityLevel: d.confidentialityLevel,
  }));

  const rules = await loadRulesForEntityType(admin, entityType);
  const missingRequiredDocuments = countMissingRequiredDocuments({
    entityType,
    rules,
    linkedDocuments: linkedDocsRaw,
  });

  const now = new Date();
  const soonThreshold = new Date(now);
  soonThreshold.setDate(soonThreshold.getDate() + 30);

  let expiredDocuments = 0;
  let expiringSoonDocuments = 0;
  let highRiskDocuments = 0;
  let criticalRiskDocuments = 0;

  for (const doc of linkedDocsRaw) {
    if (doc.expiryDate) {
      const expiry = new Date(doc.expiryDate);
      if (expiry < now) expiredDocuments++;
      else if (expiry <= soonThreshold) expiringSoonDocuments++;
    }
    if (doc.aiRiskLevel === "high") highRiskDocuments++;
    if (doc.aiRiskLevel === "critical") criticalRiskDocuments++;
  }

  const { data: findings } = await supabase
    .from("erp_ai_compliance_findings")
    .select("finding_type, severity")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("status", "open")
    .is("deleted_at", null);

  const { count: dupCount } = await supabase
    .from("erp_ai_duplicate_candidates")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .is("deleted_at", null)
    .or(
      `and(entity_type_a.eq.${entityType},entity_id_a.eq.${entityId}),` +
        `and(entity_type_b.eq.${entityType},entity_id_b.eq.${entityId})`
    );

  const { count: fieldConflictCount } = await supabase
    .from("erp_ai_field_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("status", "pending")
    .eq("suggestion_type", "conflict_detected")
    .is("deleted_at", null);

  let manualNonCompliant = false;
  if (entityType === "company") {
    const { data: company } = await supabase
      .from("owner_companies")
      .select("compliance_status")
      .eq("id", entityId)
      .maybeSingle();
    manualNonCompliant =
      (company as { compliance_status?: string } | null)?.compliance_status === "non_compliant";
  }

  return {
    entityType,
    entityId,
    isAdminViewer: isAdmin,
    linkedDocuments,
    complianceFindings: (findings ?? []).map((f: Record<string, unknown>) => ({
      findingType: f.finding_type as string,
      severity: f.severity as string,
    })),
    complianceSummary: {
      missingRequiredDocuments,
      expiredDocuments,
      expiringSoonDocuments,
      highRiskDocuments,
      criticalRiskDocuments,
      openComplianceFindings: findings?.length ?? 0,
    },
    pendingDuplicateCount: dupCount ?? 0,
    pendingFieldConflictCount: fieldConflictCount ?? 0,
    manualNonCompliant,
    understandingHealthScore: null,
  };
}

async function persistRiskScore(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    entityType: RiskEntityType;
    entityId: number;
    result: RiskScoreResult;
    actorId: number;
    dryRun: boolean;
  }
): Promise<{ scoreId: number; isRecalc: boolean } | null> {
  if (input.dryRun) return null;

  const stored = buildStoredRiskJson(input.result);
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("erp_ai_risk_scores")
    .select("id, risk_score, risk_level, status")
    .eq("entity_type", input.entityType)
    .eq("entity_id", input.entityId)
    .is("deleted_at", null)
    .not("status", "in", '("superseded","failed")')
    .maybeSingle();

  const isRecalc = !!existing;

  if (existing) {
    const prior = existing as { id: number; risk_score: number; risk_level: string };
    const { error } = await supabase
      .from("erp_ai_risk_scores")
      .update({
        risk_score: input.result.riskScore,
        risk_level: input.result.riskLevel,
        risk_confidence: input.result.riskConfidence,
        calculation_method: input.result.calculationMethod,
        risk_reasons_json: stored.riskReasonsJson,
        risk_breakdown_json: stored.riskBreakdownJson,
        source_counts_json: stored.sourceCountsJson,
        status: "calculated",
        calculated_at: now,
        calculated_by: input.actorId,
        updated_by: input.actorId,
        stale_at: null,
        stale_reason: null,
        review_decision: null,
        review_notes: null,
        reviewed_by: null,
        reviewed_at: null,
      })
      .eq("id", prior.id);

    if (error) throw new Error(error.message);

    await insertRiskScoreEvent(supabase, {
      riskScoreId: prior.id,
      eventType: "recalculated",
      actorId: input.actorId,
      priorScore: Number(prior.risk_score),
      priorLevel: prior.risk_level,
      newScore: input.result.riskScore,
      newLevel: input.result.riskLevel,
    });

    return { scoreId: prior.id, isRecalc: true };
  }

  const { data: inserted, error } = await supabase
    .from("erp_ai_risk_scores")
    .insert({
      entity_type: input.entityType,
      entity_id: input.entityId,
      risk_score: input.result.riskScore,
      risk_level: input.result.riskLevel,
      risk_confidence: input.result.riskConfidence,
      calculation_method: input.result.calculationMethod,
      risk_reasons_json: stored.riskReasonsJson,
      risk_breakdown_json: stored.riskBreakdownJson,
      source_counts_json: stored.sourceCountsJson,
      status: "calculated",
      calculated_at: now,
      calculated_by: input.actorId,
      created_by: input.actorId,
      updated_by: input.actorId,
    })
    .select("id")
    .single();

  if (error || !inserted) throw new Error(error?.message ?? "Failed to save risk score");

  const scoreId = (inserted as { id: number }).id;
  await insertRiskScoreEvent(supabase, {
    riskScoreId: scoreId,
    eventType: "calculated",
    actorId: input.actorId,
    newScore: input.result.riskScore,
    newLevel: input.result.riskLevel,
  });

  return { scoreId, isRecalc: false };
}

export async function calculateRiskForEntity(
  input: z.infer<typeof calculateEntitySchema>
): Promise<ActionResult<RiskScoreResult & { scoreId?: number; dryRun: boolean }>> {
  try {
    const parsed = calculateEntitySchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid input." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canGenerateRisk(ctx)) return { success: false, error: "Permission denied.", code: "PERMISSION_DENIED" };

    const enabled = await isRiskScoreEnabled();
    if (!enabled) {
      return {
        success: false,
        error: "Risk scoring is disabled. Enable ERP_AI_RISK_SCORE in AI Settings for UAT.",
        code: "FEATURE_DISABLED",
      };
    }

    const dryRun = parsed.data.dryRun ?? false;
    const supabase = await createClient();
    const admin = createAdminClient();

    await logAudit({
      module_code: "ai",
      entity_name: "risk_calculation",
      entity_id: parsed.data.entityId,
      entity_reference: `${parsed.data.entityType}:${parsed.data.entityId}`,
      action: "ai_risk_calculation_started",
      new_values: { entityType: parsed.data.entityType, entityId: parsed.data.entityId, dryRun },
    });

    const calcInput = await buildCalculationInput(
      supabase,
      admin,
      parsed.data.entityType,
      parsed.data.entityId,
      ctx
    );
    const result = calculateEntityRisk(calcInput);

    const persisted = await persistRiskScore(supabase, {
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      result,
      actorId: ctx.profile.id,
      dryRun,
    });

    await logAudit({
      module_code: "ai",
      entity_name: "risk_calculation",
      entity_id: persisted?.scoreId ?? parsed.data.entityId,
      entity_reference: `${parsed.data.entityType}:${parsed.data.entityId}`,
      action: "ai_risk_calculation_completed",
      new_values: {
        riskScore: result.riskScore,
        riskLevel: result.riskLevel,
        dryRun,
        scoreId: persisted?.scoreId,
      },
    });

    revalidatePath("/admin/ai/risk");

    return {
      success: true,
      data: { ...result, scoreId: persisted?.scoreId, dryRun },
    };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

async function loadEntityIdsForBatch(
  admin: ReturnType<typeof createAdminClient>,
  entityTypes: RiskEntityType[],
  limit: number
): Promise<Array<{ entityType: RiskEntityType; entityId: number }>> {
  const items: Array<{ entityType: RiskEntityType; entityId: number }> = [];
  const perType = Math.ceil(limit / entityTypes.length);

  for (const entityType of entityTypes) {
    if (items.length >= limit) break;

    let table: string;
    switch (entityType) {
      case "company":
        table = "owner_companies";
        break;
      case "party":
        table = "parties";
        break;
      case "branch":
        table = "branches";
        break;
      case "site":
        table = "work_sites";
        break;
      case "dms_document":
        table = "dms_documents";
        break;
      default:
        continue;
    }

    const { data } = await admin
      .from(table)
      .select("id")
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .limit(perType);

    for (const row of data ?? []) {
      items.push({ entityType, entityId: (row as { id: number }).id });
      if (items.length >= limit) break;
    }
  }

  return items.slice(0, limit);
}

export async function calculateRiskScores(
  input: z.infer<typeof calculateBatchSchema>
): Promise<ActionResult<RiskBatchCalculationResult>> {
  try {
    const parsed = calculateBatchSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid batch input." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canGenerateRisk(ctx)) return { success: false, error: "Permission denied.", code: "PERMISSION_DENIED" };

    const enabled = await isRiskScoreEnabled();
    if (!enabled) {
      return {
        success: false,
        error: "Risk scoring is disabled. Enable ERP_AI_RISK_SCORE in AI Settings for UAT.",
        code: "FEATURE_DISABLED",
      };
    }

    const dryRun = parsed.data.dryRun ?? false;
    const limit = parsed.data.limit ?? 100;
    const entityTypes = parsed.data.entityTypes ?? (["company", "party", "branch", "site"] as RiskEntityType[]);

    const supabase = await createClient();
    const admin = createAdminClient();
    const entities = await loadEntityIdsForBatch(admin, entityTypes, limit);

    const results: RiskBatchCalculationResult["results"] = [];
    let succeeded = 0;
    let failed = 0;

    for (const { entityType, entityId } of entities) {
      try {
        const calcInput = await buildCalculationInput(supabase, admin, entityType, entityId, ctx);
        const result = calculateEntityRisk(calcInput);
        await persistRiskScore(supabase, {
          entityType,
          entityId,
          result,
          actorId: ctx.profile.id,
          dryRun,
        });
        results.push({
          entityType,
          entityId,
          success: true,
          riskScore: result.riskScore,
          riskLevel: result.riskLevel,
        });
        succeeded++;
      } catch (e) {
        results.push({
          entityType,
          entityId,
          success: false,
          error: String(e).slice(0, 200),
        });
        failed++;
      }
    }

    revalidatePath("/admin/ai/risk");

    return {
      success: true,
      data: {
        processed: entities.length,
        succeeded,
        failed,
        dryRun,
        results,
      },
    };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

export async function getRiskScores(
  input: z.infer<typeof filtersSchema>
): Promise<ActionResult<{ rows: RiskScoreRow[]; total: number }>> {
  try {
    const parsed = filtersSchema.safeParse(input ?? {});
    if (!parsed.success) return { success: false, error: "Invalid filters." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canViewRisk(ctx)) return { success: false, error: "Permission denied." };

    const supabase = await createClient();
    const admin = createAdminClient();
    const limit = parsed.data.limit ?? 100;
    const offset = parsed.data.offset ?? 0;

    let query = supabase
      .from("erp_ai_risk_scores")
      .select("*", { count: "exact" })
      .is("deleted_at", null)
      .order("calculated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (parsed.data.entityType) query = query.eq("entity_type", parsed.data.entityType);
    if (parsed.data.entityId) query = query.eq("entity_id", parsed.data.entityId);
    if (parsed.data.riskLevel) query = query.eq("risk_level", parsed.data.riskLevel);
    if (parsed.data.status) query = query.eq("status", parsed.data.status);
    if (parsed.data.staleOnly) query = query.or("status.eq.stale,stale_at.not.is.null");
    if (parsed.data.unreviewedOnly) {
      query = query.is("reviewed_at", null).in("status", ["calculated", "stale"]);
    }

    const { data, error, count } = await query;
    if (error) return { success: false, error: error.message };

    const rows: RiskScoreRow[] = [];
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const label = await resolveEntityLabel(
        admin,
        row.entity_type as string,
        row.entity_id as number
      );
      rows.push(mapScoreRow(row, label));
    }

    return { success: true, data: { rows, total: count ?? rows.length } };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

export async function getRiskScoreDetail(
  scoreId: number
): Promise<ActionResult<RiskScoreDetail>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canViewRisk(ctx)) return { success: false, error: "Permission denied." };

    const supabase = await createClient();
    const admin = createAdminClient();

    const { data: row, error } = await supabase
      .from("erp_ai_risk_scores")
      .select("*")
      .eq("id", scoreId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error || !row) return { success: false, error: error?.message ?? "Risk score not found." };

    const r = row as Record<string, unknown>;
    const label = await resolveEntityLabel(admin, r.entity_type as string, r.entity_id as number);

    const { data: events } = await supabase
      .from("erp_ai_risk_score_events")
      .select("*")
      .eq("risk_score_id", scoreId)
      .order("created_at", { ascending: false })
      .limit(50);

    const eventRows: RiskScoreEventRow[] = (events ?? []).map((e: Record<string, unknown>) => ({
      id: e.id as number,
      eventType: e.event_type as string,
      priorRiskScore: e.prior_risk_score != null ? Number(e.prior_risk_score) : null,
      priorRiskLevel: (e.prior_risk_level as string | null) ?? null,
      newRiskScore: e.new_risk_score != null ? Number(e.new_risk_score) : null,
      newRiskLevel: (e.new_risk_level as string | null) ?? null,
      notes: (e.notes as string | null) ?? null,
      actorId: (e.actor_id as number | null) ?? null,
      createdAt: e.created_at as string,
    }));

    const base = mapScoreRow(r, label);

    return {
      success: true,
      data: {
        ...base,
        riskReasons: parseRiskReasonsJson(r.risk_reasons_json),
        riskBreakdown: parseRiskBreakdownJson(r.risk_breakdown_json),
        sourceCounts: parseSourceCountsJson(r.source_counts_json),
        events: eventRows,
      },
    };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

export async function getRiskScoreForEntity(input: {
  entityType: RiskEntityType;
  entityId: number;
}): Promise<ActionResult<RiskScoreRow | null>> {
  try {
    const parsed = z
      .object({ entityType: entityTypeSchema, entityId: z.coerce.number().int().positive() })
      .safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid entity." };

    const ctx = await getAuthContext();
    if (!canViewRisk(ctx)) return { success: false, error: "Permission denied." };

    const supabase = await createClient();
    const admin = createAdminClient();

    const { data: row } = await supabase
      .from("erp_ai_risk_scores")
      .select("*")
      .eq("entity_type", parsed.data.entityType)
      .eq("entity_id", parsed.data.entityId)
      .is("deleted_at", null)
      .not("status", "in", '("superseded","failed")')
      .maybeSingle();

    if (!row) return { success: true, data: null };

    const label = await resolveEntityLabel(
      admin,
      parsed.data.entityType,
      parsed.data.entityId
    );

    return { success: true, data: mapScoreRow(row as Record<string, unknown>, label) };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

export async function getRiskScoreForDocument(
  documentId: number
): Promise<ActionResult<RiskScoreRow | null>> {
  return getRiskScoreForEntity({ entityType: "dms_document", entityId: documentId });
}

export async function reviewRiskScore(
  input: z.infer<typeof reviewSchema>
): Promise<ActionResult> {
  try {
    const parsed = reviewSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid review input." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canReviewRisk(ctx)) return { success: false, error: "Permission denied." };

    const supabase = await createClient();
    const { data: row } = await supabase
      .from("erp_ai_risk_scores")
      .select("id, risk_score, risk_level, status")
      .eq("id", parsed.data.scoreId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!row) return { success: false, error: "Risk score not found." };

    const statusMap: Record<RiskReviewDecision, RiskScoreStatus> = {
      accepted: "accepted",
      needs_more_review: "reviewed",
      false_positive_signal: "reviewed",
      manual_override_note: "reviewed",
    };

    const newStatus = statusMap[parsed.data.decision];
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("erp_ai_risk_scores")
      .update({
        status: newStatus,
        review_decision: parsed.data.decision,
        review_notes: parsed.data.reviewNotes ?? null,
        reviewed_by: ctx.profile.id,
        reviewed_at: now,
        updated_by: ctx.profile.id,
      })
      .eq("id", parsed.data.scoreId);

    if (error) return { success: false, error: error.message };

    const eventType =
      parsed.data.decision === "accepted" ? "accepted" : parsed.data.decision;

    await insertRiskScoreEvent(supabase, {
      riskScoreId: parsed.data.scoreId,
      eventType,
      actorId: ctx.profile.id,
      priorScore: Number((row as { risk_score: number }).risk_score),
      priorLevel: (row as { risk_level: string }).risk_level,
      newScore: Number((row as { risk_score: number }).risk_score),
      newLevel: (row as { risk_level: string }).risk_level,
      notes: parsed.data.reviewNotes ?? null,
    });

    await logAudit({
      module_code: "ai",
      entity_name: "erp_ai_risk_scores",
      entity_id: parsed.data.scoreId,
      entity_reference: String(parsed.data.scoreId),
      action: "ai_risk_score_reviewed",
      new_values: { decision: parsed.data.decision },
    });

    revalidatePath("/admin/ai/risk");
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

export async function markRiskScoreStale(
  input: z.infer<typeof staleSchema>
): Promise<ActionResult> {
  try {
    const parsed = staleSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid input." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canGenerateRisk(ctx)) return { success: false, error: "Permission denied." };

    const supabase = await createClient();
    const now = new Date().toISOString();

    const { data: row } = await supabase
      .from("erp_ai_risk_scores")
      .select("id, risk_score, risk_level")
      .eq("id", parsed.data.scoreId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!row) return { success: false, error: "Risk score not found." };

    const { error } = await supabase
      .from("erp_ai_risk_scores")
      .update({
        status: "stale",
        stale_at: now,
        stale_reason: parsed.data.reason ?? "Manually marked stale",
        updated_by: ctx.profile.id,
      })
      .eq("id", parsed.data.scoreId);

    if (error) return { success: false, error: error.message };

    await insertRiskScoreEvent(supabase, {
      riskScoreId: parsed.data.scoreId,
      eventType: "marked_stale",
      actorId: ctx.profile.id,
      priorScore: Number((row as { risk_score: number }).risk_score),
      priorLevel: (row as { risk_level: string }).risk_level,
      newScore: Number((row as { risk_score: number }).risk_score),
      newLevel: (row as { risk_level: string }).risk_level,
      notes: parsed.data.reason ?? null,
    });

    await logAudit({
      module_code: "ai",
      entity_name: "erp_ai_risk_scores",
      entity_id: parsed.data.scoreId,
      entity_reference: String(parsed.data.scoreId),
      action: "ai_risk_score_marked_stale",
    });

    revalidatePath("/admin/ai/risk");
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

export async function getRiskScoreCountForEntity(input: {
  entityType: "party" | "company";
  entityId: number;
}): Promise<
  ActionResult<{
    hasScore: boolean;
    riskScore: number | null;
    riskLevel: RiskLevel | null;
    isStale: boolean;
    needsReview: boolean;
  }>
> {
  try {
    const res = await getRiskScoreForEntity({
      entityType: input.entityType,
      entityId: input.entityId,
    });
    if (!res.success) return res as ActionResult<never>;

    const score = res.data;
    if (!score) {
      return {
        success: true,
        data: {
          hasScore: false,
          riskScore: null,
          riskLevel: null,
          isStale: false,
          needsReview: false,
        },
      };
    }

    const needsReview =
      score.riskLevel === "high" ||
      score.riskLevel === "critical" ||
      score.riskScore >= 50;

    return {
      success: true,
      data: {
        hasScore: true,
        riskScore: score.riskScore,
        riskLevel: score.riskLevel,
        isStale: score.isStale,
        needsReview,
      },
    };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

export async function getRiskScoreSummary(): Promise<
  ActionResult<{
    critical: number;
    high: number;
    stale: number;
    unreviewed: number;
    featureEnabled: boolean;
  }>
> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canViewRisk(ctx)) return { success: false, error: "Permission denied." };

    const supabase = await createClient();
    const featureEnabled = await isRiskScoreEnabled();

    const { count: criticalCount } = await supabase
      .from("erp_ai_risk_scores")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("risk_level", "critical");

    const { count: highCount } = await supabase
      .from("erp_ai_risk_scores")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("risk_level", "high");

    const { count: staleCount } = await supabase
      .from("erp_ai_risk_scores")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .or("status.eq.stale,stale_at.not.is.null");

    const { count: unreviewedCount } = await supabase
      .from("erp_ai_risk_scores")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .is("reviewed_at", null)
      .in("status", ["calculated", "stale"]);

    return {
      success: true,
      data: {
        critical: criticalCount ?? 0,
        high: highCount ?? 0,
        stale: staleCount ?? 0,
        unreviewed: unreviewedCount ?? 0,
        featureEnabled,
      },
    };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

export async function isRiskScoringEnabled(): Promise<boolean> {
  return isRiskScoreEnabled();
}
