"use server";

/**
 * HR.12 — HR AI Letter / Email Draft Assist
 *
 * AI drafts HR letter and email text for human review and editing.
 *
 * Safety rules:
 * - Draft text is returned to the user for review — never auto-sent.
 * - No official PDF finalization without user passing through Report Center flow.
 * - Salary/payroll wording requires hr.payroll.view.
 * - Disciplinary wording requires hr.actions.view.
 * - Source context (fields used) is always disclosed in output.
 * - Raw salary amounts never included in prompt without explicit permission.
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { callCommonAiStructuredCompletion } from "@/lib/ai/common/provider-bridge";
import { isHrAiMasterEnabled, isHrAiFeatureEnabled } from "@/lib/hr/ai/feature-flags";
import { HR_AI_FEATURE_FLAGS, HrAiDraftOutputSchema } from "@/lib/hr/ai/types";
import type { HrAiActionResult, HrAiDraftOutput } from "@/lib/hr/ai/types";

const DraftInputSchema = z.object({
  employeeId:  z.number().int().positive(),
  draftType:   z.enum(["noc", "salary_certificate", "experience_letter", "warning_letter", "hr_email", "offer_followup", "missing_document_reminder", "general"]),
  recipientContext: z.string().max(300).optional(),
  purposeNote: z.string().max(300).optional(),
  additionalContext: z.string().max(500).optional(),
});

export type DraftLetterInput = z.infer<typeof DraftInputSchema>;

async function logHrAiUsage(params: { featureCode: string; entityId: number; outputType: string; status: "success" | "failure"; durationMs: number; model: string | null; promptTokens: number | null; completionTokens: number | null; profileId: number | null; providerCode: string | null; configCode: string | null; configId: number | null }) {
  try {
    const db = createAdminClient();
    await db.from("erp_ai_usage_logs").insert({ feature_code: params.featureCode, entity_type: "employee", entity_id: params.entityId, action_type: params.outputType, status: params.status, duration_ms: params.durationMs, model_used: params.model, prompt_tokens: params.promptTokens, completion_tokens: params.completionTokens, user_profile_id: params.profileId, provider_code: params.providerCode, config_code: params.configCode, config_id: params.configId });
  } catch { /* non-critical */ }
}

export async function draftHrLetterOrEmail(
  input: DraftLetterInput
): Promise<HrAiActionResult<HrAiDraftOutput>> {
  const start = Date.now();
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) return { success: false, error: "Not authenticated." };
    if (!hasPermission(ctx, "hr.ai.use"))
      return { success: false, error: "Permission denied: hr.ai.use required." };

    // Validate input
    const parsed = DraftInputSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid input." };
    const { employeeId, draftType, recipientContext, purposeNote, additionalContext } = parsed.data;

    // Check if payroll/disciplinary content required
    const requiresPayrollView = ["salary_certificate"].includes(draftType);
    const requiresActionsView = ["warning_letter"].includes(draftType);

    if (requiresPayrollView && !hasPermission(ctx, "hr.payroll.view"))
      return { success: false, error: "Permission denied: hr.payroll.view required for salary certificate drafts." };
    if (requiresActionsView && !hasPermission(ctx, "hr.actions.view"))
      return { success: false, error: "Permission denied: hr.actions.view required for warning letter drafts." };

    const [masterEnabled, featureEnabled] = await Promise.all([
      isHrAiMasterEnabled(),
      isHrAiFeatureEnabled(draftType === "hr_email" ? HR_AI_FEATURE_FLAGS.EMAIL_DRAFT : HR_AI_FEATURE_FLAGS.LETTER_DRAFT),
    ]);
    if (!masterEnabled || !featureEnabled)
      return { success: false, error: "HR AI letter draft feature is currently disabled.", featureDisabled: true };

    const db = createAdminClient();

    // Load safe employee context
    const { data: emp } = await db
      .from("employees")
      .select(`
        id, employee_code, full_name_en, employee_status,
        joining_date, contract_type, contract_end_date,
        department:departments(department_name_en),
        designation:designations(designation_name_en),
        branch:branches(branch_name_en),
        owner_company:owner_companies(legal_name_en)
      `)
      .eq("id", employeeId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!emp) return { success: false, error: "Employee not found." };

    // Include salary only with payroll permission
    let salaryContext = "";
    if (requiresPayrollView && hasPermission(ctx, "hr.payroll.view")) {
      const { data: payProfile } = await db
        .from("employee_payroll_profiles")
        .select("basic_salary, currency")
        .eq("employee_id", employeeId)
        .maybeSingle();
      if (payProfile?.basic_salary) {
        salaryContext = `\nBasic Salary: ${payProfile.basic_salary} ${payProfile.currency ?? "AED"}`;
      }
    }

    const draftLabels: Record<string, string> = {
      noc: "No Objection Certificate (NOC)",
      salary_certificate: "Salary Certificate",
      experience_letter: "Experience Letter",
      warning_letter: "Warning Letter",
      hr_email: "HR Email",
      offer_followup: "Offer Follow-up",
      missing_document_reminder: "Missing Document Reminder",
      general: "General HR Letter",
    };

    type JoinedRow = Record<string, unknown>;
    function firstOrSelf<T>(val: T | T[] | null | undefined): T | null {
      if (val == null) return null;
      if (Array.isArray(val)) return val[0] ?? null;
      return val;
    }
    const employeeContext = [
      `Name: ${emp.full_name_en ?? "[not set]"}`,
      `Employee Code: ${emp.employee_code ?? "[not set]"}`,
      `Status: ${emp.employee_status ?? "[not set]"}`,
      `Joining Date: ${emp.joining_date ?? "[not set]"}`,
      `Contract Type: ${emp.contract_type ?? "[not set]"}`,
      `Contract End: ${emp.contract_end_date ?? "[not set]"}`,
      `Department: ${(firstOrSelf(emp.department) as JoinedRow | null)?.department_name_en as string ?? "[not set]"}`,
      `Designation: ${(firstOrSelf(emp.designation) as JoinedRow | null)?.designation_name_en as string ?? "[not set]"}`,
      `Branch: ${(firstOrSelf(emp.branch) as JoinedRow | null)?.branch_name_en as string ?? "[not set]"}`,
      `Company: ${(firstOrSelf(emp.owner_company) as JoinedRow | null)?.legal_name_en as string ?? "[not set]"}`,
      salaryContext,
    ].filter(Boolean).join("\n");

    const today = new Date().toLocaleDateString("en-AE", { day: "2-digit", month: "long", year: "numeric" });

    const systemPrompt = `You are an HR letter drafting assistant for a UAE-based company ERP system.
Draft professional, formal HR correspondence.
Rules:
- Draft is for HUMAN REVIEW only — user must edit and approve before use.
- isOfficialReady must always be false (requires HR review).
- For NOC / salary certificate: use formal letter format with date, reference.
- For HR email: use professional email format.
- Include "[Employee Signature]", "[HR Manager Name]", "[Company Stamp]" as placeholders.
- draftText max 1200 chars. Concise and professional.
- sourceContextUsed: list the data fields you used.
- Today's date: ${today}
- Return valid JSON only.`;

    const userPrompt = `Draft type: ${draftLabels[draftType] ?? draftType}
Employee Data:
${employeeContext}
${recipientContext ? `\nRecipient Context: ${recipientContext}` : ""}
${purposeNote ? `\nPurpose: ${purposeNote}` : ""}
${additionalContext ? `\nAdditional Context: ${additionalContext}` : ""}

Return JSON:
{
  "draftType": "${draftType}",
  "subject": "string or null",
  "draftText": "full draft text here",
  "sourceContextUsed": ["employee name","joining date","designation"],
  "warning": null,
  "requiresPayrollView": ${requiresPayrollView},
  "requiresActionsView": ${requiresActionsView},
  "isOfficialReady": false
}`;

    const outcome = await callCommonAiStructuredCompletion(systemPrompt, userPrompt, {
      maxTokens: 1800,
      temperature: 0.3,
    });
    const durationMs = Date.now() - start;

    if (!outcome.success) {
      await logHrAiUsage({ featureCode: HR_AI_FEATURE_FLAGS.LETTER_DRAFT, entityId: employeeId, outputType: "letter_draft", status: "failure", durationMs, model: null, promptTokens: null, completionTokens: null, profileId: ctx.profile.id, providerCode: null, configCode: null, configId: null });
      return { success: false, error: outcome.error };
    }

    let parsedJson: unknown;
    try { parsedJson = JSON.parse(outcome.rawJson); } catch { return { success: false, error: "AI returned invalid JSON." }; }

    const validated = HrAiDraftOutputSchema.safeParse(parsedJson);
    if (!validated.success) return { success: false, error: "AI response failed validation." };

    // Safety: always force isOfficialReady to false
    const safeOutput: HrAiDraftOutput = { ...validated.data, isOfficialReady: false };

    await logHrAiUsage({ featureCode: HR_AI_FEATURE_FLAGS.LETTER_DRAFT, entityId: employeeId, outputType: "letter_draft", status: "success", durationMs, model: outcome.model, promptTokens: outcome.promptTokens, completionTokens: outcome.completionTokens, profileId: ctx.profile.id, providerCode: outcome.providerCode, configCode: outcome.configCode, configId: outcome.configId });
    return { success: true, data: safeOutput };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unexpected error." };
  }
}
