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

import { callCommonAiStructuredCompletion } from "@/lib/ai/common/provider-bridge";
import { isHrAiFeatureEnabled, isHrAiMasterEnabled } from "@/lib/hr/ai/feature-flags";
import type { HrAiActionResult, HrAiDocumentFillOutput } from "@/lib/hr/ai/types";
import { HR_AI_FEATURE_FLAGS, HrAiDocumentFillOutputSchema } from "@/lib/hr/ai/types";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logHrAiUsage } from "@/lib/hr/ai/usage-log";
import { createClient } from "@/lib/supabase/server";
import { readHrFillFacts } from "@/server/reads/hr-ai-fill-facts";
import { getEmployeeAccess } from "@/lib/rbac/employee-access";

// ── Usage log helper ──────────────────────────────────────────────────────────


// ── Main action ───────────────────────────────────────────────────────────────

export async function generateEmployeeDocumentFillSuggestions(
  employeeId: number
): Promise<HrAiActionResult<HrAiDocumentFillOutput>> {
  const start = Date.now();

  try {
    const access = await getEmployeeAccess(await getAuthContext(), employeeId);
    const ctx = access.scopedContext;
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

    const db = await createClient();

    const facts = await readHrFillFacts(db,employeeId);
    const {emp,identityDocs,dmsLinks}=facts;
    const dmsDocumentContext = (dmsLinks ?? [])
      .map((link) => {
        const doc = firstOrSelf(link.document as unknown) as Record<string, unknown> | null;
        if (!doc) return null;
        const docType = firstOrSelf(doc.document_type as unknown) as Record<string, unknown> | null;
        const typeName = (docType?.name_en as string) ?? "Unknown";
        return `Document metadata #${doc.id}: ${typeName} | Issued: ${doc.issue_date ?? "Unknown"} | Expires: ${doc.expiry_date ?? "Unknown"}. File text and summaries are not supplied.`;
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
Your task: review only the supplied stored metadata for DMS documents linked to an employee and suggest which employee profile fields could be filled or corrected based on the document data.
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
Only full_name_en, full_name_ar, date_of_birth, gender, employee_status or joining_date may be suggested. A suggestion must name a supplied sourceDocumentId. Max 15 suggestions. File contents have not been reviewed; do not infer missing values from a document type or expiry date.`;

    const verify = async () => {
      const current = await getEmployeeAccess(await getAuthContext(),employeeId);
      if (current.scopedContext.profile?.id !== ctx.profile?.id || !hasPermission(current.scopedContext,"hr.ai.use") || !hasPermission(current.scopedContext,"dms.documents.view") || JSON.stringify(current.scopedContext.roleAssignments)!==JSON.stringify(ctx.roleAssignments) || !await isHrAiMasterEnabled() || !await isHrAiFeatureEnabled(HR_AI_FEATURE_FLAGS.FILL)) throw Error("Advisory access changed");
    };
    if (userPrompt.length > 16000) return {success:false,error:"Too much document metadata for a safe advisory request. Review the records directly."};
    await verify();
    const outcome = await callCommonAiStructuredCompletion(systemPrompt, userPrompt, {
      maxTokens: 2000,
      temperature: 0,
    });

    await verify();
    if ((await readHrFillFacts(db,employeeId)).fingerprint !== facts.fingerprint) return {success:false,error:"Document metadata changed. Refresh before requesting suggestions again."};
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

    const allowedFields = new Set(["full_name_en","full_name_ar","date_of_birth","gender","employee_status","joining_date"]);
    const sourceIds = new Set(dmsLinks.map(link => (firstOrSelf(link.document as unknown) as Record<string,unknown>|null)?.id));
    if (validated.data.suggestions.some(s => !allowedFields.has(s.fieldName) || !Number.isSafeInteger(s.sourceDocumentId) || !sourceIds.has(s.sourceDocumentId))) return {success:false,error:"AI suggested unsupported fields or sources. Review the original records."};
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

    return { success: true, data: {...validated.data,documentsReviewed:0,warning:"Stored metadata only; file contents were not reviewed. Verify every suggestion against the original document.",suggestions:validated.data.suggestions.map(s=>({...s,requiresReview:true}))} };
  } catch {
    return {
      success: false,
      error: "Document suggestions could not be verified. Refresh and try again.",
    };
  }
}
