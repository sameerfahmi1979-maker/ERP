"use server";

/**
 * HR.12 — HR AI Fill from Documents
 *
 * Generates AI field-fill suggestions for an employee by reviewing
 * DMS documents linked to the employee entity.
 *
 * Safety rules:
 * - Does not save suggestions to DB (ephemeral review).
 * - Does not expose raw OCR/DMS AI text to client.
 * - Requires hr.ai.use + dms.documents.view.
 * - Requires ERP_AI_HR_EMPLOYEE_ASSIST + ERP_AI_HR_FILL feature flags.
 * - Sensitive field suggestions require explicit permissions.
 * - Document numbers are masked in prompts.
 * - No auto-save, no auto-apply.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { callCommonAiStructuredCompletion } from "@/lib/ai/common/provider-bridge";
import { isHrAiMasterEnabled, isHrAiFeatureEnabled } from "@/lib/hr/ai/feature-flags";
import { HR_AI_FEATURE_FLAGS, HrAiDocumentFillOutputSchema } from "@/lib/hr/ai/types";
import type { HrAiActionResult, HrAiDocumentFillOutput } from "@/lib/hr/ai/types";
import { maskDocumentNumber } from "@/lib/hr/ai/hr-ai-redaction";

// ── Usage log helper ──────────────────────────────────────────────────────────

async function logHrAiUsage(params: {
  featureCode: string;
  entityType: string;
  entityId: number;
  outputType: string;
  status: "success" | "failure";
  durationMs: number;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  profileId: number | null;
  providerCode: string | null;
  configCode: string | null;
  configId: number | null;
}) {
  try {
    const db = createAdminClient();
    await db.from("erp_ai_usage_logs").insert({
      feature_code:       params.featureCode,
      entity_type:        params.entityType,
      entity_id:          params.entityId,
      action_type:        params.outputType,
      status:             params.status,
      duration_ms:        params.durationMs,
      model_used:         params.model,
      prompt_tokens:      params.promptTokens,
      completion_tokens:  params.completionTokens,
      user_profile_id:    params.profileId,
      provider_code:      params.providerCode,
      config_code:        params.configCode,
      config_id:          params.configId,
    });
  } catch {
    // Non-critical — do not propagate logging errors
  }
}

// ── Main action ───────────────────────────────────────────────────────────────

export async function generateEmployeeDocumentFillSuggestions(
  employeeId: number
): Promise<HrAiActionResult<HrAiDocumentFillOutput>> {
  const start = Date.now();

  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) return { success: false, error: "Not authenticated." };
    if (!hasPermission(ctx, "hr.ai.use"))
      return { success: false, error: "Permission denied: hr.ai.use required." };
    if (!hasPermission(ctx, "dms.documents.view"))
      return { success: false, error: "Permission denied: dms.documents.view required to read documents." };

    const [masterEnabled, fillEnabled] = await Promise.all([
      isHrAiMasterEnabled(),
      isHrAiFeatureEnabled(HR_AI_FEATURE_FLAGS.FILL),
    ]);
    if (!masterEnabled || !fillEnabled) {
      return { success: false, error: "HR AI document fill feature is currently disabled.", featureDisabled: true };
    }

    const db = createAdminClient();

    // 1. Load employee safe profile
    const { data: emp } = await db
      .from("employees")
      .select(`
        id, employee_code, full_name_en, employee_status, joining_date,
        date_of_birth, gender, nationality:countries(name_en),
        department:departments(department_name_en),
        designation:designations(designation_name_en)
      `)
      .eq("id", employeeId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!emp) return { success: false, error: "Employee not found." };

    // 2. Load employee identity documents (masked)
    const { data: identityDocs } = await db
      .from("employee_identity_documents")
      .select("document_type, document_number, issue_date, expiry_date, is_primary")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .order("is_primary", { ascending: false })
      .limit(10);

    // 3. Load DMS documents linked to this employee
    const { data: dmsLinks } = await db
      .from("dms_document_links")
      .select(`
        id,
        document:dms_documents(
          id, document_number, document_type:dms_document_types(type_code, type_name_en),
          ai_summary, completeness_score, ai_risk_level, issue_date, expiry_date
        )
      `)
      .eq("entity_type", "employee")
      .eq("entity_id", employeeId)
      .is("deleted_at", null)
      .limit(15);

    const dmsDocumentContext = (dmsLinks ?? [])
      .map((link) => {
        const doc = firstOrSelf(link.document as unknown) as Record<string, unknown> | null;
        if (!doc) return null;
        const docType = firstOrSelf(doc.document_type as unknown) as Record<string, unknown> | null;
        const typeName = (docType?.type_name_en as string) ?? "Unknown";
        const summary = doc.ai_summary as string | null;
        return `Document: ${typeName} | Completeness: ${doc.completeness_score ?? "?"}% | ${
          summary ? `AI Summary: ${summary.slice(0, 300)}` : "No AI summary"
        }`;
      })
      .filter(Boolean)
      .join("\n---\n");

    const identityContext = (identityDocs ?? [])
      .map(
        (d) =>
          `${d.document_type}: [number masked] | Issued: ${d.issue_date ?? "?"} | Expires: ${d.expiry_date ?? "?"} | Primary: ${d.is_primary}`
      )
      .join("\n");

    // 4. Build safe prompt (no raw sensitive data)
    type JoinedRow = Record<string, unknown>;
    function firstOrSelf<T>(val: T | T[] | null | undefined): T | null {
      if (val == null) return null;
      if (Array.isArray(val)) return val[0] ?? null;
      return val;
    }
    const nationality = (firstOrSelf(emp.nationality) as JoinedRow | null)?.name_en as string ?? null;
    const dept = (firstOrSelf(emp.department) as JoinedRow | null)?.department_name_en as string ?? null;
    const desig = (firstOrSelf(emp.designation) as JoinedRow | null)?.designation_name_en as string ?? null;

    const systemPrompt = `You are an HR records AI assistant for an ERP system.
Your task: review DMS documents linked to an employee and suggest which employee profile fields could be filled or corrected based on the document data.
Rules:
- Only suggest fields that can be inferred from the provided document context.
- Mark isConflict=true if current value differs from document evidence.
- confidence is 0.0–1.0 (do NOT suggest if confidence < 0.5).
- reason must be concise (max 100 chars).
- Never invent values not in the document context.
- Never include raw document numbers, IBAN, salary, or medical data in suggestedValue.
- suggestedValue must be a safe string (name, date YYYY-MM-DD, status keyword).
- Return valid JSON only.`;

    const userPrompt = `Employee Profile (current data):
Name: ${emp.full_name_en ?? "[not set]"}
Code: ${emp.employee_code ?? "[not set]"}
Status: ${emp.employee_status ?? "[not set]"}
Joining Date: ${emp.joining_date ?? "[not set]"}
Date of Birth: ${emp.date_of_birth ?? "[not set]"}
Gender: ${emp.gender ?? "[not set]"}
Nationality: ${nationality ?? "[not set]"}
Department: ${dept ?? "[not set]"}
Designation: ${desig ?? "[not set]"}

Identity Documents on File:
${identityContext || "(none)"}

Linked DMS Documents:
${dmsDocumentContext || "(none linked)"}

Return JSON:
{
  "suggestions": [
    {
      "fieldName": "string",
      "fieldLabel": "string",
      "currentValue": "string or null",
      "suggestedValue": "string",
      "confidence": 0.0-1.0,
      "sourceDocumentId": null,
      "sourceDocumentName": "string or null",
      "reason": "short reason",
      "isConflict": false,
      "requiresReview": true
    }
  ],
  "documentsReviewed": 0,
  "warning": null
}
Only safe, non-sensitive profile fields (names, dates, status, nationality). Max 15 suggestions.`;

    const outcome = await callCommonAiStructuredCompletion(systemPrompt, userPrompt, {
      maxTokens: 2000,
      temperature: 0,
    });

    const durationMs = Date.now() - start;

    if (!outcome.success) {
      await logHrAiUsage({
        featureCode: HR_AI_FEATURE_FLAGS.FILL,
        entityType: "employee",
        entityId: employeeId,
        outputType: "document_fill",
        status: "failure",
        durationMs,
        model: null,
        promptTokens: null,
        completionTokens: null,
        profileId: ctx.profile.id,
        providerCode: null,
        configCode: null,
        configId: null,
      });
      return { success: false, error: outcome.error };
    }

    // 5. Validate AI response
    let parsed: unknown;
    try {
      parsed = JSON.parse(outcome.rawJson);
    } catch {
      return { success: false, error: "AI returned invalid JSON. Please try again." };
    }

    const validated = HrAiDocumentFillOutputSchema.safeParse(parsed);
    if (!validated.success) {
      return { success: false, error: "AI response failed validation. Please try again." };
    }

    await logHrAiUsage({
      featureCode: HR_AI_FEATURE_FLAGS.FILL,
      entityType: "employee",
      entityId: employeeId,
      outputType: "document_fill",
      status: "success",
      durationMs,
      model: outcome.model,
      promptTokens: outcome.promptTokens,
      completionTokens: outcome.completionTokens,
      profileId: ctx.profile.id,
      providerCode: outcome.providerCode,
      configCode: outcome.configCode,
      configId: outcome.configId,
    });

    return { success: true, data: validated.data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unexpected error.",
    };
  }
}
