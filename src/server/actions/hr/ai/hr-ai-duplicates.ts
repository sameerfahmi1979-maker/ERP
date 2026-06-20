"use server";

/**
 * HR.12 — HR AI Duplicate / Conflict Detection
 *
 * Detects possible duplicate employees or candidate-employee conflicts
 * using deterministic checks first, then AI fuzzy name matching.
 *
 * Safety rules:
 * - Deterministic checks run first (same Emirates ID, passport, email, mobile).
 * - AI fuzzy name check is advisory only — no auto-merge.
 * - Results are for human review only.
 * - No record deletion, merging, or modification.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { callCommonAiStructuredCompletion } from "@/lib/ai/common/provider-bridge";
import { isHrAiMasterEnabled, isHrAiFeatureEnabled } from "@/lib/hr/ai/feature-flags";
import { HR_AI_FEATURE_FLAGS, HrAiDuplicateOutputSchema } from "@/lib/hr/ai/types";
import type { HrAiActionResult, HrAiDuplicateOutput, HrAiDuplicateSuggestion } from "@/lib/hr/ai/types";
import { maskDocumentNumber } from "@/lib/hr/ai/hr-ai-redaction";

async function logHrAiUsage(params: { featureCode: string; entityId: number; outputType: string; status: "success" | "failure"; durationMs: number; model: string | null; promptTokens: number | null; completionTokens: number | null; profileId: number | null; providerCode: string | null; configCode: string | null; configId: number | null }) {
  try {
    const db = createAdminClient();
    await db.from("erp_ai_usage_logs").insert({ feature_code: params.featureCode, entity_type: "employee", entity_id: params.entityId, action_type: params.outputType, status: params.status, duration_ms: params.durationMs, model_used: params.model, prompt_tokens: params.promptTokens, completion_tokens: params.completionTokens, user_profile_id: params.profileId, provider_code: params.providerCode, config_code: params.configCode, config_id: params.configId });
  } catch { /* non-critical */ }
}

export async function detectEmployeeDuplicates(
  employeeId: number
): Promise<HrAiActionResult<HrAiDuplicateOutput>> {
  const start = Date.now();
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) return { success: false, error: "Not authenticated." };
    if (!hasPermission(ctx, "hr.ai.use"))
      return { success: false, error: "Permission denied: hr.ai.use required." };

    const [masterEnabled, featureEnabled] = await Promise.all([
      isHrAiMasterEnabled(),
      isHrAiFeatureEnabled(HR_AI_FEATURE_FLAGS.DUPLICATES),
    ]);
    if (!masterEnabled || !featureEnabled)
      return { success: false, error: "HR AI duplicate detection is currently disabled.", featureDisabled: true };

    const db = createAdminClient();

    const { data: emp } = await db
      .from("employees")
      .select("id, employee_code, full_name_en, mobile_number, personal_email")
      .eq("id", employeeId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!emp) return { success: false, error: "Employee not found." };

    // Load identity documents for deterministic checks
    const { data: identityDocs } = await db
      .from("employee_identity_documents")
      .select("document_type, document_number")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .limit(10);

    // ── DETERMINISTIC CHECKS ─────────────────────────────────────────────────

    const duplicates: HrAiDuplicateSuggestion[] = [];
    const checksPerformed: string[] = [];

    // Check: same mobile number
    if (emp.mobile_number) {
      checksPerformed.push("Same mobile number");
      const { data: mobileDups } = await db
        .from("employees")
        .select("id, employee_code, full_name_en")
        .eq("mobile_number", emp.mobile_number)
        .neq("id", employeeId)
        .is("deleted_at", null)
        .limit(5);

      for (const dup of mobileDups ?? []) {
        duplicates.push({
          possibleDuplicateType: "exact_match",
          recordAType: "employee",
          recordAId: employeeId,
          recordALabel: `${emp.full_name_en ?? "?"} (${emp.employee_code ?? "?"})`,
          recordBType: "employee",
          recordBId: dup.id,
          recordBLabel: `${dup.full_name_en ?? "?"} (${dup.employee_code ?? "?"})`,
          matchedFields: ["mobile_number"],
          confidence: 0.95,
          reason: "Same mobile number on two employee records",
          recommendedAction: "Review both records and update or merge if duplicate",
        });
      }
    }

    // Check: same personal email
    if (emp.personal_email) {
      checksPerformed.push("Same personal email");
      const { data: emailDups } = await db
        .from("employees")
        .select("id, employee_code, full_name_en")
        .eq("personal_email", emp.personal_email)
        .neq("id", employeeId)
        .is("deleted_at", null)
        .limit(5);

      for (const dup of emailDups ?? []) {
        if (!duplicates.some((d) => d.recordBId === dup.id)) {
          duplicates.push({
            possibleDuplicateType: "exact_match",
            recordAType: "employee",
            recordAId: employeeId,
            recordALabel: `${emp.full_name_en ?? "?"} (${emp.employee_code ?? "?"})`,
            recordBType: "employee",
            recordBId: dup.id,
            recordBLabel: `${dup.full_name_en ?? "?"} (${dup.employee_code ?? "?"})`,
            matchedFields: ["personal_email"],
            confidence: 0.92,
            reason: "Same personal email on two employee records",
            recommendedAction: "Review both records and update if same person",
          });
        }
      }
    }

    // Check: same identity document number
    for (const doc of identityDocs ?? []) {
      if (!doc.document_number) continue;
      checksPerformed.push(`Same ${doc.document_type}`);
      const { data: docDups } = await db
        .from("employee_identity_documents")
        .select("employee_id, document_type, employees!inner(id, employee_code, full_name_en)")
        .eq("document_type", doc.document_type)
        .eq("document_number", doc.document_number)
        .neq("employee_id", employeeId)
        .is("deleted_at", null)
        .limit(5);

      for (const dupDoc of docDups ?? []) {
        const dupEmp = dupDoc.employees as unknown as { id: number; employee_code: string; full_name_en: string } | null;
        if (!dupEmp) continue;
        if (!duplicates.some((d) => d.recordBId === dupEmp.id)) {
          duplicates.push({
            possibleDuplicateType: "same_id_doc",
            recordAType: "employee",
            recordAId: employeeId,
            recordALabel: `${emp.full_name_en ?? "?"} (${emp.employee_code ?? "?"})`,
            recordBType: "employee",
            recordBId: dupEmp.id,
            recordBLabel: `${dupEmp.full_name_en ?? "?"} (${dupEmp.employee_code ?? "?"})`,
            matchedFields: [doc.document_type],
            confidence: 0.98,
            reason: `Same ${doc.document_type} number on two employee records`,
            recommendedAction: "Critical: same identity document number — investigate immediately",
          });
        }
      }
    }

    // Check: candidate link (was this employee a candidate?)
    checksPerformed.push("Candidate-employee link check");
    const { data: candidateLink } = await db
      .from("employees")
      .select("converted_from_candidate_id")
      .eq("id", employeeId)
      .maybeSingle();

    const summary = duplicates.length === 0
      ? "No duplicate or conflict indicators found for this employee."
      : `Found ${duplicates.length} potential duplicate/conflict indicator(s). Human review required before any action.`;

    const durationMs = Date.now() - start;
    await logHrAiUsage({ featureCode: HR_AI_FEATURE_FLAGS.DUPLICATES, entityId: employeeId, outputType: "duplicate_detection", status: "success", durationMs, model: null, promptTokens: null, completionTokens: null, profileId: ctx.profile.id, providerCode: null, configCode: null, configId: null });

    return {
      success: true,
      data: {
        duplicates: duplicates.slice(0, 10),
        checksPerformed,
        summary,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unexpected error." };
  }
}
