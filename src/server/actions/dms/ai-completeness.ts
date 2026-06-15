"use server";

/**
 * DMS 12.3 — Document Completeness Scoring
 *
 * Deterministic, no AI calls.
 * Scores a document based on required metadata presence, key dates, extracted
 * text, and AI summary availability.
 *
 * Never logs content_text, OCR text, or AI responses.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { revalidatePath } from "next/cache";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type MissingField = {
  field_code: string;
  field_label_en: string;
};

export type CompletenessResult = {
  documentId: number;
  completenessScore: number;
  completenessPercent: number;
  completenessLabel: "complete" | "partial" | "incomplete";
  missingFields: MissingField[];
  requiredFieldsTotal: number;
  requiredFieldsFilled: number;
  hasIssueDate: boolean;
  hasExpiryDate: boolean;
  hasContentText: boolean;
  hasAiSummary: boolean;
};

// ── Feature flag ──────────────────────────────────────────────────────────────

async function isDmsCompletenessEnabled(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "DMS_COMPLETENESS")
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled ?? false;
  } catch {
    return false;
  }
}

// ── Label helper ──────────────────────────────────────────────────────────────

function completenessLabel(score: number): "complete" | "partial" | "incomplete" {
  if (score >= 0.90) return "complete";
  if (score >= 0.60) return "partial";
  return "incomplete";
}

// ── Core evaluation ───────────────────────────────────────────────────────────

export async function evaluateDmsDocumentCompleteness(
  documentId: number
): Promise<ActionResult<CompletenessResult>> {
  try {
    const parsed = z.number().int().positive().safeParse(documentId);
    if (!parsed.success) return { success: false, error: "Invalid document ID" };

    if (!(await isDmsCompletenessEnabled())) {
      return { success: false, error: "DMS Completeness feature is not enabled." };
    }

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (
      !hasPermission(ctx, "dms.documents.edit") &&
      !hasPermission(ctx, "dms.admin") &&
      !ctx.roleCodes.includes("system_admin")
    ) {
      return { success: false, error: "Permission denied — requires dms.documents.edit or dms.admin" };
    }

    const supabase = await createClient();

    // 1. Load document core fields
    const { data: doc, error: docErr } = await supabase
      .from("dms_documents")
      .select(`
        id, document_no, document_type_id, issue_date, expiry_date,
        ai_summary, ai_summary_status, deleted_at,
        document_type:dms_document_types(requires_expiry_tracking)
      `)
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();

    if (docErr || !doc) {
      return { success: false, error: docErr?.message ?? "Document not found" };
    }

    const typedDoc = doc as Record<string, unknown>;
    const docType = typedDoc.document_type as { requires_expiry_tracking?: boolean } | null;
    const requiresExpiryTracking = docType?.requires_expiry_tracking ?? false;

    // 2. Load required metadata definitions for this document type
    const { data: metaDefs, error: defsErr } = await supabase
      .from("dms_metadata_definitions")
      .select("id, field_code, field_label_en")
      .eq("document_type_id", typedDoc.document_type_id as number)
      .eq("is_required", true)
      .eq("is_active", true)
      .is("deleted_at", null);

    if (defsErr) {
      return { success: false, error: "Failed to load metadata definitions: " + defsErr.message };
    }

    const requiredDefs = (metaDefs ?? []) as Array<{ id: number; field_code: string; field_label_en: string }>;

    // 3. Load existing metadata values for this document
    let filledDefinitionIds = new Set<number>();
    if (requiredDefs.length > 0) {
      const defIds = requiredDefs.map((d) => d.id);
      const { data: metaValues } = await supabase
        .from("dms_document_metadata_values")
        .select("definition_id, value_text, value_number, value_date, value_boolean, value_json")
        .eq("document_id", documentId)
        .in("definition_id", defIds);

      // A value is "filled" if at least one value field is non-null and non-empty-string
      (metaValues ?? []).forEach((v) => {
        const mv = v as Record<string, unknown>;
        const hasSomeValue =
          (mv.value_text !== null && mv.value_text !== "") ||
          mv.value_number !== null ||
          mv.value_date !== null ||
          mv.value_boolean !== null ||
          mv.value_json !== null;
        if (hasSomeValue) {
          filledDefinitionIds.add(mv.definition_id as number);
        }
      });
    }

    // 4. Check content text existence
    const { data: contentRow } = await supabase
      .from("dms_document_content")
      .select("id")
      .eq("document_id", documentId)
      .not("content_text", "is", null)
      .maybeSingle();

    const hasContentText = contentRow !== null;

    // 5. Compute score components
    const totalRequired = requiredDefs.length;
    const filledRequired = requiredDefs.filter((d) => filledDefinitionIds.has(d.id)).length;

    const requiredRatio = totalRequired > 0 ? filledRequired / totalRequired : 1.0;
    let score = requiredRatio * 0.80;

    const hasIssueDate = !!(typedDoc.issue_date as string | null);
    const hasExpiryDate = !!(typedDoc.expiry_date as string | null);
    const aiSummaryStatus = (typedDoc.ai_summary_status as string | null) ?? null;
    const hasAiSummary =
      !!(typedDoc.ai_summary as string | null) && aiSummaryStatus === "complete";

    if (hasIssueDate) score += 0.05;
    if (hasExpiryDate && requiresExpiryTracking) score += 0.05;
    if (hasContentText) score += 0.05;
    if (hasAiSummary) score += 0.05;

    score = Math.min(1.0, score);
    // Round to 4 decimal places for NUMERIC(5,4)
    score = Math.round(score * 10000) / 10000;

    // 6. Build missing fields list
    const missingFields: MissingField[] = requiredDefs
      .filter((d) => !filledDefinitionIds.has(d.id))
      .map((d) => ({ field_code: d.field_code, field_label_en: d.field_label_en }));

    // Add structural missing fields
    if (!hasIssueDate) {
      missingFields.push({ field_code: "issue_date", field_label_en: "Issue Date" });
    }
    if (!hasExpiryDate && requiresExpiryTracking) {
      missingFields.push({ field_code: "expiry_date", field_label_en: "Expiry Date" });
    }

    // 7. Persist
    const now = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from("dms_documents")
      .update({
        completeness_score: score,
        missing_fields_json: missingFields.length > 0 ? missingFields : null,
        updated_at: now,
      })
      .eq("id", documentId);

    if (updateErr) {
      return { success: false, error: "Failed to save completeness: " + updateErr.message };
    }

    // 8. Audit log (safe metadata only)
    await logAudit({
      module_code: "DMS",
      entity_name: "dms_documents",
      entity_id: documentId,
      entity_reference: typedDoc.document_no as string,
      action: "update",
      new_values: {
        action: "completeness_evaluated",
        document_id: documentId,
        completeness_score: score,
        missing_fields_count: missingFields.length,
        required_fields_total: totalRequired,
        required_fields_filled: filledRequired,
      },
    });

    revalidatePath(`/dms/documents/record/${documentId}`);

    const result: CompletenessResult = {
      documentId,
      completenessScore: score,
      completenessPercent: Math.round(score * 100),
      completenessLabel: completenessLabel(score),
      missingFields,
      requiredFieldsTotal: totalRequired,
      requiredFieldsFilled: filledRequired,
      hasIssueDate,
      hasExpiryDate,
      hasContentText,
      hasAiSummary,
    };

    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Lightweight read for UI card ──────────────────────────────────────────────

export type DocumentCompletenessRow = {
  documentId: number;
  completenessScore: number | null;
  completenessPercent: number | null;
  completenessLabel: "complete" | "partial" | "incomplete" | null;
  missingFields: MissingField[];
};

export async function getDmsDocumentCompletenessStatus(
  documentId: number
): Promise<ActionResult<DocumentCompletenessRow>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (
      !hasPermission(ctx, "dms.documents.view") &&
      !hasPermission(ctx, "dms.admin")
    ) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_documents")
      .select("id, completeness_score, missing_fields_json")
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();

    if (error || !data) return { success: false, error: error?.message ?? "Not found" };

    const d = data as { id: number; completeness_score: number | null; missing_fields_json: unknown };
    const score = d.completeness_score;
    const missingFields = Array.isArray(d.missing_fields_json)
      ? (d.missing_fields_json as MissingField[])
      : [];

    return {
      success: true,
      data: {
        documentId,
        completenessScore: score,
        completenessPercent: score !== null ? Math.round(score * 100) : null,
        completenessLabel: score !== null ? completenessLabel(score) : null,
        missingFields,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
