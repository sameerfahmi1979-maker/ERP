"use server";

/**
 * DMS 12.3 — Document Risk Scoring
 *
 * Deterministic, no AI calls.
 * Scores a document based on expiry status, missing required data, classification
 * confidence, content quality, and structural gaps.
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

export type RiskReason = {
  code: string;
  message: string;
  score: number;
};

export type RiskLevel = "none" | "low" | "medium" | "high" | "critical";

export type RiskResult = {
  documentId: number;
  riskScore: number;
  riskLevel: RiskLevel;
  riskReasons: RiskReason[];
  updatedAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function riskLevelFromScore(score: number): RiskLevel {
  if (score <= 0.10) return "none";
  if (score <= 0.30) return "low";
  if (score <= 0.55) return "medium";
  if (score <= 0.80) return "high";
  return "critical";
}

async function isDmsRiskScoreEnabled(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "DMS_RISK_SCORE")
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled ?? false;
  } catch {
    return false;
  }
}

// ── Core evaluation ───────────────────────────────────────────────────────────

export async function evaluateDmsDocumentRisk(
  documentId: number
): Promise<ActionResult<RiskResult>> {
  try {
    const parsed = z.number().int().positive().safeParse(documentId);
    if (!parsed.success) return { success: false, error: "Invalid document ID" };

    if (!(await isDmsRiskScoreEnabled())) {
      return { success: false, error: "DMS Risk Score feature is not enabled." };
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

    // 1. Load document
    const { data: doc, error: docErr } = await supabase
      .from("dms_documents")
      .select(`
        id, document_no, expiry_date, issue_date, document_type_id,
        confidentiality_level, owner_user_id,
        completeness_score, missing_fields_json, ai_warnings_json, deleted_at,
        document_type:dms_document_types(requires_expiry_tracking)
      `)
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();

    if (docErr || !doc) {
      return { success: false, error: docErr?.message ?? "Document not found" };
    }

    const d = doc as Record<string, unknown>;
    const docType = d.document_type as { requires_expiry_tracking?: boolean } | null;
    const requiresExpiryTracking = docType?.requires_expiry_tracking ?? false;

    // 2. Load latest AI extraction result for classification score
    const { data: latestResult } = await supabase
      .from("dms_ai_extraction_results")
      .select("classification_score, classification_confidence")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const classificationScore = latestResult
      ? (latestResult as Record<string, unknown>).classification_score as number | null
      : null;

    // 3. Load content row
    const { data: contentRow } = await supabase
      .from("dms_document_content")
      .select("is_truncated, content_text_char_count")
      .eq("document_id", documentId)
      .maybeSingle();

    const isTruncated = contentRow ? (contentRow as Record<string, unknown>).is_truncated as boolean : false;

    // 4. Count missing required metadata fields
    const missingFieldsJson = d.missing_fields_json;
    const missingFieldsCount = Array.isArray(missingFieldsJson) ? missingFieldsJson.length : 0;
    // Subtract structural fields (issue_date, expiry_date) from metadata-specific count
    const metadataMissingCount = Array.isArray(missingFieldsJson)
      ? (missingFieldsJson as Array<{ field_code: string }>).filter(
          (f) => f.field_code !== "issue_date" && f.field_code !== "expiry_date"
        ).length
      : 0;

    // 5. Compute risk score
    const reasons: RiskReason[] = [];
    let risk = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiryDate = (d.expiry_date as string | null)
      ? new Date(d.expiry_date as string)
      : null;

    // Expiry checks
    if (expiryDate) {
      const daysToExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / 86400000);
      if (daysToExpiry < 0) {
        risk += 0.40;
        reasons.push({
          code: "expired",
          message: `Document expired on ${(d.expiry_date as string).substring(0, 10)}`,
          score: 0.40,
        });
      } else if (daysToExpiry <= 30) {
        risk += 0.25;
        reasons.push({
          code: "expiring_soon",
          message: `Document expires in ${daysToExpiry} day${daysToExpiry === 1 ? "" : "s"}`,
          score: 0.25,
        });
      }
    } else if (requiresExpiryTracking) {
      risk += 0.20;
      reasons.push({
        code: "missing_expiry",
        message: "Expiry date is missing for a document type that requires expiry tracking",
        score: 0.20,
      });
    }

    // Issue date missing
    if (!(d.issue_date as string | null)) {
      risk += 0.10;
      reasons.push({
        code: "missing_issue_date",
        message: "Issue date is missing",
        score: 0.10,
      });
    }

    // Required metadata missing (capped at 0.15)
    if (metadataMissingCount > 0) {
      const metaScore = Math.min(0.15, metadataMissingCount * 0.05);
      risk += metaScore;
      reasons.push({
        code: "missing_required_fields",
        message: `${metadataMissingCount} required metadata field${metadataMissingCount > 1 ? "s are" : " is"} missing`,
        score: metaScore,
      });
    }

    // Classification score < 0.5
    if (classificationScore !== null && classificationScore < 0.5) {
      risk += 0.15;
      reasons.push({
        code: "low_classification_confidence",
        message: `AI classification confidence is low (${Math.round((classificationScore ?? 0) * 100)}%)`,
        score: 0.15,
      });
    }

    // Content text truncated
    if (isTruncated) {
      risk += 0.05;
      reasons.push({
        code: "content_truncated",
        message: "Document text was truncated — full content may not be captured",
        score: 0.05,
      });
    }

    // Confidential document with no owner
    const confidentiality = (d.confidentiality_level as string) ?? "internal";
    if (
      ["hr", "legal", "executive"].includes(confidentiality) &&
      !(d.owner_user_id as number | null)
    ) {
      risk += 0.15;
      reasons.push({
        code: "confidential_no_owner",
        message: "Confidential document has no assigned owner",
        score: 0.15,
      });
    }

    // Low completeness score
    const completenessScore = (d.completeness_score as number | null) ?? null;
    if (completenessScore !== null && completenessScore < 0.5) {
      risk += 0.15;
      reasons.push({
        code: "low_completeness",
        message: `Document completeness is low (${Math.round(completenessScore * 100)}%)`,
        score: 0.15,
      });
    }

    risk = Math.min(1.0, risk);
    risk = Math.round(risk * 10000) / 10000;

    const riskLevel = riskLevelFromScore(risk);
    const now = new Date().toISOString();

    // 6. Persist
    const { error: updateErr } = await supabase
      .from("dms_documents")
      .update({
        ai_risk_score: risk,
        ai_risk_level: riskLevel,
        ai_risk_reasons_json: reasons.length > 0 ? reasons : null,
        ai_risk_updated_at: now,
        updated_at: now,
      })
      .eq("id", documentId);

    if (updateErr) {
      return { success: false, error: "Failed to save risk score: " + updateErr.message };
    }

    // 7. Audit log (safe metadata only)
    await logAudit({
      module_code: "DMS",
      entity_name: "dms_documents",
      entity_id: documentId,
      entity_reference: d.document_no as string,
      action: "update",
      new_values: {
        action: "risk_evaluated",
        document_id: documentId,
        risk_score: risk,
        risk_level: riskLevel,
        risk_reasons_count: reasons.length,
        missing_fields_count: missingFieldsCount,
      },
    });

    revalidatePath(`/dms/documents/record/${documentId}`);

    return {
      success: true,
      data: {
        documentId,
        riskScore: risk,
        riskLevel,
        riskReasons: reasons,
        updatedAt: now,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Lightweight read for UI card ──────────────────────────────────────────────

export type DocumentRiskRow = {
  documentId: number;
  riskScore: number | null;
  riskLevel: RiskLevel | null;
  riskReasons: RiskReason[];
  riskUpdatedAt: string | null;
};

export async function getDmsDocumentRiskStatus(
  documentId: number
): Promise<ActionResult<DocumentRiskRow>> {
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
      .select("id, ai_risk_score, ai_risk_level, ai_risk_reasons_json, ai_risk_updated_at")
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();

    if (error || !data) return { success: false, error: error?.message ?? "Not found" };

    const d = data as Record<string, unknown>;
    return {
      success: true,
      data: {
        documentId,
        riskScore: (d.ai_risk_score as number | null) ?? null,
        riskLevel: (d.ai_risk_level as RiskLevel | null) ?? null,
        riskReasons: Array.isArray(d.ai_risk_reasons_json)
          ? (d.ai_risk_reasons_json as RiskReason[])
          : [],
        riskUpdatedAt: (d.ai_risk_updated_at as string | null) ?? null,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
