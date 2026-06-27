"use server";

/**
 * ERP COMMON AI.2 — Document Understanding Server Action
 *
 * Read-only aggregation of all DMS AI intelligence for a document.
 * Returns DmsDocumentUnderstanding view model.
 *
 * Security rules:
 * - Never returns raw OCR text, content_text body, prompt text,
 *   raw AI response JSON, embedding vectors, or API keys.
 * - AI summary text is redacted for non-admin on hr/legal/executive documents.
 * - No AI calls — aggregates existing stored intelligence only.
 * - No writes to any table.
 * - Feature flag ERP_AI_DOC_UNDERSTANDING must be enabled.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import {
  getCommonAiEntityRegistry,
  isCommonAiEntityType,
} from "@/lib/ai/common/registry/index";
import type { DmsDocumentUnderstanding } from "@/lib/dms/understanding/types";
import {
  calculateExpiryStatus,
  sanitizeJsonLabels,
  calculateDocumentUnderstandingHealth,
  buildRecommendedUnderstandingActions,
} from "@/lib/dms/understanding/understanding-builder";
import { deriveDocumentOcrSummary } from "@/lib/dms/ocr/derive-document-ocr-summary";
import {
  formatDmsLinkEntityFallback,
  resolveDmsLinkEntityDisplayNames,
} from "@/lib/dms/resolve-link-entity-display-name";
import { getDmsEntityTypeLabel } from "@/lib/dms/dms-entity-types";

// ── Types ─────────────────────────────────────────────────────────────────────

type ActionResult<T = undefined> = T extends undefined
  ? { success: boolean; error?: string; code?: string }
  : { success: boolean; data?: T; error?: string; code?: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const CONFIDENTIAL_LEVELS = ["hr", "legal", "executive"];
const STAGE_1_ENTITY_TYPES = ["company", "party"] as const;

type FieldConfidenceEntry = { label?: string; confidence_label?: string };

/** field_confidence_json is stored as Record<fieldCode, { score, label, ... }>, not an array. */
function normalizeFieldConfidenceEntries(
  raw: unknown
): FieldConfidenceEntry[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((item): item is FieldConfidenceEntry => !!item && typeof item === "object");
  }
  if (typeof raw === "object") {
    return Object.values(raw as Record<string, FieldConfidenceEntry>);
  }
  return [];
}

function isLowConfidenceField(entry: FieldConfidenceEntry): boolean {
  const label = (entry.confidence_label ?? entry.label ?? "").toLowerCase();
  return label === "low" || label === "needs_manual_review";
}

// ── Feature flag check ────────────────────────────────────────────────────────

async function isDocumentUnderstandingEnabled(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "ERP_AI_DOC_UNDERSTANDING")
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled === true;
  } catch {
    return false;
  }
}

// ── Main action ───────────────────────────────────────────────────────────────

/**
 * Aggregates all available DMS AI intelligence for a document.
 * Read-only. No AI calls. No writes.
 */
export async function getDmsDocumentUnderstanding(
  documentId: number
): Promise<ActionResult<DmsDocumentUnderstanding>> {
  try {
    // 1. Validate
    const parsed = z.number().int().positive().safeParse(documentId);
    if (!parsed.success) return { success: false, error: "Invalid document ID." };

    // 2. Auth
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };

    const isAdmin =
      hasPermission(ctx, "dms.admin") || ctx.roleCodes.includes("system_admin");
    const canView =
      hasPermission(ctx, "dms.documents.view") ||
      hasPermission(ctx, "dms.documents.edit") ||
      isAdmin;

    if (!canView) {
      return { success: false, error: "You do not have permission to view this document.", code: "PERMISSION_DENIED" };
    }

    // 3. Feature flag check
    const flagEnabled = await isDocumentUnderstandingEnabled();
    if (!flagEnabled) {
      return {
        success: false,
        error: "AI Document Understanding is not enabled. Enable ERP_AI_DOC_UNDERSTANDING in AI Settings.",
        code: "FEATURE_DISABLED",
      };
    }

    const supabase = await createClient();

    // 4. Load core document
    const { data: docData, error: docErr } = await supabase
      .from("dms_documents")
      .select(`
        id, document_no, title, status, confidentiality_level,
        issue_date, expiry_date, deleted_at,
        ocr_last_run_at, ocr_text_available,
        ai_summary, ai_summary_status, ai_summary_updated_at, ai_summary_model, ai_summary_error,
        completeness_score, missing_fields_json,
        ai_risk_score, ai_risk_level, ai_risk_reasons_json,
        summary_embedding_status, summary_embedding_model, summary_embedding_source,
        document_type:dms_document_types(type_code, name_en, name_ar),
        category:dms_document_categories(name_en)
      `)
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();

    if (docErr || !docData) {
      return { success: false, error: "Document not found or access denied." };
    }

    const doc = docData as Record<string, unknown>;
    const confidentiality = (doc.confidentiality_level as string) ?? "internal";
    const isConfidential = CONFIDENTIAL_LEVELS.includes(confidentiality);

    // 5. Expiry computation
    const expiryDate = doc.expiry_date as string | null;
    const { status: expiryStatus, daysUntilExpiry } = calculateExpiryStatus(expiryDate);

    // 6. Document type + category
    const docType = doc.document_type as { type_code?: string; name_en?: string; name_ar?: string } | null;
    const category = doc.category as { name_en?: string } | null;

    // 7. OCR file status — derive from files, not document flag alone
    const { data: fileRows } = await supabase
      .from("dms_document_files")
      .select("id, ocr_status, ocr_text, ocr_completed_at")
      .eq("document_id", documentId)
      .is("deleted_at", null);

    const files = (fileRows ?? []) as Array<{
      id: number;
      ocr_status: string | null;
      ocr_text: string | null;
      ocr_completed_at: string | null;
    }>;

    // 8. Content text metadata (no body)
    const { data: contentRow } = await supabase
      .from("dms_document_content")
      .select("char_count, is_truncated, content_text_source")
      .eq("document_id", documentId)
      .maybeSingle();

    const content = contentRow as {
      char_count?: number | null;
      is_truncated?: boolean | null;
      content_text_source?: string | null;
    } | null;

    const contentTextAvailable = !!content && (content.char_count ?? 0) > 0;

    // 9. AI extraction result (latest — safe metadata only; raw_ocr_text used server-side for OCR detection)
    const { data: extractRows } = await supabase
      .from("dms_ai_extraction_results")
      .select("ai_status, classification_score, classification_reason, field_confidence_json, raw_ocr_text, created_at")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false })
      .limit(1);

    const latestExtract = ((extractRows ?? []) as Array<Record<string, unknown>>)[0] ?? null;
    const hasRawOcrInExtract =
      typeof latestExtract?.raw_ocr_text === "string" &&
      latestExtract.raw_ocr_text.trim().length > 0;

    const ocrSummary = deriveDocumentOcrSummary({
      files,
      documentOcrTextAvailable: doc.ocr_text_available as boolean | null,
      documentOcrLastRunAt: doc.ocr_last_run_at as string | null,
      contentTextAvailable,
      hasRawOcrInExtract,
    });
    let extractedFieldCount = 0;
    let lowConfidenceCount = 0;
    let needsHumanReview = false;

    if (latestExtract?.field_confidence_json) {
      const fields = normalizeFieldConfidenceEntries(latestExtract.field_confidence_json);
      extractedFieldCount = fields.length;
      lowConfidenceCount = fields.filter(isLowConfidenceField).length;
      needsHumanReview = lowConfidenceCount > 0;
    }

    // 10. Metadata count
    const { count: metadataFilled } = await supabase
      .from("dms_document_metadata_values")
      .select("id", { count: "exact", head: true })
      .eq("document_id", documentId)
      .not("value", "is", null);

    const { count: metadataTotal } = await supabase
      .from("dms_document_metadata_values")
      .select("id", { count: "exact", head: true })
      .eq("document_id", documentId);

    // 11. Tags
    const { data: tagRows } = await supabase
      .from("dms_document_tags")
      .select("tag:dms_tags(tag_name)")
      .eq("document_id", documentId);

    const tagNames = ((tagRows ?? []) as Array<{ tag?: { tag_name?: string } | null }>)
      .map((r) => r.tag?.tag_name ?? "")
      .filter(Boolean)
      .slice(0, 10);

    // 12. Pending tag suggestions
    const { count: pendingTagCount } = await supabase
      .from("dms_ai_tag_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("document_id", documentId)
      .eq("status", "pending");

    // 13. Accepted entity links + entity display names
    const { data: linkRows } = await supabase
      .from("dms_document_links")
      .select("entity_type, entity_id, is_primary")
      .eq("document_id", documentId)
      .is("deleted_at", null);

    const links = (linkRows ?? []) as Array<{
      entity_type: string;
      entity_id: number;
      is_primary: boolean;
    }>;

    const linkedEntities: DmsDocumentUnderstanding["tagsLinks"]["linkedEntities"] = [];
    const linkSlice = links.slice(0, 5);
    const displayNameMap = await resolveDmsLinkEntityDisplayNames(supabase, linkSlice);

    for (const link of linkSlice) {
      const key = `${link.entity_type}:${link.entity_id}`;
      linkedEntities.push({
        entityType: link.entity_type,
        entityTypeLabel: getDmsEntityTypeLabel(link.entity_type),
        entityId: link.entity_id,
        entityDisplayName:
          displayNameMap.get(key) ??
          formatDmsLinkEntityFallback(link.entity_type, link.entity_id),
        isPrimary: link.is_primary,
      });
    }

    // 14. Pending link suggestions
    const { count: pendingLinkCount } = await supabase
      .from("dms_ai_link_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("document_id", documentId)
      .eq("status", "pending");

    // 15. ORCH.1 orchestration status
    const { data: sessionRow } = await supabase
      .from("dms_upload_sessions")
      .select("orchestration_status, orchestration_steps_json, orchestration_started_at, orchestration_completed_at")
      .eq("document_id", documentId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const session = sessionRow as Record<string, unknown> | null;
    const orchSteps = (session?.orchestration_steps_json as Array<{ step: string; status: string; durationMs?: number | null }> | null) ?? [];
    const orchCompleted = orchSteps.filter((s) => s.status === "completed").length;
    const orchFailed = orchSteps.filter((s) => s.status === "failed").length;

    // 16. Field candidates from COMMON AI.1 registry
    const primaryStage1Link = linkedEntities.find(
      (e) => STAGE_1_ENTITY_TYPES.includes(e.entityType as typeof STAGE_1_ENTITY_TYPES[number])
    );

    let fieldCandidates: DmsDocumentUnderstanding["fieldCandidates"] = {
      entityType: null,
      entityId: null,
      registryAvailable: false,
      candidateFields: [],
      pendingSuggestionCount: 0,
      hasAiReviewTab: false,
      aiReviewRoute: null,
    };

    if (primaryStage1Link && isCommonAiEntityType(primaryStage1Link.entityType)) {
      const registry = getCommonAiEntityRegistry(primaryStage1Link.entityType);
      if (registry) {
        const typeCode = docType?.type_code ?? "";

        // Count pending suggestions for this entity
        const { count: pendingSuggCount } = await supabase
          .from("erp_ai_field_suggestions")
          .select("id", { count: "exact", head: true })
          .eq("entity_type", primaryStage1Link.entityType)
          .eq("entity_id", primaryStage1Link.entityId)
          .eq("status", "pending")
          .is("deleted_at", null);

        // Get pending suggestion IDs by field
        const { data: pendingSuggRows } = await supabase
          .from("erp_ai_field_suggestions")
          .select("id, target_field")
          .eq("entity_type", primaryStage1Link.entityType)
          .eq("entity_id", primaryStage1Link.entityId)
          .eq("status", "pending")
          .is("deleted_at", null)
          .limit(20);

        const pendingByField = new Map(
          ((pendingSuggRows ?? []) as Array<{ id: number; target_field: string }>).map(
            (r) => [r.target_field, r.id]
          )
        );

        const candidates = registry.fields
          .filter((f) => f.isAiEligible)
          .map((f) => ({
            fieldLabel: f.fieldLabel,
            targetField: f.targetField,
            targetTable: f.targetTable,
            documentTypeHints: f.documentTypeHints,
            hasPendingSuggestion: pendingByField.has(f.targetField),
            pendingSuggestionId: pendingByField.get(f.targetField) ?? null,
            safetyClassification: f.safetyClassification,
            relevance: (typeCode && f.documentTypeHints.includes(typeCode))
              ? "high" as const
              : "general" as const,
          }))
          .sort((a, b) => (a.relevance === "high" ? -1 : 1) - (b.relevance === "high" ? -1 : 1));

        const aiReviewRoute =
          primaryStage1Link.entityType === "company"
            ? `/admin/organizations/record/${primaryStage1Link.entityId}`
            : primaryStage1Link.entityType === "party"
            ? `/admin/master-data/parties/record/${primaryStage1Link.entityId}`
            : null;

        fieldCandidates = {
          entityType: primaryStage1Link.entityType,
          entityId: primaryStage1Link.entityId,
          registryAvailable: true,
          candidateFields: candidates,
          pendingSuggestionCount: pendingSuggCount ?? 0,
          hasAiReviewTab: true,
          aiReviewRoute,
        };
      }
    }

    // 17. Build understanding view model
    const missing_fields_json = doc.missing_fields_json as unknown;
    const ai_risk_reasons_json = doc.ai_risk_reasons_json as unknown;

    // 17b. Duplicate/conflict candidate count (COMMON AI.3 — read-only)
    let duplicatePendingCount = 0;
    if (hasPermission(ctx, "ai.duplicates.view") || hasPermission(ctx, "ai.common.admin") || isAdmin) {
      const { count: dupCount } = await supabase
        .from("erp_ai_duplicate_candidates")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .is("deleted_at", null)
        .or(
          `source_document_id.eq.${parsed.data},` +
            `and(entity_type_a.eq.dms_document,entity_id_a.eq.${parsed.data}),` +
            `and(entity_type_b.eq.dms_document,entity_id_b.eq.${parsed.data})`
        );
      duplicatePendingCount = dupCount ?? 0;
    }

    // 17c. Compliance findings count (COMMON AI.4 — read-only)
    let complianceOpenCount = 0;
    let complianceCriticalCount = 0;
    if (hasPermission(ctx, "ai.compliance.view") || hasPermission(ctx, "ai.common.admin") || isAdmin) {
      const { count: compCount } = await supabase
        .from("erp_ai_compliance_findings")
        .select("id", { count: "exact", head: true })
        .eq("document_id", parsed.data)
        .eq("status", "open")
        .is("deleted_at", null);
      complianceOpenCount = compCount ?? 0;

      const { count: critCount } = await supabase
        .from("erp_ai_compliance_findings")
        .select("id", { count: "exact", head: true })
        .eq("document_id", parsed.data)
        .eq("status", "open")
        .eq("severity", "critical")
        .is("deleted_at", null);
      complianceCriticalCount = critCount ?? 0;
    }

    // 17d. Linked entity risk (COMMON AI.5 — read-only)
    let entityRisk: DmsDocumentUnderstanding["entityRisk"] = null;
    const primaryRiskEntity =
      linkedEntities.find((e) => e.isPrimary) ??
      linkedEntities.find((e) =>
        ["company", "party", "branch", "site"].includes(e.entityType)
      );

    if (
      primaryRiskEntity &&
      (hasPermission(ctx, "ai.risk.view") ||
        hasPermission(ctx, "ai.common.admin") ||
        isAdmin)
    ) {
      const { data: riskRow } = await supabase
        .from("erp_ai_risk_scores")
        .select("risk_score, risk_level, status, calculated_at, stale_at")
        .eq("entity_type", primaryRiskEntity.entityType)
        .eq("entity_id", primaryRiskEntity.entityId)
        .is("deleted_at", null)
        .not("status", "in", '("superseded","failed")')
        .maybeSingle();

      if (riskRow) {
        const r = riskRow as Record<string, unknown>;
        const calculatedAt = r.calculated_at as string;
        const staleAt = (r.stale_at as string | null) ?? null;
        const status = r.status as string;
        const isStale =
          status === "stale" ||
          staleAt != null ||
          Date.now() - new Date(calculatedAt).getTime() > 24 * 60 * 60 * 1000;

        entityRisk = {
          entityType: primaryRiskEntity.entityType,
          entityId: primaryRiskEntity.entityId,
          riskScore: r.risk_score != null ? Number(r.risk_score) : null,
          riskLevel: (r.risk_level as string | null) ?? null,
          status,
          isStale,
          reviewRoute: `/admin/ai/risk?entityType=${primaryRiskEntity.entityType}&entityId=${primaryRiskEntity.entityId}`,
        };
      }
    }

    const understanding: DmsDocumentUnderstanding = {
      documentId,
      generatedAt: new Date().toISOString(),

      identity: {
        documentNo: doc.document_no as string | null,
        title: doc.title as string | null,
        typeCode: docType?.type_code ?? null,
        typeName: docType?.name_en ?? null,
        typeNameAr: docType?.name_ar ?? null,
        categoryName: category?.name_en ?? null,
        status: doc.status as string | null,
        confidentialityLevel: confidentiality,
        issueDate: doc.issue_date as string | null,
        expiryDate,
        daysUntilExpiry,
        expiryStatus,
      },

      ocrStatus: {
        ocrLastRunAt: ocrSummary.ocrLastRunAt,
        ocrTextAvailable: ocrSummary.ocrTextAvailable,
        ocrRunComplete: ocrSummary.ocrRunComplete,
        fileCount: ocrSummary.fileCount,
        filesWithOcr: ocrSummary.filesWithOcr,
        contentTextAvailable,
        contentTextCharCount: content?.char_count ?? null,
        contentTextTruncated: content?.is_truncated ?? false,
        contentTextSource: content?.content_text_source ?? null,
      },

      summaryStatus: {
        status: doc.ai_summary_status as string | null,
        // Gate: redact for non-admin on confidential documents
        summaryText: isConfidential && !isAdmin
          ? null
          : (doc.ai_summary as string | null),
        isConfidentialRedacted: isConfidential && !isAdmin,
        summaryModel: doc.ai_summary_model as string | null,
        summaryUpdatedAt: doc.ai_summary_updated_at as string | null,
      },

      extractionStatus: {
        hasResult: !!latestExtract,
        aiStatus: latestExtract?.ai_status as string | null ?? null,
        classificationConfidence: latestExtract?.classification_score as number | null ?? null,
        classificationReason: latestExtract?.classification_reason as string | null ?? null,
        extractedFieldCount,
        lowConfidenceFieldCount: lowConfidenceCount,
        needsHumanReview,
      },

      completeness: {
        score: doc.completeness_score != null ? Number(doc.completeness_score) : null,
        missingFieldLabels: sanitizeJsonLabels(missing_fields_json, 8),
        totalMetadataFields: metadataTotal ?? 0,
        filledMetadataFields: metadataFilled ?? 0,
      },

      risk: {
        riskLevel: doc.ai_risk_level as string | null,
        riskScore: doc.ai_risk_score != null ? Number(doc.ai_risk_score) : null,
        riskReasonLabels: sanitizeJsonLabels(ai_risk_reasons_json, 6),
        isExpired: expiryStatus === "expired",
        isExpiringSoon: expiryStatus === "expiring_soon",
      },

      embedding: {
        status: doc.summary_embedding_status as string | null,
        model: doc.summary_embedding_model as string | null,
        source: doc.summary_embedding_source as string | null,
        readyForSemanticSearch: doc.summary_embedding_status === "complete",
      },

      tagsLinks: {
        tagCount: tagNames.length,
        tagNames,
        pendingTagSuggestions: pendingTagCount ?? 0,
        linkCount: links.length,
        linkedEntities,
        pendingLinkSuggestions: pendingLinkCount ?? 0,
      },

      orchestrationStatus: {
        available: !!session,
        status: session?.orchestration_status as string | null ?? null,
        steps: orchSteps.slice(0, 15),
        completedSteps: orchCompleted,
        failedSteps: orchFailed,
      },

      fieldCandidates,

      duplicateCandidates: {
        pendingCount: duplicatePendingCount,
        hasPending: duplicatePendingCount > 0,
        reviewRoute: duplicatePendingCount > 0
          ? `/admin/ai/duplicates?documentId=${parsed.data}`
          : null,
      },

      complianceFindings: {
        openCount: complianceOpenCount,
        hasCritical: complianceCriticalCount > 0,
        reviewRoute: complianceOpenCount > 0
          ? `/admin/ai/compliance?documentId=${parsed.data}`
          : null,
      },

      entityRisk,

      // Computed below
      health: {
        score: 0,
        label: "Needs Attention",
        hasOcr: false,
        hasSummary: false,
        hasIntelligence: false,
        hasEmbedding: false,
        hasLinks: false,
        warningCount: 0,
      },
      actions: [],
    };

    // 18. Compute health + actions
    understanding.health = calculateDocumentUnderstandingHealth(understanding);
    understanding.actions = buildRecommendedUnderstandingActions(understanding);

    return { success: true, data: understanding };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}
