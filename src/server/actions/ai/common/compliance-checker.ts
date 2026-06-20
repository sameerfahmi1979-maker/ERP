"use server";

/**
 * ERP COMMON AI.4 — AI Compliance Checker Server Actions
 *
 * Review findings only — no auto-fix/waive/update/create.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import {
  runComplianceScan,
  runEntityComplianceScan,
  insertComplianceFindingEvent,
} from "@/lib/ai/common/compliance-checker";
import type {
  ComplianceFindingDetail,
  ComplianceFindingFilters,
  ComplianceFindingRow,
  ComplianceFindingStatus,
  ComplianceFindingType,
  ComplianceReviewDecision,
  ComplianceScanResult,
  ComplianceSeverity,
  EntityComplianceSummary,
} from "@/lib/ai/common/compliance-checker";

export type ActionResult<T = undefined> = T extends undefined
  ? { success: boolean; error?: string; code?: string }
  : { success: boolean; data?: T; error?: string; code?: string };

const scanInputSchema = z.object({
  includeAiNotes: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  aiCallLimit: z.coerce.number().int().min(1).max(20).optional(),
  supersedeExisting: z.boolean().optional(),
});

const entityScanInputSchema = scanInputSchema.extend({
  entityType: z.enum(["party", "company", "branch", "site", "dms_document"]),
  entityId: z.coerce.number().int().positive(),
});

const filtersSchema = z.object({
  status: z
    .enum([
      "open",
      "reviewed",
      "accepted",
      "waived",
      "resolved",
      "false_positive",
      "superseded",
      "failed",
    ])
    .optional(),
  findingType: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.coerce.number().int().positive().optional(),
  documentId: z.coerce.number().int().positive().optional(),
  severity: z.enum(["info", "low", "medium", "high", "critical"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const reviewInputSchema = z.object({
  findingId: z.coerce.number().int().positive(),
  decision: z.enum(["accepted", "waived", "resolved", "false_positive", "needs_more_review"]),
  reviewNotes: z.string().max(2000).optional(),
  waiverReason: z.string().max(2000).optional(),
});

function canViewCompliance(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return (
    hasPermission(ctx, "ai.compliance.view") ||
    hasPermission(ctx, "ai.common.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

function canReviewCompliance(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return (
    hasPermission(ctx, "ai.compliance.review") ||
    hasPermission(ctx, "ai.common.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

function canAdminScan(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return hasPermission(ctx, "ai.common.admin") || ctx.roleCodes.includes("system_admin");
}

async function isComplianceEnabled(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "ERP_AI_COMPLIANCE")
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled === true;
  } catch {
    return false;
  }
}

function mapFindingRow(row: Record<string, unknown>): ComplianceFindingRow {
  return {
    id: row.id as number,
    findingType: row.finding_type as ComplianceFindingType,
    severity: row.severity as ComplianceSeverity,
    detectionMethod: row.detection_method as ComplianceFindingRow["detectionMethod"],
    findingKey: row.finding_key as string,
    entityType: row.entity_type as string,
    entityId: row.entity_id as number,
    documentId: (row.document_id as number | null) ?? null,
    sourceRuleId: (row.source_rule_id as number | null) ?? null,
    sourceDuplicateCandidateId: (row.source_duplicate_candidate_id as number | null) ?? null,
    sourceFieldSuggestionId: (row.source_field_suggestion_id as number | null) ?? null,
    fieldCode: (row.field_code as string | null) ?? null,
    expectedValue: (row.expected_value as string | null) ?? null,
    actualValue: (row.actual_value as string | null) ?? null,
    confidenceScore: Number(row.confidence_score),
    evidenceJson: (row.evidence_json as Record<string, unknown> | null) ?? null,
    aiReason: (row.ai_reason as string | null) ?? null,
    recommendedAction: (row.recommended_action as string | null) ?? null,
    status: row.status as ComplianceFindingStatus,
    reviewDecision: (row.review_decision as ComplianceReviewDecision | null) ?? null,
    reviewNotes: (row.review_notes as string | null) ?? null,
    reviewedBy: (row.reviewed_by as number | null) ?? null,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    resolvedBy: (row.resolved_by as number | null) ?? null,
    resolvedAt: (row.resolved_at as string | null) ?? null,
    waivedBy: (row.waived_by as number | null) ?? null,
    waivedAt: (row.waived_at as string | null) ?? null,
    waiverReason: (row.waiver_reason as string | null) ?? null,
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

export async function scanComplianceFindings(
  input: z.infer<typeof scanInputSchema>
): Promise<ActionResult<ComplianceScanResult>> {
  try {
    const parsed = scanInputSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid scan input." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canAdminScan(ctx)) return { success: false, error: "Permission denied.", code: "PERMISSION_DENIED" };

    const enabled = await isComplianceEnabled();
    if (!enabled) {
      return {
        success: false,
        error: "Compliance checker is disabled. Enable ERP_AI_COMPLIANCE in AI Settings for UAT.",
        code: "FEATURE_DISABLED",
      };
    }

    await logAudit({
      module_code: "ai",
      entity_name: "compliance_scan",
      entity_id: 0,
      entity_reference: "full_scan",
      action: "ai_compliance_scan_started",
      new_values: {
        includeAiNotes: parsed.data.includeAiNotes ?? false,
        dryRun: parsed.data.dryRun ?? false,
      },
    });

    const isAdmin = ctx.roleCodes.includes("system_admin");
    const supabase = createAdminClient();
    const result = await runComplianceScan(
      supabase,
      {
        includeAiNotes: parsed.data.includeAiNotes,
        dryRun: parsed.data.dryRun,
        limit: parsed.data.limit,
        aiCallLimit: parsed.data.aiCallLimit,
        supersedeExisting: parsed.data.supersedeExisting ?? true,
      },
      ctx.profile.id,
      isAdmin
    );

    await logAudit({
      module_code: "ai",
      entity_name: "compliance_scan",
      entity_id: 0,
      entity_reference: "full_scan",
      action: "ai_compliance_scan_completed",
      new_values: {
        detected: result.detected,
        inserted: result.inserted,
        dryRun: result.dryRun,
      },
    });

    revalidatePath("/admin/ai/compliance");
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

export async function scanComplianceForEntity(
  input: z.infer<typeof entityScanInputSchema>
): Promise<ActionResult<ComplianceScanResult>> {
  try {
    const parsed = entityScanInputSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid entity scan input." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canAdminScan(ctx)) return { success: false, error: "Permission denied.", code: "PERMISSION_DENIED" };

    const enabled = await isComplianceEnabled();
    if (!enabled) {
      return {
        success: false,
        error: "Compliance checker is disabled. Enable ERP_AI_COMPLIANCE in AI Settings.",
        code: "FEATURE_DISABLED",
      };
    }

    const isAdmin = ctx.roleCodes.includes("system_admin");
    const supabase = createAdminClient();
    const result = await runEntityComplianceScan(supabase, {
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      includeAiNotes: parsed.data.includeAiNotes,
      dryRun: parsed.data.dryRun,
      aiCallLimit: parsed.data.aiCallLimit,
      supersedeExisting: parsed.data.supersedeExisting ?? true,
      actorUserProfileId: ctx.profile.id,
      isAdminViewer: isAdmin,
    });

    revalidatePath("/admin/ai/compliance");
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

export async function getComplianceFindings(
  filters: ComplianceFindingFilters = {}
): Promise<ActionResult<{ rows: ComplianceFindingRow[]; total: number }>> {
  try {
    const parsed = filtersSchema.safeParse(filters);
    if (!parsed.success) return { success: false, error: "Invalid filters." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canViewCompliance(ctx)) return { success: false, error: "Permission denied.", code: "PERMISSION_DENIED" };

    const supabase = await createClient();
    let query = supabase
      .from("erp_ai_compliance_findings")
      .select("*", { count: "exact" })
      .is("deleted_at", null)
      .order("severity", { ascending: true })
      .order("created_at", { ascending: false });

    const f = parsed.data;
    if (f.status) query = query.eq("status", f.status);
    if (f.findingType) query = query.eq("finding_type", f.findingType);
    if (f.entityType) query = query.eq("entity_type", f.entityType);
    if (f.entityId) query = query.eq("entity_id", f.entityId);
    if (f.documentId) query = query.eq("document_id", f.documentId);
    if (f.severity) query = query.eq("severity", f.severity);

    const limit = f.limit ?? 50;
    const offset = f.offset ?? 0;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) return { success: false, error: "Failed to load findings." };

    return {
      success: true,
      data: {
        rows: (data ?? []).map((r) => mapFindingRow(r as Record<string, unknown>)),
        total: count ?? 0,
      },
    };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

export async function getComplianceFindingDetail(
  findingId: number
): Promise<ActionResult<ComplianceFindingDetail>> {
  try {
    const idParsed = z.number().int().positive().safeParse(findingId);
    if (!idParsed.success) return { success: false, error: "Invalid finding ID." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canViewCompliance(ctx)) return { success: false, error: "Permission denied.", code: "PERMISSION_DENIED" };

    const supabase = await createClient();
    const admin = createAdminClient();

    const { data, error } = await supabase
      .from("erp_ai_compliance_findings")
      .select("*")
      .eq("id", idParsed.data)
      .is("deleted_at", null)
      .maybeSingle();

    if (error || !data) return { success: false, error: "Finding not found." };

    const row = mapFindingRow(data as Record<string, unknown>);
    const entityLabel = await resolveEntityLabel(admin, row.entityType, row.entityId);

    let documentNo: string | null = null;
    let documentTitle: string | null = null;
    if (row.documentId) {
      const { data: doc } = await admin
        .from("dms_documents")
        .select("document_no, title")
        .eq("id", row.documentId)
        .maybeSingle();
      documentNo = (doc as { document_no?: string } | null)?.document_no ?? null;
      documentTitle = (doc as { title?: string } | null)?.title ?? null;
    }

    let ruleName: string | null = null;
    if (row.sourceRuleId) {
      const { data: rule } = await admin
        .from("dms_required_document_rules")
        .select("rule_name")
        .eq("id", row.sourceRuleId)
        .maybeSingle();
      ruleName = (rule as { rule_name?: string } | null)?.rule_name ?? null;
    }

    const { data: events } = await supabase
      .from("erp_ai_compliance_finding_events")
      .select("*")
      .eq("finding_id", idParsed.data)
      .order("created_at", { ascending: false });

    const detail: ComplianceFindingDetail = {
      ...row,
      entityLabel,
      documentNo,
      documentTitle,
      ruleName,
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

export async function reviewComplianceFinding(
  input: z.infer<typeof reviewInputSchema>
): Promise<ActionResult> {
  try {
    const parsed = reviewInputSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid review input." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canReviewCompliance(ctx)) return { success: false, error: "Permission denied.", code: "PERMISSION_DENIED" };

    const statusMap: Record<string, ComplianceFindingStatus> = {
      accepted: "accepted",
      waived: "waived",
      resolved: "resolved",
      false_positive: "false_positive",
      needs_more_review: "reviewed",
    };

    const newStatus = statusMap[parsed.data.decision];
    const now = new Date().toISOString();
    const supabase = await createClient();

    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      review_decision: parsed.data.decision,
      review_notes: parsed.data.reviewNotes ?? null,
      reviewed_by: ctx.profile.id,
      reviewed_at: now,
      updated_by: ctx.profile.id,
    };

    if (parsed.data.decision === "waived") {
      updatePayload.waived_by = ctx.profile.id;
      updatePayload.waived_at = now;
      updatePayload.waiver_reason = parsed.data.waiverReason ?? parsed.data.reviewNotes ?? null;
    }
    if (parsed.data.decision === "resolved") {
      updatePayload.resolved_by = ctx.profile.id;
      updatePayload.resolved_at = now;
    }

    const { error: updateErr } = await supabase
      .from("erp_ai_compliance_findings")
      .update(updatePayload)
      .eq("id", parsed.data.findingId)
      .is("deleted_at", null);

    if (updateErr) return { success: false, error: "Failed to update finding." };

    const eventType =
      parsed.data.decision === "accepted"
        ? "accepted"
        : parsed.data.decision === "waived"
          ? "waived"
          : parsed.data.decision === "resolved"
            ? "resolved"
            : parsed.data.decision === "false_positive"
              ? "false_positive"
              : "reviewed";

    await insertComplianceFindingEvent(supabase, {
      findingId: parsed.data.findingId,
      eventType,
      eventDataJson: { decision: parsed.data.decision },
      actorUserId: ctx.profile.id,
    });

    await logAudit({
      module_code: "ai",
      entity_name: "compliance_finding",
      entity_id: parsed.data.findingId,
      entity_reference: String(parsed.data.findingId),
      action: "ai_compliance_finding_reviewed",
      new_values: { decision: parsed.data.decision, status: newStatus },
    });

    revalidatePath("/admin/ai/compliance");
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

export async function markComplianceFindingResolved(input: {
  findingId: number;
  reviewNotes?: string;
}): Promise<ActionResult> {
  return reviewComplianceFinding({
    findingId: input.findingId,
    decision: "resolved",
    reviewNotes: input.reviewNotes,
  });
}

export async function waiveComplianceFinding(input: {
  findingId: number;
  waiverReason: string;
  reviewNotes?: string;
}): Promise<ActionResult> {
  return reviewComplianceFinding({
    findingId: input.findingId,
    decision: "waived",
    waiverReason: input.waiverReason,
    reviewNotes: input.reviewNotes,
  });
}

export async function markComplianceFindingFalsePositive(input: {
  findingId: number;
  reviewNotes?: string;
}): Promise<ActionResult> {
  return reviewComplianceFinding({
    findingId: input.findingId,
    decision: "false_positive",
    reviewNotes: input.reviewNotes,
  });
}

export async function getComplianceFindingCountForEntity(input: {
  entityType: string;
  entityId: number;
}): Promise<ActionResult<{ openCount: number; criticalCount: number; highCount: number }>> {
  try {
    const schema = z.object({
      entityType: z.enum(["party", "company", "branch", "site"]),
      entityId: z.coerce.number().int().positive(),
    });
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid input." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canViewCompliance(ctx)) {
      return { success: true, data: { openCount: 0, criticalCount: 0, highCount: 0 } };
    }

    const supabase = await createClient();
    const base = supabase
      .from("erp_ai_compliance_findings")
      .select("id", { count: "exact", head: true })
      .eq("entity_type", parsed.data.entityType)
      .eq("entity_id", parsed.data.entityId)
      .eq("status", "open")
      .is("deleted_at", null);

    const { count: openCount } = await base;
    const { count: criticalCount } = await supabase
      .from("erp_ai_compliance_findings")
      .select("id", { count: "exact", head: true })
      .eq("entity_type", parsed.data.entityType)
      .eq("entity_id", parsed.data.entityId)
      .eq("status", "open")
      .eq("severity", "critical")
      .is("deleted_at", null);
    const { count: highCount } = await supabase
      .from("erp_ai_compliance_findings")
      .select("id", { count: "exact", head: true })
      .eq("entity_type", parsed.data.entityType)
      .eq("entity_id", parsed.data.entityId)
      .eq("status", "open")
      .eq("severity", "high")
      .is("deleted_at", null);

    return {
      success: true,
      data: {
        openCount: openCount ?? 0,
        criticalCount: criticalCount ?? 0,
        highCount: highCount ?? 0,
      },
    };
  } catch {
    return { success: true, data: { openCount: 0, criticalCount: 0, highCount: 0 } };
  }
}

export async function getComplianceFindingCountForDocument(
  documentId: number
): Promise<ActionResult<{ openCount: number }>> {
  try {
    const idParsed = z.number().int().positive().safeParse(documentId);
    if (!idParsed.success) return { success: false, error: "Invalid document ID." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canViewCompliance(ctx)) return { success: true, data: { openCount: 0 } };

    const supabase = await createClient();
    const { count } = await supabase
      .from("erp_ai_compliance_findings")
      .select("id", { count: "exact", head: true })
      .eq("document_id", idParsed.data)
      .eq("status", "open")
      .is("deleted_at", null);

    return { success: true, data: { openCount: count ?? 0 } };
  } catch {
    return { success: true, data: { openCount: 0 } };
  }
}

export async function getComplianceSummaryForEntity(input: {
  entityType: string;
  entityId: number;
}): Promise<ActionResult<EntityComplianceSummary>> {
  try {
    const schema = z.object({
      entityType: z.string().min(1),
      entityId: z.coerce.number().int().positive(),
    });
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid input." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canViewCompliance(ctx)) return { success: false, error: "Permission denied." };

    const supabase = await createClient();
    const { data: findings } = await supabase
      .from("erp_ai_compliance_findings")
      .select("finding_type, severity, created_at")
      .eq("entity_type", parsed.data.entityType)
      .eq("entity_id", parsed.data.entityId)
      .eq("status", "open")
      .is("deleted_at", null);

    const rows = (findings ?? []) as Array<{
      finding_type: string;
      severity: string;
      created_at: string;
    }>;

    const openFindingCount = rows.length;
    const criticalCount = rows.filter((r) => r.severity === "critical").length;
    const highCount = rows.filter((r) => r.severity === "high").length;
    const types = new Set(rows.map((r) => r.finding_type));

    let overallStatus: EntityComplianceSummary["overallStatus"] = "ready";
    if (types.has("duplicate_conflict_open") && criticalCount > 0) {
      overallStatus = "blocked_candidate";
    } else if (types.has("missing_required_document")) {
      overallStatus = "missing_documents";
    } else if (types.has("expired_document")) {
      overallStatus = "expired";
    } else if (types.has("expiring_soon_document")) {
      overallStatus = "expiring_soon";
    } else if (openFindingCount > 0) {
      overallStatus = "needs_review";
    }

    const lastScannedAt =
      rows.length > 0
        ? rows.reduce((max, r) => (r.created_at > max ? r.created_at : max), rows[0].created_at)
        : null;

    return {
      success: true,
      data: {
        entityType: parsed.data.entityType,
        entityId: parsed.data.entityId,
        openFindingCount,
        criticalCount,
        highCount,
        overallStatus,
        lastScannedAt,
      },
    };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

export async function isComplianceCheckerEnabled(): Promise<boolean> {
  return isComplianceEnabled();
}

export async function getComplianceFindingSummary(): Promise<
  ActionResult<{
    open: number;
    critical: number;
    high: number;
    waivedResolved: number;
    featureEnabled: boolean;
  }>
> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canViewCompliance(ctx)) return { success: false, error: "Permission denied." };

    const supabase = await createClient();
    const featureEnabled = await isComplianceEnabled();

    const countOpen = async (extra?: { severity?: string }) => {
      let q = supabase
        .from("erp_ai_compliance_findings")
        .select("id", { count: "exact", head: true })
        .eq("status", "open")
        .is("deleted_at", null);
      if (extra?.severity) q = q.eq("severity", extra.severity);
      const { count } = await q;
      return count ?? 0;
    };

    const open = await countOpen();
    const critical = await countOpen({ severity: "critical" });
    const high = await countOpen({ severity: "high" });

    const { count: waivedResolved } = await supabase
      .from("erp_ai_compliance_findings")
      .select("id", { count: "exact", head: true })
      .in("status", ["waived", "resolved", "false_positive"])
      .is("deleted_at", null);

    return {
      success: true,
      data: {
        open,
        critical,
        high,
        waivedResolved: waivedResolved ?? 0,
        featureEnabled,
      },
    };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}
