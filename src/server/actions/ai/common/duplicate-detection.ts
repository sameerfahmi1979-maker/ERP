"use server";

/**
 * ERP COMMON AI.3 — Duplicate / Conflict Detection Server Actions
 *
 * Review candidates only — no auto-merge/update/delete/unlink.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import {
  runDuplicateScan,
  runEntityDuplicateScan,
  insertDuplicateCandidateEvent,
} from "@/lib/ai/common/duplicate-detection";
import type {
  DuplicateCandidateDetail,
  DuplicateCandidateFilters,
  DuplicateCandidateRow,
  DuplicateCandidateStatus,
  DuplicateCandidateType,
  DuplicateReviewDecision,
  DuplicateScanResult,
} from "@/lib/ai/common/duplicate-detection";

export type ActionResult<T = undefined> = T extends undefined
  ? { success: boolean; error?: string; code?: string }
  : { success: boolean; data?: T; error?: string; code?: string };

const CONFIDENTIAL_LEVELS = ["hr", "legal", "executive"];

const scanInputSchema = z.object({
  includeAiRules: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  aiCallLimit: z.coerce.number().int().min(1).max(50).optional(),
  supersedeExisting: z.boolean().optional(),
});

const entityScanInputSchema = scanInputSchema.extend({
  entityType: z.enum(["party", "company", "branch", "site", "dms_document"]),
  entityId: z.coerce.number().int().positive(),
});

const filtersSchema = z.object({
  status: z
    .enum([
      "pending",
      "reviewed",
      "confirmed_duplicate",
      "confirmed_conflict",
      "ignored",
      "resolved",
      "superseded",
      "failed",
    ])
    .optional(),
  candidateType: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.coerce.number().int().positive().optional(),
  documentId: z.coerce.number().int().positive().optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  maxConfidence: z.coerce.number().min(0).max(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const reviewInputSchema = z.object({
  candidateId: z.coerce.number().int().positive(),
  decision: z.enum([
    "confirmed_duplicate",
    "confirmed_conflict",
    "not_duplicate",
    "needs_more_review",
    "ignored",
  ]),
  reviewNotes: z.string().max(2000).optional(),
});

function canViewDuplicates(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return (
    hasPermission(ctx, "ai.duplicates.view") ||
    hasPermission(ctx, "ai.common.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

function canReviewDuplicates(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return (
    hasPermission(ctx, "ai.duplicates.review") ||
    hasPermission(ctx, "ai.common.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

function canAdminScan(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return hasPermission(ctx, "ai.common.admin") || ctx.roleCodes.includes("system_admin");
}

async function isDuplicateDetectEnabled(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "ERP_AI_DUPLICATE_DETECT")
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled === true;
  } catch {
    return false;
  }
}

function mapCandidateRow(row: Record<string, unknown>): DuplicateCandidateRow {
  return {
    id: row.id as number,
    candidateType: row.candidate_type as DuplicateCandidateType,
    detectionMethod: row.detection_method as DuplicateCandidateRow["detectionMethod"],
    candidateKey: row.candidate_key as string,
    entityTypeA: row.entity_type_a as string,
    entityIdA: row.entity_id_a as number,
    entityTypeB: (row.entity_type_b as string | null) ?? null,
    entityIdB: (row.entity_id_b as number | null) ?? null,
    conflictField: (row.conflict_field as string | null) ?? null,
    valueA: (row.value_a as string | null) ?? null,
    valueB: (row.value_b as string | null) ?? null,
    confidenceScore: Number(row.confidence_score),
    evidenceJson: (row.evidence_json as Record<string, unknown> | null) ?? null,
    aiReason: (row.ai_reason as string | null) ?? null,
    sourceDocumentId: (row.source_document_id as number | null) ?? null,
    status: row.status as DuplicateCandidateStatus,
    reviewDecision: (row.review_decision as DuplicateReviewDecision | null) ?? null,
    reviewNotes: (row.review_notes as string | null) ?? null,
    reviewedBy: (row.reviewed_by as number | null) ?? null,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    resolvedBy: (row.resolved_by as number | null) ?? null,
    resolvedAt: (row.resolved_at as string | null) ?? null,
    createdAt: row.created_at as string,
    createdBy: (row.created_by as number | null) ?? null,
    updatedAt: row.updated_at as string,
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
    const { data } = await supabase.from("owner_companies").select("trade_name, legal_name_en").eq("id", entityId).maybeSingle();
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
    const { data } = await supabase.from("dms_documents").select("document_no, title").eq("id", entityId).maybeSingle();
    const row = data as { document_no?: string; title?: string } | null;
    return row?.document_no ?? row?.title ?? null;
  }
  return null;
}

export async function scanForDuplicates(
  input: z.infer<typeof scanInputSchema>
): Promise<ActionResult<DuplicateScanResult>> {
  try {
    const parsed = scanInputSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid scan input." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canAdminScan(ctx)) return { success: false, error: "Permission denied.", code: "PERMISSION_DENIED" };

    const enabled = await isDuplicateDetectEnabled();
    if (!enabled) {
      return {
        success: false,
        error: "Duplicate detection is disabled. Enable ERP_AI_DUPLICATE_DETECT in AI Settings for UAT.",
        code: "FEATURE_DISABLED",
      };
    }

    await logAudit({
      module_code: "ai",
      entity_name: "duplicate_scan",
      entity_id: 0,
      entity_reference: "full_scan",
      action: "ai_duplicate_scan_started",
      new_values: {
        includeAiRules: parsed.data.includeAiRules ?? false,
        dryRun: parsed.data.dryRun ?? false,
      },
    });

    const supabase = createAdminClient();
    const result = await runDuplicateScan(
      supabase,
      {
        scope: "full",
        includeAiRules: parsed.data.includeAiRules,
        dryRun: parsed.data.dryRun,
        limit: parsed.data.limit,
        aiCallLimit: parsed.data.aiCallLimit,
        supersedeExisting: parsed.data.supersedeExisting ?? true,
      },
      ctx.profile.id
    );

    await logAudit({
      module_code: "ai",
      entity_name: "duplicate_scan",
      entity_id: 0,
      entity_reference: "full_scan",
      action: "ai_duplicate_scan_completed",
      new_values: {
        deterministicDetected: result.deterministicDetected,
        aiDetected: result.aiDetected,
        inserted: result.inserted,
        dryRun: result.dryRun,
      },
    });

    revalidatePath("/admin/ai/duplicates");
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

export async function scanDuplicateCandidatesForEntity(
  input: z.infer<typeof entityScanInputSchema>
): Promise<ActionResult<DuplicateScanResult>> {
  try {
    const parsed = entityScanInputSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid entity scan input." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canAdminScan(ctx)) return { success: false, error: "Permission denied.", code: "PERMISSION_DENIED" };

    const enabled = await isDuplicateDetectEnabled();
    if (!enabled) {
      return {
        success: false,
        error: "Duplicate detection is disabled. Enable ERP_AI_DUPLICATE_DETECT in AI Settings.",
        code: "FEATURE_DISABLED",
      };
    }

    const supabase = createAdminClient();
    const result = await runEntityDuplicateScan(supabase, {
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      includeAiRules: parsed.data.includeAiRules,
      dryRun: parsed.data.dryRun,
      actorUserProfileId: ctx.profile.id,
    });

    revalidatePath("/admin/ai/duplicates");
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

export async function getDuplicateCandidates(
  filters: DuplicateCandidateFilters = {}
): Promise<ActionResult<{ rows: DuplicateCandidateRow[]; total: number }>> {
  try {
    const parsed = filtersSchema.safeParse(filters);
    if (!parsed.success) return { success: false, error: "Invalid filters." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canViewDuplicates(ctx)) return { success: false, error: "Permission denied.", code: "PERMISSION_DENIED" };

    const supabase = await createClient();
    let query = supabase
      .from("erp_ai_duplicate_candidates")
      .select("*", { count: "exact" })
      .is("deleted_at", null)
      .order("confidence_score", { ascending: false })
      .order("created_at", { ascending: false });

    const f = parsed.data;
    if (f.status) query = query.eq("status", f.status);
    if (f.candidateType) query = query.eq("candidate_type", f.candidateType);
    if (f.entityType && f.entityId) {
      query = query.or(
        `and(entity_type_a.eq.${f.entityType},entity_id_a.eq.${f.entityId}),` +
          `and(entity_type_b.eq.${f.entityType},entity_id_b.eq.${f.entityId})`
      );
    }
    if (f.documentId) query = query.eq("source_document_id", f.documentId);
    if (f.minConfidence != null) query = query.gte("confidence_score", f.minConfidence);
    if (f.maxConfidence != null) query = query.lte("confidence_score", f.maxConfidence);

    const limit = f.limit ?? 50;
    const offset = f.offset ?? 0;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) return { success: false, error: "Failed to load candidates." };

    return {
      success: true,
      data: {
        rows: (data ?? []).map((r) => mapCandidateRow(r as Record<string, unknown>)),
        total: count ?? 0,
      },
    };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

export async function getDuplicateCandidateDetail(
  candidateId: number
): Promise<ActionResult<DuplicateCandidateDetail>> {
  try {
    const idParsed = z.number().int().positive().safeParse(candidateId);
    if (!idParsed.success) return { success: false, error: "Invalid candidate ID." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canViewDuplicates(ctx)) return { success: false, error: "Permission denied.", code: "PERMISSION_DENIED" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("erp_ai_duplicate_candidates")
      .select("*")
      .eq("id", idParsed.data)
      .is("deleted_at", null)
      .maybeSingle();

    if (error || !data) return { success: false, error: "Candidate not found." };

    const row = mapCandidateRow(data as Record<string, unknown>);
    const admin = createAdminClient();

    let sourceDocumentNo: string | null = null;
    let sourceDocumentTitle: string | null = null;
    if (row.sourceDocumentId) {
      const { data: doc } = await admin
        .from("dms_documents")
        .select("document_no, title, confidentiality_level")
        .eq("id", row.sourceDocumentId)
        .maybeSingle();
      const docRow = doc as { document_no?: string; title?: string; confidentiality_level?: string } | null;
      const isConfidential =
        docRow?.confidentiality_level &&
        CONFIDENTIAL_LEVELS.includes(docRow.confidentiality_level) &&
        !hasPermission(ctx, "dms.admin") &&
        !ctx.roleCodes.includes("system_admin");

      if (!isConfidential && docRow) {
        sourceDocumentNo = docRow.document_no ?? null;
        sourceDocumentTitle = docRow.title?.slice(0, 120) ?? null;
      } else if (docRow) {
        sourceDocumentNo = docRow.document_no ?? null;
        sourceDocumentTitle = "[Confidential document]";
      }
    }

    const { data: events } = await supabase
      .from("erp_ai_duplicate_candidate_events")
      .select("id, event_type, event_data_json, actor_user_id, created_at")
      .eq("candidate_id", idParsed.data)
      .order("created_at", { ascending: false })
      .limit(20);

    const detail: DuplicateCandidateDetail = {
      ...row,
      entityLabelA: await resolveEntityLabel(admin, row.entityTypeA, row.entityIdA),
      entityLabelB:
        row.entityTypeB && row.entityIdB
          ? await resolveEntityLabel(admin, row.entityTypeB, row.entityIdB)
          : null,
      sourceDocumentNo,
      sourceDocumentTitle,
      events: (events ?? []).map((e) => ({
        id: (e as { id: number }).id,
        eventType: (e as { event_type: string }).event_type,
        eventDataJson: (e as { event_data_json: Record<string, unknown> | null }).event_data_json,
        actorUserId: (e as { actor_user_id: number | null }).actor_user_id,
        createdAt: (e as { created_at: string }).created_at,
      })),
    };

    return { success: true, data: detail };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

export async function reviewDuplicateCandidate(
  input: z.infer<typeof reviewInputSchema>
): Promise<ActionResult> {
  try {
    const parsed = reviewInputSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid review input." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canReviewDuplicates(ctx)) return { success: false, error: "Permission denied.", code: "PERMISSION_DENIED" };

    const statusMap: Record<string, DuplicateCandidateStatus> = {
      confirmed_duplicate: "confirmed_duplicate",
      confirmed_conflict: "confirmed_conflict",
      not_duplicate: "ignored",
      needs_more_review: "reviewed",
      ignored: "ignored",
    };

    const newStatus = statusMap[parsed.data.decision];
    const supabase = await createClient();

    const { data: existing, error: loadErr } = await supabase
      .from("erp_ai_duplicate_candidates")
      .select("id, status")
      .eq("id", parsed.data.candidateId)
      .is("deleted_at", null)
      .maybeSingle();

    if (loadErr || !existing) return { success: false, error: "Candidate not found." };

    const { error: updateErr } = await supabase
      .from("erp_ai_duplicate_candidates")
      .update({
        status: newStatus,
        review_decision: parsed.data.decision,
        review_notes: parsed.data.reviewNotes ?? null,
        reviewed_by: ctx.profile.id,
        reviewed_at: new Date().toISOString(),
        updated_by: ctx.profile.id,
      })
      .eq("id", parsed.data.candidateId);

    if (updateErr) return { success: false, error: "Failed to update candidate." };

    await insertDuplicateCandidateEvent(supabase, {
      candidateId: parsed.data.candidateId,
      eventType: parsed.data.decision.startsWith("confirmed") ? "confirmed" : "reviewed",
      eventDataJson: { decision: parsed.data.decision },
      actorUserId: ctx.profile.id,
    });

    await logAudit({
      module_code: "ai",
      entity_name: "duplicate_candidate",
      entity_id: parsed.data.candidateId,
      entity_reference: String(parsed.data.candidateId),
      action: "ai_duplicate_candidate_reviewed",
      new_values: { decision: parsed.data.decision, status: newStatus },
    });

    revalidatePath("/admin/ai/duplicates");
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

export async function markDuplicateCandidateResolved(input: {
  candidateId: number;
  reviewNotes?: string;
}): Promise<ActionResult> {
  try {
    const schema = z.object({
      candidateId: z.coerce.number().int().positive(),
      reviewNotes: z.string().max(2000).optional(),
    });
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid input." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canReviewDuplicates(ctx)) return { success: false, error: "Permission denied.", code: "PERMISSION_DENIED" };

    const supabase = await createClient();
    const { error } = await supabase
      .from("erp_ai_duplicate_candidates")
      .update({
        status: "resolved",
        review_notes: parsed.data.reviewNotes ?? null,
        resolved_by: ctx.profile.id,
        resolved_at: new Date().toISOString(),
        updated_by: ctx.profile.id,
      })
      .eq("id", parsed.data.candidateId)
      .is("deleted_at", null);

    if (error) return { success: false, error: "Failed to resolve candidate." };

    await insertDuplicateCandidateEvent(supabase, {
      candidateId: parsed.data.candidateId,
      eventType: "resolved",
      actorUserId: ctx.profile.id,
    });

    await logAudit({
      module_code: "ai",
      entity_name: "duplicate_candidate",
      entity_id: parsed.data.candidateId,
      entity_reference: String(parsed.data.candidateId),
      action: "ai_duplicate_candidate_resolved",
    });

    revalidatePath("/admin/ai/duplicates");
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

export async function ignoreDuplicateCandidate(input: {
  candidateId: number;
  reviewNotes?: string;
}): Promise<ActionResult> {
  return reviewDuplicateCandidate({
    candidateId: input.candidateId,
    decision: "ignored",
    reviewNotes: input.reviewNotes,
  });
}

export async function supersedeDuplicateCandidates(input?: {
  entityType?: string;
  entityId?: number;
}): Promise<ActionResult<{ superseded: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canAdminScan(ctx)) return { success: false, error: "Permission denied.", code: "PERMISSION_DENIED" };

    const supabase = await createClient();
    let query = supabase
      .from("erp_ai_duplicate_candidates")
      .update({
        status: "superseded",
        updated_by: ctx.profile.id,
        updated_at: new Date().toISOString(),
      })
      .eq("status", "pending")
      .is("deleted_at", null);

    if (input?.entityType && input?.entityId) {
      query = query.or(
        `and(entity_type_a.eq.${input.entityType},entity_id_a.eq.${input.entityId}),` +
          `and(entity_type_b.eq.${input.entityType},entity_id_b.eq.${input.entityId})`
      );
    }

    const { data, error } = await query.select("id");
    if (error) return { success: false, error: "Failed to supersede candidates." };

    await logAudit({
      module_code: "ai",
      entity_name: "duplicate_candidates",
      entity_id: 0,
      entity_reference: "supersede",
      action: "ai_duplicate_candidates_superseded",
      new_values: { count: data?.length ?? 0 },
    });

    revalidatePath("/admin/ai/duplicates");
    return { success: true, data: { superseded: data?.length ?? 0 } };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

async function countPendingForEntity(
  entityType: string,
  entityId: number
): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("erp_ai_duplicate_candidates")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .is("deleted_at", null)
    .or(
      `and(entity_type_a.eq.${entityType},entity_id_a.eq.${entityId}),` +
        `and(entity_type_b.eq.${entityType},entity_id_b.eq.${entityId})`
    );

  if (error) return 0;
  return count ?? 0;
}

export async function getDuplicateCandidateCountForEntity(input: {
  entityType: string;
  entityId: number;
}): Promise<ActionResult<{ pendingCount: number }>> {
  try {
    const schema = z.object({
      entityType: z.enum(["party", "company", "branch", "site"]),
      entityId: z.coerce.number().int().positive(),
    });
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid input." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canViewDuplicates(ctx)) return { success: true, data: { pendingCount: 0 } };

    const pendingCount = await countPendingForEntity(parsed.data.entityType, parsed.data.entityId);
    return { success: true, data: { pendingCount } };
  } catch {
    return { success: true, data: { pendingCount: 0 } };
  }
}

export async function getDuplicateCandidateCountForDocument(
  documentId: number
): Promise<ActionResult<{ pendingCount: number }>> {
  try {
    const idParsed = z.number().int().positive().safeParse(documentId);
    if (!idParsed.success) return { success: false, error: "Invalid document ID." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canViewDuplicates(ctx)) return { success: true, data: { pendingCount: 0 } };

    const supabase = await createClient();
    const { count, error } = await supabase
      .from("erp_ai_duplicate_candidates")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .is("deleted_at", null)
      .or(
        `source_document_id.eq.${idParsed.data},` +
          `and(entity_type_a.eq.dms_document,entity_id_a.eq.${idParsed.data}),` +
          `and(entity_type_b.eq.dms_document,entity_id_b.eq.${idParsed.data})`
      );

    if (error) return { success: true, data: { pendingCount: 0 } };
    return { success: true, data: { pendingCount: count ?? 0 } };
  } catch {
    return { success: true, data: { pendingCount: 0 } };
  }
}

export async function isDuplicateDetectionFeatureEnabled(): Promise<boolean> {
  return isDuplicateDetectEnabled();
}

export async function getDuplicateCandidateSummary(): Promise<
  ActionResult<{
    pending: number;
    highConfidence: number;
    confirmed: number;
    ignoredResolved: number;
    featureEnabled: boolean;
  }>
> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canViewDuplicates(ctx)) return { success: false, error: "Permission denied." };

    const supabase = await createClient();
    const featureEnabled = await isDuplicateDetectEnabled();

    const countStatus = async (statusFilter: string | string[]) => {
      let q = supabase
        .from("erp_ai_duplicate_candidates")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null);
      if (Array.isArray(statusFilter)) {
        q = q.in("status", statusFilter);
      } else {
        q = q.eq("status", statusFilter);
      }
      const { count } = await q;
      return count ?? 0;
    };

    const pending = await countStatus("pending");
    const highConfidence = await supabase
      .from("erp_ai_duplicate_candidates")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .gte("confidence_score", 0.9)
      .is("deleted_at", null)
      .then((r) => r.count ?? 0);

    const confirmed = await countStatus(["confirmed_duplicate", "confirmed_conflict"]);
    const ignoredResolved = await countStatus(["ignored", "resolved"]);

    return {
      success: true,
      data: { pending, highConfidence, confirmed, ignoredResolved, featureEnabled },
    };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}
