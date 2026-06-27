"use server";

/**
 * ERP DMS AI Phase 13 — DMS Entity Matching Server Actions
 *
 * Security rules:
 *   - All actions require authentication.
 *   - Read actions require dms.entity_matching.view or higher.
 *   - Run actions require dms.entity_matching.run or higher.
 *   - Review/decision actions require dms.entity_matching.review or higher.
 *   - DMS_AI_ENTITY_MATCHING feature flag gate on run/mutate actions.
 *   - Accepting a candidate does NOT write to dms_documents owner fields.
 *   - Human-review-only. No Apply-to-ERP. No auto-linking.
 *   - Audit logs safe — no OCR/content/AI text.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import {
  runDmsEntityMatchingForDocumentSystem,
  runDmsEntityMatchingForIntakeSessionSystem,
} from "@/lib/dms/entity-matching/entity-matcher";
import type { DmsEntityMatchRunResult, DmsEntityMatchTargetType } from "@/lib/dms/entity-matching/entity-match-types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type EntityMatchCandidate = {
  id:                 number;
  candidateKey:       string | null;
  documentId:         number | null;
  uploadSessionId:    number | null;
  aiResultId:         number | null;
  sourceTextSummary:  string | null;
  matchSignal:        string | null;
  targetEntityType:   string;
  targetEntityId:     number;
  targetDisplayName:  string | null;
  matchScore:         number | null;
  matchMethod:        string | null;
  matchReason:        string | null;
  aiGenerated:        boolean;
  status:             string;
  reviewQueueItemId:  number | null;
  reviewedBy:         number | null;
  reviewedAt:         string | null;
  resolvedAt:         string | null;
  resolutionCode:     string | null;
  resolutionNote:     string | null;
  createdAt:          string;
  updatedAt:          string;
};

export type EntityMatchCandidateFilters = {
  documentId?:       number;
  uploadSessionId?:  number;
  status?:           string[];
  targetEntityType?: DmsEntityMatchTargetType;
  page?:             number;
  pageSize?:         number;
};

export type EntityMatchCandidateDecision = {
  decision: "accepted_for_later_apply" | "rejected" | "false_match";
  note?:    string;
};

export type BulkEntityMatchingInput = {
  documentIds: number[];
};

// ── Feature flag helper ───────────────────────────────────────────────────────

async function isDmsAiEntityMatchingEnabled(): Promise<boolean> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "DMS_AI_ENTITY_MATCHING")
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled === true;
  } catch {
    return false;
  }
}

// ── Permission helpers ────────────────────────────────────────────────────────

function canViewMatching(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return (
    hasPermission(ctx, "dms.entity_matching.view") ||
    hasPermission(ctx, "dms.entity_matching.run") ||
    hasPermission(ctx, "dms.entity_matching.review") ||
    hasPermission(ctx, "dms.entity_matching.admin") ||
    hasPermission(ctx, "dms.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

function canRunMatching(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return (
    hasPermission(ctx, "dms.entity_matching.run") ||
    hasPermission(ctx, "dms.entity_matching.admin") ||
    hasPermission(ctx, "dms.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

function canReviewMatching(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return (
    hasPermission(ctx, "dms.entity_matching.review") ||
    hasPermission(ctx, "dms.entity_matching.admin") ||
    hasPermission(ctx, "dms.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

// ── SELECT fragment ───────────────────────────────────────────────────────────

const CANDIDATE_SELECT = `
  id, candidate_key, document_id, upload_session_id, ai_result_id,
  source_text_summary, match_signal, target_entity_type, target_entity_id,
  target_display_name, match_score, match_method, match_reason, ai_generated,
  status, review_queue_item_id, reviewed_by, reviewed_at, resolved_at,
  resolution_code, resolution_note, created_at, updated_at
` as const;

function mapCandidate(row: Record<string, unknown>): EntityMatchCandidate {
  return {
    id:                 row.id as number,
    candidateKey:       (row.candidate_key as string | null) ?? null,
    documentId:         (row.document_id as number | null) ?? null,
    uploadSessionId:    (row.upload_session_id as number | null) ?? null,
    aiResultId:         (row.ai_result_id as number | null) ?? null,
    sourceTextSummary:  (row.source_text_summary as string | null) ?? null,
    matchSignal:        (row.match_signal as string | null) ?? null,
    targetEntityType:   row.target_entity_type as string,
    targetEntityId:     row.target_entity_id as number,
    targetDisplayName:  (row.target_display_name as string | null) ?? null,
    matchScore:         (row.match_score as number | null) ?? null,
    matchMethod:        (row.match_method as string | null) ?? null,
    matchReason:        (row.match_reason as string | null) ?? null,
    aiGenerated:        row.ai_generated as boolean,
    status:             row.status as string,
    reviewQueueItemId:  (row.review_queue_item_id as number | null) ?? null,
    reviewedBy:         (row.reviewed_by as number | null) ?? null,
    reviewedAt:         (row.reviewed_at as string | null) ?? null,
    resolvedAt:         (row.resolved_at as string | null) ?? null,
    resolutionCode:     (row.resolution_code as string | null) ?? null,
    resolutionNote:     (row.resolution_note as string | null) ?? null,
    createdAt:          row.created_at as string,
    updatedAt:          row.updated_at as string,
  };
}

// ── runDmsEntityMatchingForDocument ───────────────────────────────────────────

export async function runDmsEntityMatchingForDocument(
  documentId: number,
  options?: { dryRun?: boolean }
): Promise<ActionResult<DmsEntityMatchRunResult>> {
  try {
    const enabled = await isDmsAiEntityMatchingEnabled();
    if (!enabled) return { success: false, error: "DMS Entity Matching is not enabled. Set DMS_AI_ENTITY_MATCHING=true in feature flags." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canRunMatching(ctx)) return { success: false, error: "Permission denied — requires dms.entity_matching.run" };

    const result = await runDmsEntityMatchingForDocumentSystem(documentId, ctx.profile.id, {
      createQueueItems: true,
      dryRun:           options?.dryRun ?? false,
    });

    if (!options?.dryRun) {
      await logAudit({
        module_code:      "DMS",
        entity_name:      "dms_ai_entity_match_candidates",
        entity_id:        documentId,
        entity_reference: `doc:${documentId}`,
        action:           "dms_entity_matching_run",
        new_values:       {
          document_id:        documentId,
          candidates_created: result.candidatesCreated,
          targets_matched:    result.targetsMatched.join(",").slice(0, 200),
        },
      });
    }

    revalidatePath("/dms/review-queue");
    return { success: true, data: result };
  } catch (err) {
    logger.warn("[entity-matching] runDmsEntityMatchingForDocument error", { documentId, error: String(err).slice(0, 200) });
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── runDmsEntityMatchingForIntakeSession ──────────────────────────────────────

export async function runDmsEntityMatchingForIntakeSession(
  uploadSessionId: number,
  options?: { dryRun?: boolean }
): Promise<ActionResult<DmsEntityMatchRunResult>> {
  try {
    const enabled = await isDmsAiEntityMatchingEnabled();
    if (!enabled) return { success: false, error: "DMS Entity Matching is not enabled. Set DMS_AI_ENTITY_MATCHING=true in feature flags." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canRunMatching(ctx)) return { success: false, error: "Permission denied" };

    const result = await runDmsEntityMatchingForIntakeSessionSystem(uploadSessionId, ctx.profile.id, {
      createQueueItems: true,
      dryRun:           options?.dryRun ?? false,
    });

    if (!options?.dryRun) {
      await logAudit({
        module_code:      "DMS",
        entity_name:      "dms_ai_entity_match_candidates",
        entity_id:        uploadSessionId,
        entity_reference: `session:${uploadSessionId}`,
        action:           "dms_entity_matching_run",
        new_values:       {
          upload_session_id:  uploadSessionId,
          candidates_created: result.candidatesCreated,
        },
      });
    }

    revalidatePath("/dms/review-queue");
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── bulkRunDmsEntityMatching ──────────────────────────────────────────────────

export async function bulkRunDmsEntityMatching(
  input: BulkEntityMatchingInput
): Promise<ActionResult<{ processed: number; totalCreated: number; errors: string[] }>> {
  try {
    const enabled = await isDmsAiEntityMatchingEnabled();
    if (!enabled) return { success: false, error: "DMS Entity Matching is not enabled." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "dms.entity_matching.admin") && !hasPermission(ctx, "dms.admin") && !ctx.roleCodes.includes("system_admin")) {
      return { success: false, error: "Permission denied — requires dms.entity_matching.admin" };
    }

    const capped = input.documentIds.slice(0, 50);
    let totalCreated = 0;
    const errors: string[] = [];

    for (const docId of capped) {
      try {
        const result = await runDmsEntityMatchingForDocumentSystem(docId, ctx.profile.id, { createQueueItems: true });
        totalCreated += result.candidatesCreated;
      } catch (err) {
        errors.push(`doc:${docId} — ${String(err).slice(0, 80)}`);
      }
    }

    await logAudit({
      module_code:      "DMS",
      entity_name:      "dms_ai_entity_match_candidates",
      entity_id:        null,
      entity_reference: "bulk",
      action:           "dms_entity_matching_run",
      new_values:       { document_count: capped.length, total_created: totalCreated },
    });

    revalidatePath("/dms/review-queue");
    return { success: true, data: { processed: capped.length, totalCreated, errors } };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── getDmsEntityMatchCandidates ───────────────────────────────────────────────

export async function getDmsEntityMatchCandidates(
  filters: EntityMatchCandidateFilters = {}
): Promise<ActionResult<{ items: EntityMatchCandidate[]; total: number }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewMatching(ctx)) return { success: false, error: "Permission denied" };

    const pageSize = Math.min(filters.pageSize ?? 25, 50);
    const page     = Math.max(filters.page ?? 1, 1);
    const from     = (page - 1) * pageSize;
    const to       = from + pageSize - 1;

    let query = supabase
      .from("dms_ai_entity_match_candidates")
      .select(CANDIDATE_SELECT, { count: "exact" })
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (filters.documentId)       query = query.eq("document_id", filters.documentId);
    if (filters.uploadSessionId)  query = query.eq("upload_session_id", filters.uploadSessionId);
    if (filters.status?.length)   query = query.in("status", filters.status);
    if (filters.targetEntityType) query = query.eq("target_entity_type", filters.targetEntityType);

    const { data, error, count } = await query;
    if (error) return { success: false, error: error.message };

    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    return { success: true, data: { items: rows.map(mapCandidate), total: count ?? 0 } };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── getDmsEntityMatchCandidate ────────────────────────────────────────────────

export async function getDmsEntityMatchCandidate(id: number): Promise<ActionResult<EntityMatchCandidate>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewMatching(ctx)) return { success: false, error: "Permission denied" };

    const { data, error } = await supabase
      .from("dms_ai_entity_match_candidates")
      .select(CANDIDATE_SELECT)
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (error || !data) return { success: false, error: error?.message ?? "Candidate not found" };
    return { success: true, data: mapCandidate(data as unknown as Record<string, unknown>) };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── reviewDmsEntityMatchCandidate ─────────────────────────────────────────────

export async function reviewDmsEntityMatchCandidate(
  id: number,
  decision: EntityMatchCandidateDecision
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canReviewMatching(ctx)) return { success: false, error: "Permission denied — requires dms.entity_matching.review" };

    const db = createAdminClient();
    const now = new Date().toISOString();

    const newStatus = decision.decision === "accepted_for_later_apply" ? "accepted" : "rejected";

    const { data: candidateBefore, error: loadErr } = await db
      .from("dms_ai_entity_match_candidates")
      .select("id, status, review_queue_item_id, target_entity_type, target_entity_id, document_id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (loadErr || !candidateBefore) return { success: false, error: "Candidate not found" };
    const candidate = candidateBefore as Record<string, unknown>;
    if (candidate.status !== "pending") return { success: false, error: `Candidate is already ${candidate.status}` };

    const { error } = await db
      .from("dms_ai_entity_match_candidates")
      .update({
        status:          newStatus,
        reviewed_by:     ctx.profile.id,
        reviewed_at:     now,
        resolved_at:     now,
        resolution_code: decision.decision,
        resolution_note: decision.note?.slice(0, 500) ?? null,
        updated_at:      now,
      })
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    // Sync linked review queue item — NO owner field writes
    const queueItemId = candidate.review_queue_item_id as number | null;
    if (queueItemId) {
      const queueStatus = newStatus === "accepted" ? "resolved" : "dismissed";
      await db
        .from("dms_review_queue")
        .update({
          status:          queueStatus,
          reviewed_by:     ctx.profile.id,
          reviewed_at:     now,
          resolved_at:     now,
          resolution_code: decision.decision,
          resolution_note: decision.note?.slice(0, 500) ?? null,
          updated_at:      now,
        })
        .eq("id", queueItemId)
        .in("status", ["open", "assigned", "in_review"]);
    }

    const auditAction = newStatus === "accepted"
      ? "dms_entity_match_candidate_accepted"
      : "dms_entity_match_candidate_rejected";

    await logAudit({
      module_code:      "DMS",
      entity_name:      "dms_ai_entity_match_candidates",
      entity_id:        id,
      entity_reference: `candidate:${id}`,
      action:           auditAction,
      new_values:       {
        candidate_id:      id,
        decision:          decision.decision,
        new_status:        newStatus,
        target_entity_type: candidate.target_entity_type,
        target_entity_id:  candidate.target_entity_id,
        document_id:       candidate.document_id,
        queue_item_id:     queueItemId,
        // NOTE: No dms_documents write. Apply-to-ERP is Phase 16.
      },
    });

    revalidatePath("/dms/review-queue");
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}
