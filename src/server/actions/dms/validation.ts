"use server";

/**
 * ERP DMS AI Phase 13 — DMS Validation Server Actions
 *
 * Security rules:
 *   - All actions require authentication.
 *   - Read actions require dms.validation.view or higher.
 *   - Run actions require dms.validation.run or higher.
 *   - Review/decision actions require dms.validation.review or higher.
 *   - DMS_AI_VALIDATION feature flag gate on run/mutate actions.
 *   - No document metadata writes. No ERP record writes. Human-review-only.
 *   - Audit logs contain only safe IDs/codes — never OCR/content/AI text.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import {
  runDeterministicValidationForDocument,
  runDeterministicValidationForIntakeSession,
} from "@/lib/dms/validation/validation-engine";
import type { DmsValidationRunResult } from "@/lib/dms/validation/validation-types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type ValidationFinding = {
  id:                    number;
  findingKey:            string | null;
  documentId:            number | null;
  uploadSessionId:       number | null;
  aiResultId:            number | null;
  metadataDefinitionId:  number | null;
  fieldCode:             string | null;
  findingType:           string;
  severity:              string;
  status:                string;
  sourceModule:          string | null;
  ruleCode:              string;
  ruleLabel:             string | null;
  aiGenerated:           boolean;
  confidence:            number | null;
  currentValueSummary:   string | null;
  aiValueSummary:        string | null;
  expectedValueSummary:  string | null;
  reasonMessage:         string | null;
  reviewQueueItemId:     number | null;
  reviewedBy:            number | null;
  reviewedAt:            string | null;
  resolvedAt:            string | null;
  resolutionCode:        string | null;
  resolutionNote:        string | null;
  createdAt:             string;
  updatedAt:             string;
};

export type ValidationFindingFilters = {
  documentId?:     number;
  uploadSessionId?: number;
  status?:         string[];
  severity?:       string[];
  ruleCode?:       string;
  page?:           number;
  pageSize?:       number;
};

export type ValidationFindingDecision = {
  decision:  "reviewed_no_action" | "false_positive" | "dismiss" | "supersede";
  note?:     string;
};

export type BulkValidationInput = {
  documentIds: number[];
};

// ── Feature flag helper ───────────────────────────────────────────────────────

async function isDmsAiValidationEnabled(): Promise<boolean> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "DMS_AI_VALIDATION")
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled === true;
  } catch {
    return false;
  }
}

// ── Permission helpers ────────────────────────────────────────────────────────

function canViewValidation(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return (
    hasPermission(ctx, "dms.validation.view") ||
    hasPermission(ctx, "dms.validation.run") ||
    hasPermission(ctx, "dms.validation.review") ||
    hasPermission(ctx, "dms.validation.admin") ||
    hasPermission(ctx, "dms.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

function canRunValidation(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return (
    hasPermission(ctx, "dms.validation.run") ||
    hasPermission(ctx, "dms.validation.admin") ||
    hasPermission(ctx, "dms.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

function canReviewValidation(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return (
    hasPermission(ctx, "dms.validation.review") ||
    hasPermission(ctx, "dms.validation.admin") ||
    hasPermission(ctx, "dms.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

// ── SELECT fragment ───────────────────────────────────────────────────────────

const FINDING_SELECT = `
  id, finding_key, document_id, upload_session_id, ai_result_id, metadata_definition_id,
  field_code, finding_type, severity, status, source_module, rule_code, rule_label,
  ai_generated, confidence, current_value_summary, ai_value_summary, expected_value_summary,
  reason_message, review_queue_item_id, reviewed_by, reviewed_at, resolved_at,
  resolution_code, resolution_note, created_at, updated_at
` as const;

function mapFinding(row: Record<string, unknown>): ValidationFinding {
  return {
    id:                   row.id as number,
    findingKey:           (row.finding_key as string | null) ?? null,
    documentId:           (row.document_id as number | null) ?? null,
    uploadSessionId:      (row.upload_session_id as number | null) ?? null,
    aiResultId:           (row.ai_result_id as number | null) ?? null,
    metadataDefinitionId: (row.metadata_definition_id as number | null) ?? null,
    fieldCode:            (row.field_code as string | null) ?? null,
    findingType:          row.finding_type as string,
    severity:             row.severity as string,
    status:               row.status as string,
    sourceModule:         (row.source_module as string | null) ?? null,
    ruleCode:             row.rule_code as string,
    ruleLabel:            (row.rule_label as string | null) ?? null,
    aiGenerated:          row.ai_generated as boolean,
    confidence:           (row.confidence as number | null) ?? null,
    currentValueSummary:  (row.current_value_summary as string | null) ?? null,
    aiValueSummary:       (row.ai_value_summary as string | null) ?? null,
    expectedValueSummary: (row.expected_value_summary as string | null) ?? null,
    reasonMessage:        (row.reason_message as string | null) ?? null,
    reviewQueueItemId:    (row.review_queue_item_id as number | null) ?? null,
    reviewedBy:           (row.reviewed_by as number | null) ?? null,
    reviewedAt:           (row.reviewed_at as string | null) ?? null,
    resolvedAt:           (row.resolved_at as string | null) ?? null,
    resolutionCode:       (row.resolution_code as string | null) ?? null,
    resolutionNote:       (row.resolution_note as string | null) ?? null,
    createdAt:            row.created_at as string,
    updatedAt:            row.updated_at as string,
  };
}

// ── runDmsValidationForDocument ───────────────────────────────────────────────

export async function runDmsValidationForDocument(
  documentId: number,
  options?: { dryRun?: boolean; maxFindings?: number }
): Promise<ActionResult<DmsValidationRunResult>> {
  try {
    const enabled = await isDmsAiValidationEnabled();
    if (!enabled) return { success: false, error: "DMS Validation is not enabled. Set DMS_AI_VALIDATION=true in feature flags." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canRunValidation(ctx)) return { success: false, error: "Permission denied — requires dms.validation.run" };

    const result = await runDeterministicValidationForDocument(documentId, ctx.profile.id, {
      maxFindings:   options?.maxFindings ?? 10,
      createQueueItems: true,
      dryRun:        options?.dryRun ?? false,
    });

    if (!options?.dryRun) {
      await logAudit({
        module_code:      "DMS",
        entity_name:      "dms_ai_validation_findings",
        entity_id:        documentId,
        entity_reference: `doc:${documentId}`,
        action:           "dms_validation_run",
        new_values:       {
          document_id:      documentId,
          findings_created: result.findingsCreated,
          findings_skipped: result.findingsSkipped,
          rules_fired:      result.rulesFired.join(",").slice(0, 200),
        },
      });
    }

    revalidatePath("/dms/review-queue");
    return { success: true, data: result };
  } catch (err) {
    logger.warn("[validation] runDmsValidationForDocument error", { documentId, error: String(err).slice(0, 200) });
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── runDmsValidationForIntakeSession ─────────────────────────────────────────

export async function runDmsValidationForIntakeSession(
  uploadSessionId: number,
  options?: { dryRun?: boolean }
): Promise<ActionResult<DmsValidationRunResult>> {
  try {
    const enabled = await isDmsAiValidationEnabled();
    if (!enabled) return { success: false, error: "DMS Validation is not enabled. Set DMS_AI_VALIDATION=true in feature flags." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canRunValidation(ctx)) return { success: false, error: "Permission denied" };

    const result = await runDeterministicValidationForIntakeSession(uploadSessionId, ctx.profile.id, {
      createQueueItems: true,
      dryRun:           options?.dryRun ?? false,
    });

    if (!options?.dryRun) {
      await logAudit({
        module_code:      "DMS",
        entity_name:      "dms_ai_validation_findings",
        entity_id:        uploadSessionId,
        entity_reference: `session:${uploadSessionId}`,
        action:           "dms_validation_run",
        new_values:       {
          upload_session_id: uploadSessionId,
          findings_created:  result.findingsCreated,
          rules_fired:       result.rulesFired.join(",").slice(0, 200),
        },
      });
    }

    revalidatePath("/dms/review-queue");
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── bulkRunDmsValidation ──────────────────────────────────────────────────────

export async function bulkRunDmsValidation(
  input: BulkValidationInput
): Promise<ActionResult<{ processed: number; totalCreated: number; errors: string[] }>> {
  try {
    const enabled = await isDmsAiValidationEnabled();
    if (!enabled) return { success: false, error: "DMS Validation is not enabled." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "dms.validation.admin") && !hasPermission(ctx, "dms.admin") && !ctx.roleCodes.includes("system_admin")) {
      return { success: false, error: "Permission denied — requires dms.validation.admin" };
    }

    const { documentIds } = input;
    if (!documentIds?.length) return { success: false, error: "No document IDs provided" };

    const capped = documentIds.slice(0, 50); // max 50 per bulk run
    let totalCreated = 0;
    const errors: string[] = [];

    for (const docId of capped) {
      try {
        const result = await runDeterministicValidationForDocument(docId, ctx.profile.id, { createQueueItems: true });
        totalCreated += result.findingsCreated;
      } catch (err) {
        errors.push(`doc:${docId} — ${String(err).slice(0, 80)}`);
      }
    }

    await logAudit({
      module_code:      "DMS",
      entity_name:      "dms_ai_validation_findings",
      entity_id:        null,
      entity_reference: "bulk",
      action:           "dms_validation_run",
      new_values:       { document_count: capped.length, total_created: totalCreated },
    });

    revalidatePath("/dms/review-queue");
    return { success: true, data: { processed: capped.length, totalCreated, errors } };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── getDmsValidationFindings ──────────────────────────────────────────────────

export async function getDmsValidationFindings(
  filters: ValidationFindingFilters = {}
): Promise<ActionResult<{ items: ValidationFinding[]; total: number }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewValidation(ctx)) return { success: false, error: "Permission denied" };

    const pageSize = Math.min(filters.pageSize ?? 25, 50);
    const page     = Math.max(filters.page ?? 1, 1);
    const from     = (page - 1) * pageSize;
    const to       = from + pageSize - 1;

    let query = supabase
      .from("dms_ai_validation_findings")
      .select(FINDING_SELECT, { count: "exact" })
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (filters.documentId)     query = query.eq("document_id", filters.documentId);
    if (filters.uploadSessionId) query = query.eq("upload_session_id", filters.uploadSessionId);
    if (filters.status?.length)  query = query.in("status", filters.status);
    if (filters.severity?.length) query = query.in("severity", filters.severity);
    if (filters.ruleCode)        query = query.eq("rule_code", filters.ruleCode);

    const { data, error, count } = await query;
    if (error) return { success: false, error: error.message };

    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    return { success: true, data: { items: rows.map(mapFinding), total: count ?? 0 } };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── getDmsValidationFinding ───────────────────────────────────────────────────

export async function getDmsValidationFinding(id: number): Promise<ActionResult<ValidationFinding>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewValidation(ctx)) return { success: false, error: "Permission denied" };

    const { data, error } = await supabase
      .from("dms_ai_validation_findings")
      .select(FINDING_SELECT)
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (error || !data) return { success: false, error: error?.message ?? "Finding not found" };
    return { success: true, data: mapFinding(data as unknown as Record<string, unknown>) };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── reviewDmsValidationFinding ────────────────────────────────────────────────

export async function reviewDmsValidationFinding(
  id: number,
  decision: ValidationFindingDecision
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canReviewValidation(ctx)) return { success: false, error: "Permission denied — requires dms.validation.review" };

    const db = createAdminClient();
    const now = new Date().toISOString();

    let newStatus: string;
    switch (decision.decision) {
      case "reviewed_no_action": newStatus = "reviewed";       break;
      case "false_positive":     newStatus = "false_positive"; break;
      case "dismiss":            newStatus = "dismissed";      break;
      case "supersede":          newStatus = "superseded";     break;
      default:                   return { success: false, error: "Invalid decision" };
    }

    const { data: findingBefore, error: loadErr } = await db
      .from("dms_ai_validation_findings")
      .select("id, status, review_queue_item_id, rule_code, document_id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (loadErr || !findingBefore) return { success: false, error: "Finding not found" };

    const finding = findingBefore as Record<string, unknown>;
    if (finding.status !== "open") return { success: false, error: `Finding is already ${finding.status}` };

    const { error } = await db
      .from("dms_ai_validation_findings")
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

    // Sync linked review queue item
    const queueItemId = finding.review_queue_item_id as number | null;
    if (queueItemId) {
      const queueStatus = newStatus === "reviewed" ? "resolved" : "dismissed";
      const resolutionCode = decision.decision;
      await db
        .from("dms_review_queue")
        .update({
          status:          queueStatus,
          reviewed_by:     ctx.profile.id,
          reviewed_at:     now,
          resolved_at:     now,
          resolution_code: resolutionCode,
          resolution_note: decision.note?.slice(0, 500) ?? null,
          updated_at:      now,
        })
        .eq("id", queueItemId)
        .in("status", ["open", "assigned", "in_review"]);
    }

    await logAudit({
      module_code:      "DMS",
      entity_name:      "dms_ai_validation_findings",
      entity_id:        id,
      entity_reference: `finding:${id}`,
      action:           `dms_validation_finding_${decision.decision}`,
      new_values:       {
        finding_id:      id,
        decision:        decision.decision,
        new_status:      newStatus,
        rule_code:       finding.rule_code,
        document_id:     finding.document_id,
        queue_item_id:   queueItemId,
      },
    });

    revalidatePath("/dms/review-queue");
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── dismissDmsValidationFinding ───────────────────────────────────────────────

export async function dismissDmsValidationFinding(id: number, reason: string): Promise<ActionResult> {
  return reviewDmsValidationFinding(id, { decision: "dismiss", note: reason });
}

// ── markDmsValidationFindingFalsePositive ─────────────────────────────────────

export async function markDmsValidationFindingFalsePositive(id: number, reason: string): Promise<ActionResult> {
  return reviewDmsValidationFinding(id, { decision: "false_positive", note: reason });
}
