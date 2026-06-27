"use server";

/**
 * ERP DMS AI Phase 12 — DMS Review Queue Server Actions
 *
 * Server actions for listing, assigning, resolving, dismissing, and rebuilding
 * DMS AI human review queue items.
 *
 * Security rules:
 *   - All actions require authentication + DMS_AI_REVIEW feature flag check.
 *   - Read actions require dms.review_queue.view OR dms.documents.review_ai OR dms.admin OR system_admin.
 *   - Mutation actions require dms.review_queue.manage OR dms.documents.review_ai OR dms.admin OR system_admin.
 *   - Bulk/rebuild actions require dms.review_queue.admin OR dms.admin OR system_admin.
 *   - Confidential document items are filtered from non-admin users.
 *   - payload_json and audit logs NEVER contain full OCR/chunk/AI/content text.
 *   - No ERP record writes. No auto-approval. No auto-save. No AI auto-resolve.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { logger } from "@/lib/logger";
import {
  upsertDmsReviewQueueItem,
  createDmsReviewQueueNotification,
  isDmsAiReviewEnabled,
  type DmsReviewType,
  type DmsReviewPriority,
} from "@/lib/dms/review-queue/review-queue-upsert";
import { revalidatePath } from "next/cache";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type ReviewQueueItem = {
  id:                       number;
  idempotencyKey:           string | null;
  reviewType:               string;
  sourceType:               string | null;
  sourceId:                 string | null;
  uploadSessionId:          number | null;
  documentId:               number | null;
  aiResultId:               number | null;
  aiJobId:                  number | null;
  metadataDefinitionId:     number | null;
  fieldCode:                string | null;
  reasonCode:               string | null;
  reasonMessage:            string | null;
  confidence:               number | null;
  priority:                 string;
  status:                   string;
  payloadJson:              Record<string, unknown> | null;
  assignedTo:               number | null;
  assignedAt:               string | null;
  reviewedBy:               number | null;
  reviewedAt:               string | null;
  resolvedAt:               string | null;
  resolutionCode:           string | null;
  resolutionNote:           string | null;
  dueAt:                    string | null;
  queuedAt:                 string;
  createdAt:                string;
  updatedAt:                string;
  // Phase 13 FK columns
  validationFindingId:      number | null;
  entityMatchCandidateId:   number | null;
  // joined
  document?:                { document_no: string; title: string; confidentiality_level: string } | null;
  uploadSession?:            { session_code: string } | null;
  assignedUser?:             { full_name: string | null } | null;
  // Phase 13 joined details (only on getDmsReviewQueueItem)
  validationFinding?:        ValidationFindingDetail | null;
  entityMatchCandidate?:     EntityMatchCandidateDetail | null;
};

// Phase 13 — safe subset of validation finding for drawer display
export type ValidationFindingDetail = {
  id:                   number;
  ruleCode:             string;
  ruleLabel:            string | null;
  severity:             string;
  status:               string;
  currentValueSummary:  string | null;
  aiValueSummary:       string | null;
  expectedValueSummary: string | null;
  reasonMessage:        string | null;
  confidence:           number | null;
  findingType:          string;
};

// Phase 13 — safe subset of entity match candidate for drawer display
export type EntityMatchCandidateDetail = {
  id:                number;
  targetEntityType:  string;
  targetEntityId:    number;
  targetDisplayName: string | null;
  matchScore:        number | null;
  matchMethod:       string | null;
  matchReason:       string | null;
  sourceTextSummary: string | null;
  status:            string;
};

export type ReviewQueueCounts = {
  open:         number;
  assigned:     number;
  inReview:     number;
  total:        number;
  assignedToMe: number;
  urgentHigh:   number;
  overdue:      number;
  resolvedToday: number;
};

export type ReviewQueueFilters = {
  status?:       string[];
  reviewType?:   string[];
  priority?:     string[];
  assignedTo?:   "me" | "unassigned" | number;
  documentId?:   number;
  uploadSessionId?: number;
  sourceType?:   string;
  createdAfter?: string;
  createdBefore?: string;
  dueBefore?:    string;
  page?:         number;
  pageSize?:     number;
};

export type ResolutionInput = {
  resolutionCode: string;
  resolutionNote?: string;
};

export type RebuildScope = {
  intake?:      boolean;
  aiAnalysis?:  boolean;
  ocr?:         boolean;
  semantic?:    boolean;
  jobs?:        boolean;
  dryRun?:      boolean;
  batchSize?:   number;
};

export type RebuildSummary = {
  created:    number;
  skipped:    number;
  superseded: number;
  errors:     number;
  dryRun:     boolean;
};

// ── Permission helpers ─────────────────────────────────────────────────────────

const RESTRICTED_CONFIDENTIALITY = new Set(["hr", "legal", "executive"]);

function canViewQueue(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return (
    hasPermission(ctx, "dms.review_queue.view") ||
    hasPermission(ctx, "dms.review_queue.manage") ||
    hasPermission(ctx, "dms.documents.review_ai") ||
    hasPermission(ctx, "dms.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

function canManageQueue(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return (
    hasPermission(ctx, "dms.review_queue.manage") ||
    hasPermission(ctx, "dms.documents.review_ai") ||
    hasPermission(ctx, "dms.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

function canAdminQueue(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return (
    hasPermission(ctx, "dms.review_queue.admin") ||
    hasPermission(ctx, "dms.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

function isAdminUser(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return hasPermission(ctx, "dms.admin") || ctx.roleCodes.includes("system_admin");
}

function canViewConfidential(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return isAdminUser(ctx);
}

// ── Feature flag guard ────────────────────────────────────────────────────────

async function guardReviewEnabled(): Promise<string | null> {
  const enabled = await isDmsAiReviewEnabled();
  if (!enabled) return "DMS Review Queue is not enabled. Set DMS_AI_REVIEW=true in feature flags.";
  return null;
}

// ── Base SELECT fragment ──────────────────────────────────────────────────────

const QUEUE_SELECT = `
  id, idempotency_key, review_type, source_type, source_id,
  upload_session_id, document_id, ai_result_id, ai_job_id,
  metadata_definition_id, field_code, reason_code, reason_message,
  confidence, priority, status, payload_json,
  assigned_to, assigned_at, reviewed_by, reviewed_at,
  resolved_at, resolution_code, resolution_note, due_at,
  queued_at, created_at, updated_at,
  validation_finding_id, entity_match_candidate_id,
  document:dms_documents!document_id (document_no, title, confidentiality_level),
  upload_session:dms_upload_sessions!upload_session_id (session_code),
  assigned_user:user_profiles!assigned_to (full_name)
` as const;

// Minimal select for Phase 13 validation finding details (safe fields only)
const FINDING_DETAIL_SELECT = `
  id, rule_code, rule_label, severity, status, finding_type,
  current_value_summary, ai_value_summary, expected_value_summary,
  reason_message, confidence
` as const;

// Minimal select for Phase 13 entity match candidate details (safe fields only)
const CANDIDATE_DETAIL_SELECT = `
  id, target_entity_type, target_entity_id, target_display_name,
  match_score, match_method, match_reason, source_text_summary, status
` as const;

function mapRow(row: Record<string, unknown>): ReviewQueueItem {
  return {
    id:                      row.id as number,
    idempotencyKey:          (row.idempotency_key as string | null) ?? null,
    reviewType:              row.review_type as string,
    sourceType:              (row.source_type as string | null) ?? null,
    sourceId:                (row.source_id as string | null) ?? null,
    uploadSessionId:         (row.upload_session_id as number | null) ?? null,
    documentId:              (row.document_id as number | null) ?? null,
    aiResultId:              (row.ai_result_id as number | null) ?? null,
    aiJobId:                 (row.ai_job_id as number | null) ?? null,
    metadataDefinitionId:    (row.metadata_definition_id as number | null) ?? null,
    fieldCode:               (row.field_code as string | null) ?? null,
    reasonCode:              (row.reason_code as string | null) ?? null,
    reasonMessage:           (row.reason_message as string | null) ?? null,
    confidence:              (row.confidence as number | null) ?? null,
    priority:                row.priority as string,
    status:                  row.status as string,
    payloadJson:             (row.payload_json as Record<string, unknown> | null) ?? null,
    assignedTo:              (row.assigned_to as number | null) ?? null,
    assignedAt:              (row.assigned_at as string | null) ?? null,
    reviewedBy:              (row.reviewed_by as number | null) ?? null,
    reviewedAt:              (row.reviewed_at as string | null) ?? null,
    resolvedAt:              (row.resolved_at as string | null) ?? null,
    resolutionCode:          (row.resolution_code as string | null) ?? null,
    resolutionNote:          (row.resolution_note as string | null) ?? null,
    dueAt:                   (row.due_at as string | null) ?? null,
    queuedAt:                row.queued_at as string,
    createdAt:               row.created_at as string,
    updatedAt:               row.updated_at as string,
    validationFindingId:     (row.validation_finding_id as number | null) ?? null,
    entityMatchCandidateId:  (row.entity_match_candidate_id as number | null) ?? null,
    document:                (row.document as ReviewQueueItem["document"]) ?? null,
    uploadSession:           (row.upload_session as ReviewQueueItem["uploadSession"]) ?? null,
    assignedUser:            (row.assigned_user as ReviewQueueItem["assignedUser"]) ?? null,
    validationFinding:       undefined,
    entityMatchCandidate:    undefined,
  };
}

// ── getDmsReviewQueueItems ────────────────────────────────────────────────────

export async function getDmsReviewQueueItems(
  filters: ReviewQueueFilters = {}
): Promise<ActionResult<{ items: ReviewQueueItem[]; total: number; page: number; pageSize: number }>> {
  try {
    const flagError = await guardReviewEnabled();
    if (flagError) return { success: false, error: flagError };

    const supabase = await createClient();
    const ctx      = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewQueue(ctx)) return { success: false, error: "Permission denied" };

    const pageSize = Math.min(filters.pageSize ?? 25, 50);
    const page     = Math.max(filters.page ?? 1, 1);
    const from     = (page - 1) * pageSize;
    const to       = from + pageSize - 1;

    let query = supabase
      .from("dms_review_queue")
      .select(QUEUE_SELECT, { count: "exact" })
      .is("deleted_at", null)
      .order("queued_at", { ascending: true })
      .range(from, to);

    // Apply filters
    if (filters.status?.length) {
      query = query.in("status", filters.status);
    } else {
      // Default: active items only
      query = query.in("status", ["open", "assigned", "in_review"]);
    }
    if (filters.reviewType?.length) query = query.in("review_type", filters.reviewType);
    if (filters.priority?.length)   query = query.in("priority", filters.priority);
    if (filters.documentId)          query = query.eq("document_id", filters.documentId);
    if (filters.uploadSessionId)     query = query.eq("upload_session_id", filters.uploadSessionId);
    if (filters.sourceType)          query = query.eq("source_type", filters.sourceType);
    if (filters.createdAfter)        query = query.gte("created_at", filters.createdAfter);
    if (filters.createdBefore)       query = query.lte("created_at", filters.createdBefore);
    if (filters.dueBefore)           query = query.lte("due_at", filters.dueBefore);

    if (filters.assignedTo === "me") {
      query = query.eq("assigned_to", ctx.profile.id);
    } else if (filters.assignedTo === "unassigned") {
      query = query.is("assigned_to", null);
    } else if (typeof filters.assignedTo === "number") {
      query = query.eq("assigned_to", filters.assignedTo);
    }

    const { data, error, count } = await query;
    if (error) return { success: false, error: error.message };

    const rows = (data ?? []) as unknown as Record<string, unknown>[];

    // Confidentiality filter — hide items for confidential documents from non-admin users
    const filtered = canViewConfidential(ctx)
      ? rows
      : rows.filter((row) => {
          const doc = row.document as { confidentiality_level?: string } | null;
          if (!doc) return true;
          return !RESTRICTED_CONFIDENTIALITY.has(doc.confidentiality_level ?? "");
        });

    return {
      success: true,
      data: {
        items: filtered.map(mapRow),
        total: count ?? 0,
        page,
        pageSize,
      },
    };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── getDmsReviewQueueCounts ───────────────────────────────────────────────────

export async function getDmsReviewQueueCounts(): Promise<ActionResult<ReviewQueueCounts>> {
  try {
    const flagError = await guardReviewEnabled();
    if (flagError) return { success: false, error: flagError };

    const supabase = await createClient();
    const ctx      = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewQueue(ctx)) return { success: false, error: "Permission denied" };

    const now = new Date().toISOString();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [openRes, assignedRes, inReviewRes, assignedToMeRes, urgentHighRes, overdueRes, resolvedTodayRes] = await Promise.all([
      supabase.from("dms_review_queue").select("id", { count: "exact", head: true }).eq("status", "open").is("deleted_at", null),
      supabase.from("dms_review_queue").select("id", { count: "exact", head: true }).eq("status", "assigned").is("deleted_at", null),
      supabase.from("dms_review_queue").select("id", { count: "exact", head: true }).eq("status", "in_review").is("deleted_at", null),
      supabase.from("dms_review_queue").select("id", { count: "exact", head: true }).eq("assigned_to", ctx.profile.id).in("status", ["open", "assigned", "in_review"]).is("deleted_at", null),
      supabase.from("dms_review_queue").select("id", { count: "exact", head: true }).in("priority", ["urgent", "high"]).in("status", ["open", "assigned", "in_review"]).is("deleted_at", null),
      supabase.from("dms_review_queue").select("id", { count: "exact", head: true }).lte("due_at", now).in("status", ["open", "assigned", "in_review"]).is("deleted_at", null),
      supabase.from("dms_review_queue").select("id", { count: "exact", head: true }).in("status", ["resolved", "dismissed"]).gte("resolved_at", todayStart.toISOString()).is("deleted_at", null),
    ]);

    return {
      success: true,
      data: {
        open:          openRes.count ?? 0,
        assigned:      assignedRes.count ?? 0,
        inReview:      inReviewRes.count ?? 0,
        total:         (openRes.count ?? 0) + (assignedRes.count ?? 0) + (inReviewRes.count ?? 0),
        assignedToMe:  assignedToMeRes.count ?? 0,
        urgentHigh:    urgentHighRes.count ?? 0,
        overdue:       overdueRes.count ?? 0,
        resolvedToday: resolvedTodayRes.count ?? 0,
      },
    };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── getDmsReviewQueueItem ─────────────────────────────────────────────────────

export async function getDmsReviewQueueItem(
  id: number
): Promise<ActionResult<ReviewQueueItem>> {
  try {
    const flagError = await guardReviewEnabled();
    if (flagError) return { success: false, error: flagError };

    const supabase = await createClient();
    const ctx      = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewQueue(ctx)) return { success: false, error: "Permission denied" };

    const { data, error } = await supabase
      .from("dms_review_queue")
      .select(QUEUE_SELECT)
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (error || !data) return { success: false, error: error?.message ?? "Item not found" };

    const row = data as unknown as Record<string, unknown>;

    // Confidentiality check
    const doc = row.document as { confidentiality_level?: string } | null;
    if (doc && RESTRICTED_CONFIDENTIALITY.has(doc.confidentiality_level ?? "")) {
      if (!canViewConfidential(ctx)) {
        return { success: false, error: "Source document is confidential. Contact a DMS admin." };
      }
    }

    const item = mapRow(row);

    // Phase 13 — load linked validation finding (safe fields only, non-fatal)
    if (item.validationFindingId) {
      try {
        const adminDb = createAdminClient();
        const { data: findingData } = await adminDb
          .from("dms_ai_validation_findings")
          .select(FINDING_DETAIL_SELECT)
          .eq("id", item.validationFindingId)
          .is("deleted_at", null)
          .single();
        if (findingData) {
          const f = findingData as Record<string, unknown>;
          item.validationFinding = {
            id:                   f.id as number,
            ruleCode:             f.rule_code as string,
            ruleLabel:            (f.rule_label as string | null) ?? null,
            severity:             f.severity as string,
            status:               f.status as string,
            findingType:          f.finding_type as string,
            currentValueSummary:  (f.current_value_summary as string | null) ?? null,
            aiValueSummary:       (f.ai_value_summary as string | null) ?? null,
            expectedValueSummary: (f.expected_value_summary as string | null) ?? null,
            reasonMessage:        (f.reason_message as string | null) ?? null,
            confidence:           (f.confidence as number | null) ?? null,
          };
        }
      } catch { /* non-fatal */ }
    }

    // Phase 13 — load linked entity match candidate (safe fields only, non-fatal)
    if (item.entityMatchCandidateId) {
      try {
        const adminDb = createAdminClient();
        const { data: candidateData } = await adminDb
          .from("dms_ai_entity_match_candidates")
          .select(CANDIDATE_DETAIL_SELECT)
          .eq("id", item.entityMatchCandidateId)
          .is("deleted_at", null)
          .single();
        if (candidateData) {
          const c = candidateData as Record<string, unknown>;
          item.entityMatchCandidate = {
            id:                c.id as number,
            targetEntityType:  c.target_entity_type as string,
            targetEntityId:    c.target_entity_id as number,
            targetDisplayName: (c.target_display_name as string | null) ?? null,
            matchScore:        (c.match_score as number | null) ?? null,
            matchMethod:       (c.match_method as string | null) ?? null,
            matchReason:       (c.match_reason as string | null) ?? null,
            sourceTextSummary: (c.source_text_summary as string | null) ?? null,
            status:            c.status as string,
          };
        }
      } catch { /* non-fatal */ }
    }

    return { success: true, data: item };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── assignDmsReviewQueueItem ──────────────────────────────────────────────────

export async function assignDmsReviewQueueItem(
  id: number,
  userId: number
): Promise<ActionResult> {
  try {
    const flagError = await guardReviewEnabled();
    if (flagError) return { success: false, error: flagError };

    const supabase = await createClient();
    const ctx      = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canManageQueue(ctx)) return { success: false, error: "Permission denied" };

    // userId=0 is the sentinel for "assign to me" — resolve to current user profile
    const targetUserId = (!userId || userId === 0) ? ctx.profile.id : userId;

    if (!targetUserId || targetUserId <= 0) {
      return { success: false, error: "Cannot determine target user for assignment." };
    }

    const now = new Date().toISOString();

    const { error } = await supabase
      .from("dms_review_queue")
      .update({
        assigned_to:  targetUserId,
        assigned_at:  now,
        status:       "assigned",
        updated_by:   ctx.profile.id,
        updated_at:   now,
      })
      .eq("id", id)
      .in("status", ["open", "assigned"])
      .is("deleted_at", null);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code:      "DMS",
      entity_name:      "dms_review_queue",
      entity_id:        id,
      entity_reference: String(id),
      action:           "dms_review_queue_item_assigned",
      new_values:       { review_queue_item_id: id, assigned_to: targetUserId },
    });

    // Non-fatal notification — use targetUserId (never 0)
    try {
      const item = await getDmsReviewQueueItem(id);
      await createDmsReviewQueueNotification({
        itemId:     id,
        priority:   item.data?.priority ?? "normal",
        reviewType: item.data?.reviewType ?? "",
        documentId: item.data?.documentId ?? null,
        assignedTo: targetUserId,
        eventType:  "assigned",
      });
    } catch { /* non-fatal */ }

    revalidatePath("/dms/review-queue");
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── startDmsReviewQueueItem ───────────────────────────────────────────────────

export async function startDmsReviewQueueItem(id: number): Promise<ActionResult> {
  try {
    const flagError = await guardReviewEnabled();
    if (flagError) return { success: false, error: flagError };

    const supabase = await createClient();
    const ctx      = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canManageQueue(ctx)) return { success: false, error: "Permission denied" };

    const now = new Date().toISOString();

    const { data: existing } = await supabase
      .from("dms_review_queue")
      .select("reviewed_by")
      .eq("id", id)
      .single();

    const { error } = await supabase
      .from("dms_review_queue")
      .update({
        status:               "in_review",
        review_started_at:    now,
        reviewed_by:          (existing as Record<string, unknown> | null)?.reviewed_by ?? ctx.profile.id,
        updated_by:           ctx.profile.id,
        updated_at:           now,
      })
      .eq("id", id)
      .in("status", ["open", "assigned"])
      .is("deleted_at", null);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code:      "DMS",
      entity_name:      "dms_review_queue",
      entity_id:        id,
      entity_reference: String(id),
      action:           "dms_review_queue_item_started",
      new_values:       { review_queue_item_id: id, reviewed_by: ctx.profile.id },
    });

    revalidatePath("/dms/review-queue");
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── resolveDmsReviewQueueItem ─────────────────────────────────────────────────

export async function resolveDmsReviewQueueItem(
  id: number,
  resolution: ResolutionInput
): Promise<ActionResult> {
  try {
    const flagError = await guardReviewEnabled();
    if (flagError) return { success: false, error: flagError };

    const supabase = await createClient();
    const ctx      = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canManageQueue(ctx)) return { success: false, error: "Permission denied" };

    const now = new Date().toISOString();
    const safeNote = resolution.resolutionNote?.slice(0, 500) ?? null;

    const { error } = await supabase
      .from("dms_review_queue")
      .update({
        status:           "resolved",
        reviewed_by:      ctx.profile.id,
        reviewed_at:      now,
        resolved_at:      now,
        review_completed_at: now,
        resolution_code:  resolution.resolutionCode,
        resolution_note:  safeNote,
        updated_by:       ctx.profile.id,
        updated_at:       now,
      })
      .eq("id", id)
      .in("status", ["open", "assigned", "in_review"])
      .is("deleted_at", null);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code:      "DMS",
      entity_name:      "dms_review_queue",
      entity_id:        id,
      entity_reference: String(id),
      action:           "dms_review_queue_item_resolved",
      new_values: {
        review_queue_item_id: id,
        resolution_code:      resolution.resolutionCode,
        reviewed_by:          ctx.profile.id,
      },
    });

    revalidatePath("/dms/review-queue");
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── dismissDmsReviewQueueItem ─────────────────────────────────────────────────

export async function dismissDmsReviewQueueItem(
  id: number,
  reason: string
): Promise<ActionResult> {
  try {
    const flagError = await guardReviewEnabled();
    if (flagError) return { success: false, error: flagError };

    const supabase = await createClient();
    const ctx      = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canManageQueue(ctx)) return { success: false, error: "Permission denied" };

    const now = new Date().toISOString();

    const { error } = await supabase
      .from("dms_review_queue")
      .update({
        status:           "dismissed",
        reviewed_by:      ctx.profile.id,
        reviewed_at:      now,
        resolved_at:      now,
        review_completed_at: now,
        resolution_code:  "no_action_needed",
        resolution_note:  reason.slice(0, 500),
        updated_by:       ctx.profile.id,
        updated_at:       now,
      })
      .eq("id", id)
      .in("status", ["open", "assigned", "in_review"])
      .is("deleted_at", null);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code:      "DMS",
      entity_name:      "dms_review_queue",
      entity_id:        id,
      entity_reference: String(id),
      action:           "dms_review_queue_item_dismissed",
      new_values:       { review_queue_item_id: id, reviewed_by: ctx.profile.id },
    });

    revalidatePath("/dms/review-queue");
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── bulkAssignDmsReviewQueueItems ─────────────────────────────────────────────

export async function bulkAssignDmsReviewQueueItems(
  ids: number[],
  userId: number
): Promise<ActionResult<{ count: number }>> {
  try {
    const flagError = await guardReviewEnabled();
    if (flagError) return { success: false, error: flagError };

    const supabase = await createClient();
    const ctx      = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canAdminQueue(ctx)) return { success: false, error: "Permission denied — requires dms.review_queue.admin or dms.admin" };
    if (ids.length === 0) return { success: false, error: "No items provided" };
    if (ids.length > 100) return { success: false, error: "Maximum 100 items per bulk action" };

    const now = new Date().toISOString();

    const { error, count } = await supabase
      .from("dms_review_queue")
      .update({
        assigned_to:  userId,
        assigned_at:  now,
        status:       "assigned",
        updated_by:   ctx.profile.id,
        updated_at:   now,
      })
      .in("id", ids)
      .in("status", ["open", "assigned"])
      .is("deleted_at", null);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code:      "DMS",
      entity_name:      "dms_review_queue",
      entity_id:        null,
      entity_reference: "bulk",
      action:           "dms_review_queue_bulk_assigned",
      new_values:       { ids: ids.slice(0, 20), count: count ?? ids.length, assigned_to: userId },
    });

    revalidatePath("/dms/review-queue");
    return { success: true, data: { count: count ?? ids.length } };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── bulkDismissDmsReviewQueueItems ────────────────────────────────────────────

export async function bulkDismissDmsReviewQueueItems(
  ids: number[],
  reason: string
): Promise<ActionResult<{ count: number }>> {
  try {
    const flagError = await guardReviewEnabled();
    if (flagError) return { success: false, error: flagError };

    const supabase = await createClient();
    const ctx      = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canAdminQueue(ctx)) return { success: false, error: "Permission denied — requires dms.review_queue.admin or dms.admin" };
    if (ids.length === 0) return { success: false, error: "No items provided" };
    if (ids.length > 100) return { success: false, error: "Maximum 100 items per bulk action" };

    const now = new Date().toISOString();

    const { error, count } = await supabase
      .from("dms_review_queue")
      .update({
        status:           "dismissed",
        reviewed_by:      ctx.profile.id,
        reviewed_at:      now,
        resolved_at:      now,
        review_completed_at: now,
        resolution_code:  "no_action_needed",
        resolution_note:  reason.slice(0, 500),
        updated_by:       ctx.profile.id,
        updated_at:       now,
      })
      .in("id", ids)
      .in("status", ["open", "assigned", "in_review"])
      .is("deleted_at", null);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code:      "DMS",
      entity_name:      "dms_review_queue",
      entity_id:        null,
      entity_reference: "bulk",
      action:           "dms_review_queue_bulk_dismissed",
      new_values:       { ids: ids.slice(0, 20), count: count ?? ids.length, reviewed_by: ctx.profile.id },
    });

    revalidatePath("/dms/review-queue");
    return { success: true, data: { count: count ?? ids.length } };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── rebuildDmsReviewQueue ─────────────────────────────────────────────────────

export async function rebuildDmsReviewQueue(
  scope: RebuildScope = {}
): Promise<ActionResult<RebuildSummary>> {
  try {
    const flagError = await guardReviewEnabled();
    if (flagError) return { success: false, error: flagError };

    const supabase = await createClient();
    const ctx      = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canAdminQueue(ctx)) return { success: false, error: "Permission denied — requires dms.review_queue.admin or dms.admin" };

    const batchSize = Math.min(scope.batchSize ?? 50, 50);
    const dryRun    = scope.dryRun ?? false;
    let created     = 0;
    let skipped     = 0;
    let superseded  = 0;
    let errors      = 0;

    // ── Scope: intake sessions with review_pending ───────────────────────────
    if (scope.intake !== false) {
      const { data: sessions } = await supabase
        .from("dms_upload_sessions")
        .select("id, session_code, ai_result_id, intake_status")
        .eq("intake_status", "review_pending")
        .is("deleted_at", null)
        .limit(batchSize);

      for (const s of (sessions ?? []) as Record<string, unknown>[]) {
        if (dryRun) { skipped++; continue; }
        try {
          const result = await upsertDmsReviewQueueItem({
            idempotencyKey: `intake_classification:${s.id}:classification`,
            reviewType:     "intake_classification_review",
            sourceType:     "intake",
            sourceId:       String(s.id),
            uploadSessionId: s.id as number,
            aiResultId:     (s.ai_result_id as number | null) ?? null,
            reasonCode:     "intake_review_pending",
            reasonMessage:  `Intake session ${s.session_code} is awaiting review.`,
            priority:       "normal",
            payloadJson:    { upload_session_id: s.id, session_code: s.session_code },
            createdBy:      ctx.profile!.id,
          });
          result.inserted ? created++ : skipped++;
        } catch { errors++; }
      }

      // Supersede items for approved sessions
      const { data: approvedSessions } = await supabase
        .from("dms_upload_sessions")
        .select("id")
        .eq("intake_status", "approved")
        .is("deleted_at", null)
        .limit(batchSize);

      for (const s of (approvedSessions ?? []) as Record<string, unknown>[]) {
        if (dryRun) continue;
        try {
          const now = new Date().toISOString();
          await supabase
            .from("dms_review_queue")
            .update({ status: "superseded", updated_at: now, resolved_at: now })
            .like("idempotency_key", `intake_classification:${s.id}:%`)
            .in("status", ["open", "assigned", "in_review"])
            .is("deleted_at", null);
          superseded++;
        } catch { /* non-fatal */ }
      }
    }

    // ── Scope: AI analysis pending_review ────────────────────────────────────
    if (scope.aiAnalysis !== false) {
      const { data: results } = await supabase
        .from("dms_ai_extraction_results")
        .select("id, document_id")
        .eq("ai_status", "pending_review")
        .not("document_id", "is", null)
        .limit(batchSize);

      for (const r of (results ?? []) as Record<string, unknown>[]) {
        if (dryRun) { skipped++; continue; }
        try {
          const res = await upsertDmsReviewQueueItem({
            idempotencyKey: `ai_analysis:${r.id}:result`,
            reviewType:     "ai_analysis_metadata_review",
            sourceType:     "ai_analysis",
            sourceId:       String(r.id),
            documentId:     r.document_id as number,
            aiResultId:     r.id as number,
            reasonCode:     "ai_analysis_pending_review",
            reasonMessage:  `AI analysis result ${r.id} is pending human review.`,
            priority:       "normal",
            payloadJson:    { ai_result_id: r.id, document_id: r.document_id },
            createdBy:      ctx.profile!.id,
          });
          res.inserted ? created++ : skipped++;
        } catch { errors++; }
      }
    }

    // ── Scope: failed AI jobs ─────────────────────────────────────────────────
    if (scope.jobs !== false) {
      const { data: failedJobs } = await supabase
        .from("dms_ai_job_queue")
        .select("id, job_type, related_document_id")
        .eq("job_status", "failed")
        .limit(batchSize);

      const JOB_PRIORITY: Record<string, DmsReviewPriority> = {
        post_approve_orchestration: "high",
        ocr_backfill:               "high",
        semantic_document_index:    "low",
        ai_summary:                 "normal",
        ai_intelligence:            "normal",
        embedding:                  "normal",
        tag_suggestions:            "low",
        link_suggestions:           "low",
      };

      for (const j of (failedJobs ?? []) as Record<string, unknown>[]) {
        if (dryRun) { skipped++; continue; }
        try {
          const priority = JOB_PRIORITY[j.job_type as string] ?? "normal";
          const res = await upsertDmsReviewQueueItem({
            idempotencyKey: `ai_job:${j.id}`,
            reviewType:     "ai_job_failure_review",
            sourceType:     "ai_job",
            sourceId:       String(j.id),
            documentId:     (j.related_document_id as number | null) ?? null,
            aiJobId:        j.id as number,
            reasonCode:     "ai_job_failed",
            reasonMessage:  `AI job ${j.id} (${j.job_type}) failed permanently.`,
            priority,
            payloadJson:    { job_id: j.id, job_type: j.job_type },
            createdBy:      ctx.profile!.id,
          });
          res.inserted ? created++ : skipped++;
        } catch { errors++; }
      }
    }

    const summary: RebuildSummary = { created, skipped, superseded, errors, dryRun };

    await logAudit({
      module_code:      "DMS",
      entity_name:      "dms_review_queue",
      entity_id:        null,
      entity_reference: "rebuild",
      action:           "dms_review_queue_rebuilt",
      new_values:       { ...summary, scope },
    });

    revalidatePath("/dms/review-queue");
    return { success: true, data: summary };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── supersedeDmsReviewQueueItemsForSource (internal helper) ──────────────────

/**
 * Marks active queue items with a given idempotency key prefix as superseded.
 * Used by generation hooks when a source issue resolves (e.g. intake approved).
 * NON-FATAL.
 */
export async function supersedeDmsReviewQueueItems(
  keyPrefix: string
): Promise<void> {
  try {
    const db  = createAdminClient();
    const now = new Date().toISOString();
    await db
      .from("dms_review_queue")
      .update({ status: "superseded", updated_at: now, resolved_at: now })
      .like("idempotency_key", `${keyPrefix}%`)
      .in("status", ["open", "assigned", "in_review"])
      .is("deleted_at", null);
  } catch (err) {
    logger.warn("[review-queue] supersede failed (non-fatal)", {
      keyPrefix,
      error: String(err).slice(0, 200),
    });
  }
}

