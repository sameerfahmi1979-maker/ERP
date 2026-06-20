"use server";

/**
 * HR.12 — HR AI Correction Suggestions + Compliance/Readiness Explanations
 *
 * - generateEmployeeCorrectionSuggestions: AI data quality review of employee profile
 * - explainEmployeeCompliance: AI explanation of compliance status and gaps
 * - explainEmployeeReadiness: AI explanation of operations readiness status
 *
 * Safety rules:
 * - Ephemeral suggestions — not stored to DB.
 * - Sensitive data redacted before AI prompt.
 * - All AI outputs are suggestion/explanation only — no auto-save.
 * - Feature flags + permissions checked before any AI call.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { callCommonAiStructuredCompletion } from "@/lib/ai/common/provider-bridge";
import { isHrAiMasterEnabled, isHrAiFeatureEnabled } from "@/lib/hr/ai/feature-flags";
import {
  HR_AI_FEATURE_FLAGS,
  HrAiCorrectionOutputSchema,
  HrAiComplianceExplanationSchema,
  HrAiReadinessExplanationSchema,
} from "@/lib/hr/ai/types";
import type {
  HrAiActionResult,
  HrAiCorrectionOutput,
  HrAiComplianceExplanation,
  HrAiReadinessExplanation,
} from "@/lib/hr/ai/types";
import {
  buildSafeEmployeeContext,
  buildSafeComplianceContext,
  buildSafeReadinessContext,
} from "@/lib/hr/ai/hr-ai-redaction";

// ── Usage logger (shared pattern) ─────────────────────────────────────────────

async function logHrAiUsage(params: {
  featureCode: string;
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
      feature_code:      params.featureCode,
      entity_type:       "employee",
      entity_id:         params.entityId,
      action_type:       params.outputType,
      status:            params.status,
      duration_ms:       params.durationMs,
      model_used:        params.model,
      prompt_tokens:     params.promptTokens,
      completion_tokens: params.completionTokens,
      user_profile_id:   params.profileId,
      provider_code:     params.providerCode,
      config_code:       params.configCode,
      config_id:         params.configId,
    });
  } catch { /* non-critical */ }
}

// ── Shared employee data loader ───────────────────────────────────────────────

async function loadEmployeeSafeProfile(employeeId: number) {
  const db = createAdminClient();
  const { data } = await db
    .from("employees")
    .select(`
      id, employee_code, full_name_en, employee_status, joining_date,
      date_of_birth, gender, contract_type, contract_end_date, probation_end_date,
      nationality:countries(name_en),
      department:departments(department_name_en),
      designation:designations(designation_name_en),
      branch:branches(branch_name_en),
      owner_company:owner_companies(legal_name_en),
      primary_work_site:work_sites(site_name),
      employment_type:employment_types(type_name)
    `)
    .eq("id", employeeId)
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

// ── 1. Correction Suggestions ─────────────────────────────────────────────────

export async function generateEmployeeCorrectionSuggestions(
  employeeId: number
): Promise<HrAiActionResult<HrAiCorrectionOutput>> {
  const start = Date.now();
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) return { success: false, error: "Not authenticated." };
    if (!hasPermission(ctx, "hr.ai.use"))
      return { success: false, error: "Permission denied: hr.ai.use required." };

    const [masterEnabled, featureEnabled] = await Promise.all([
      isHrAiMasterEnabled(),
      isHrAiFeatureEnabled(HR_AI_FEATURE_FLAGS.CORRECTIONS),
    ]);
    if (!masterEnabled || !featureEnabled)
      return { success: false, error: "HR AI corrections feature is currently disabled.", featureDisabled: true };

    const emp = await loadEmployeeSafeProfile(employeeId);
    if (!emp) return { success: false, error: "Employee not found." };

    type JoinedRow = Record<string, unknown>;
    function firstOrSelf<T>(val: T | T[] | null | undefined): T | null {
      if (val == null) return null;
      if (Array.isArray(val)) return val[0] ?? null;
      return val;
    }
    const { contextText, profile } = buildSafeEmployeeContext(
      {
        employee_code: emp.employee_code,
        full_name_en: emp.full_name_en,
        employee_status: emp.employee_status,
        joining_date: emp.joining_date,
        date_of_birth: emp.date_of_birth,
        gender: emp.gender,
        contract_type: emp.contract_type,
        contract_end_date: emp.contract_end_date,
        nationality: (firstOrSelf(emp.nationality) as JoinedRow | null)?.name_en as string ?? null,
        department_name: (firstOrSelf(emp.department) as JoinedRow | null)?.department_name_en as string ?? null,
        designation_name: (firstOrSelf(emp.designation) as JoinedRow | null)?.designation_name_en as string ?? null,
        branch_name: (firstOrSelf(emp.branch) as JoinedRow | null)?.branch_name_en as string ?? null,
        owner_company_name: (firstOrSelf(emp.owner_company) as JoinedRow | null)?.legal_name_en as string ?? null,
        primary_work_site_name: (firstOrSelf(emp.primary_work_site) as JoinedRow | null)?.site_name as string ?? null,
        employment_type: (firstOrSelf(emp.employment_type) as JoinedRow | null)?.type_name as string ?? null,
      },
      ctx
    );

    const today = new Date().toISOString().split("T")[0];

    const systemPrompt = `You are an HR data quality AI for an ERP system.
Review the employee profile and identify data quality issues, missing required fields, and inconsistencies.
Rules:
- Only report genuine issues with clear evidence.
- severity: critical | high | medium | low | info
- category: "Missing Field" | "Date Inconsistency" | "Expired Record" | "Incomplete Profile" | "Status Mismatch"
- isApplyable must be false (HR must fix manually).
- recommendedAction: short action (max 80 chars).
- reason: short explanation (max 80 chars).
- Today's date: ${today}
- Return valid JSON only. Max 20 suggestions.`;

    const userPrompt = `Employee Profile:\n${contextText}\n\nReturn JSON:
{
  "suggestions": [
    {"severity":"high","category":"Missing Field","fieldOrTable":"employees.mobile_number","currentValue":null,"recommendedAction":"Add employee mobile number","reason":"Required for payroll and emergency contact","source":"profile","isApplyable":false}
  ],
  "overallHealthScore": 75,
  "summary": "Employee profile has 2 critical gaps..."
}`;

    const outcome = await callCommonAiStructuredCompletion(systemPrompt, userPrompt, {
      maxTokens: 2000,
      temperature: 0,
    });
    const durationMs = Date.now() - start;

    if (!outcome.success) {
      await logHrAiUsage({ featureCode: HR_AI_FEATURE_FLAGS.CORRECTIONS, entityId: employeeId, outputType: "correction_suggestions", status: "failure", durationMs, model: null, promptTokens: null, completionTokens: null, profileId: ctx.profile.id, providerCode: null, configCode: null, configId: null });
      return { success: false, error: outcome.error };
    }

    let parsed: unknown;
    try { parsed = JSON.parse(outcome.rawJson); } catch { return { success: false, error: "AI returned invalid JSON." }; }

    const validated = HrAiCorrectionOutputSchema.safeParse(parsed);
    if (!validated.success) return { success: false, error: "AI response failed validation." };

    await logHrAiUsage({ featureCode: HR_AI_FEATURE_FLAGS.CORRECTIONS, entityId: employeeId, outputType: "correction_suggestions", status: "success", durationMs, model: outcome.model, promptTokens: outcome.promptTokens, completionTokens: outcome.completionTokens, profileId: ctx.profile.id, providerCode: outcome.providerCode, configCode: outcome.configCode, configId: outcome.configId });
    return { success: true, data: validated.data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unexpected error." };
  }
}

// ── 2. Compliance Explanation ─────────────────────────────────────────────────

export async function explainEmployeeCompliance(
  employeeId: number
): Promise<HrAiActionResult<HrAiComplianceExplanation>> {
  const start = Date.now();
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) return { success: false, error: "Not authenticated." };
    if (!hasPermission(ctx, "hr.ai.use"))
      return { success: false, error: "Permission denied: hr.ai.use required." };

    const [masterEnabled, featureEnabled] = await Promise.all([
      isHrAiMasterEnabled(),
      isHrAiFeatureEnabled(HR_AI_FEATURE_FLAGS.COMPLIANCE_EXPLAIN),
    ]);
    if (!masterEnabled || !featureEnabled)
      return { success: false, error: "HR AI compliance explanation is currently disabled.", featureDisabled: true };

    const emp = await loadEmployeeSafeProfile(employeeId);
    if (!emp) return { success: false, error: "Employee not found." };

    const db = createAdminClient();
    const canMedical = hasPermission(ctx, "hr.medical.view");
    const today = new Date().toISOString().split("T")[0];

    // Load compliance summary (deterministic data — cite, don't invent)
    const [identityRes, insuranceRes, accessRes, trainingRes, dmsRes] = await Promise.all([
      db.from("employee_identity_documents").select("id, document_type, expiry_date, is_primary").eq("employee_id", employeeId).is("deleted_at", null),
      db.from("employee_medical_insurances").select("id, insurance_type, valid_until, status").eq("employee_id", employeeId).is("deleted_at", null),
      db.from("employee_access_cards").select("id, card_type, valid_to, status").eq("employee_id", employeeId).is("deleted_at", null),
      db.from("employee_training_certificates").select("id, certificate_name, expiry_date").eq("employee_id", employeeId).is("deleted_at", null),
      db.from("dms_document_links").select("id").eq("entity_type", "employee").eq("entity_id", employeeId).is("deleted_at", null),
    ]);

    const expired = (list: { expiry_date?: string | null; valid_until?: string | null; valid_to?: string | null }[]) =>
      list.filter((r) => {
        const d = r.expiry_date ?? r.valid_until ?? r.valid_to;
        return d && d < today;
      }).length;

    const complianceContext = buildSafeComplianceContext(
      {
        identityDocuments: {
          total: identityRes.data?.length ?? 0,
          expired: expired(identityRes.data ?? []),
          expiringSoon: 0,
        },
        medicalInsurances: {
          total: insuranceRes.data?.length ?? 0,
          active: (insuranceRes.data ?? []).filter((r) => r.status === "active").length,
        },
        accessCards: {
          total: accessRes.data?.length ?? 0,
          active: (accessRes.data ?? []).filter((r) => r.status === "active").length,
          expired: expired(accessRes.data ?? []),
        },
        trainingCertificates: {
          total: trainingRes.data?.length ?? 0,
          expired: expired(trainingRes.data ?? []),
        },
        dmsDocuments: { total: dmsRes.data?.length ?? 0 },
      },
      canMedical
    );

    const systemPrompt = `You are an HR compliance AI for an ERP system.
You have deterministic compliance data for an employee. Explain the compliance status clearly.
Rules:
- Cite only the provided data. Never invent compliance rules.
- overallComplianceLevel: "compliant" | "partial" | "non_compliant" | "unknown"
- blockingItems: items preventing compliance (expired/missing mandatory docs)
- recommendedNextSteps: actionable HR steps (max 8)
- Today: ${today}
- Return valid JSON only.`;

    const userPrompt = `Employee: ${emp.full_name_en ?? "?"} (${emp.employee_code ?? "?"})\nStatus: ${emp.employee_status ?? "?"}\n\nCompliance Data:\n${complianceContext}\n\nReturn JSON:
{
  "summary": "string",
  "blockingItems": [{"item":"string","reason":"string","priority":"high"}],
  "warningItems": [{"item":"string","reason":"string"}],
  "recommendedNextSteps": ["string"],
  "overallComplianceLevel": "partial"
}`;

    const outcome = await callCommonAiStructuredCompletion(systemPrompt, userPrompt, { maxTokens: 1500, temperature: 0 });
    const durationMs = Date.now() - start;

    if (!outcome.success) {
      await logHrAiUsage({ featureCode: HR_AI_FEATURE_FLAGS.COMPLIANCE_EXPLAIN, entityId: employeeId, outputType: "compliance_explanation", status: "failure", durationMs, model: null, promptTokens: null, completionTokens: null, profileId: ctx.profile.id, providerCode: null, configCode: null, configId: null });
      return { success: false, error: outcome.error };
    }

    let parsed: unknown;
    try { parsed = JSON.parse(outcome.rawJson); } catch { return { success: false, error: "AI returned invalid JSON." }; }

    const validated = HrAiComplianceExplanationSchema.safeParse(parsed);
    if (!validated.success) return { success: false, error: "AI response failed validation." };

    await logHrAiUsage({ featureCode: HR_AI_FEATURE_FLAGS.COMPLIANCE_EXPLAIN, entityId: employeeId, outputType: "compliance_explanation", status: "success", durationMs, model: outcome.model, promptTokens: outcome.promptTokens, completionTokens: outcome.completionTokens, profileId: ctx.profile.id, providerCode: outcome.providerCode, configCode: outcome.configCode, configId: outcome.configId });
    return { success: true, data: validated.data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unexpected error." };
  }
}

// ── 3. Readiness Explanation ──────────────────────────────────────────────────

export async function explainEmployeeReadiness(
  employeeId: number
): Promise<HrAiActionResult<HrAiReadinessExplanation>> {
  const start = Date.now();
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) return { success: false, error: "Not authenticated." };
    if (!hasPermission(ctx, "hr.ai.use"))
      return { success: false, error: "Permission denied: hr.ai.use required." };

    const [masterEnabled, featureEnabled] = await Promise.all([
      isHrAiMasterEnabled(),
      isHrAiFeatureEnabled(HR_AI_FEATURE_FLAGS.READINESS_EXPLAIN),
    ]);
    if (!masterEnabled || !featureEnabled)
      return { success: false, error: "HR AI readiness explanation is currently disabled.", featureDisabled: true };

    const emp = await loadEmployeeSafeProfile(employeeId);
    if (!emp) return { success: false, error: "Employee not found." };

    const db = createAdminClient();

    // Load readiness data (deterministic)
    const [blocksRes, siteReadinessRes] = await Promise.all([
      db.from("employee_operational_blocks").select("id, block_type, reason, start_date").eq("employee_id", employeeId).is("deleted_at", null).eq("is_active", true),
      db.from("employee_site_readiness").select("id, work_site:work_sites(site_name), readiness_status, missing_requirements_json").eq("employee_id", employeeId).is("deleted_at", null).limit(5),
    ]);

    const missingReqs: string[] = [];
    (siteReadinessRes.data ?? []).forEach((sr) => {
      const missing = sr.missing_requirements_json as string[] | null;
      if (Array.isArray(missing)) missingReqs.push(...missing.slice(0, 5));
    });

    const readinessContext = buildSafeReadinessContext({
      overallStatus: emp.employee_status ?? "unknown",
      activeBlockCount: blocksRes.data?.length ?? 0,
      missingRequirements: missingReqs,
      siteReadinessRecords: (siteReadinessRes.data ?? []).map((sr) => ({
        siteName: ((Array.isArray(sr.work_site) ? sr.work_site[0] : sr.work_site) as Record<string, unknown> | null)?.site_name as string ?? "?",
        status: sr.readiness_status ?? "unknown",
        missingCount: (sr.missing_requirements_json as string[] | null)?.length ?? 0,
      })),
    });

    const systemPrompt = `You are an HR operations readiness AI for an ERP system.
Explain why an employee is or is not site/role-ready, based on deterministic data provided.
Rules:
- Cite only provided data. Never invent readiness rules.
- overallStatus: "ready" | "not_ready" | "blocked" | "expired" | "needs_review" | "unknown"
- blockingItems: each active block or missing requirement
- recommendedNextSteps: actionable HR steps to clear blocks (max 8)
- Return valid JSON only.`;

    const userPrompt = `Employee: ${emp.full_name_en ?? "?"} (${emp.employee_code ?? "?"})\n\nReadiness Data:\n${readinessContext}\n\nReturn JSON:
{
  "overallStatus": "not_ready",
  "summary": "string",
  "blockingItems": [{"item":"string","reason":"string","priority":"high"}],
  "recommendedNextSteps": ["string"],
  "estimatedClearanceSteps": 3
}`;

    const outcome = await callCommonAiStructuredCompletion(systemPrompt, userPrompt, { maxTokens: 1500, temperature: 0 });
    const durationMs = Date.now() - start;

    if (!outcome.success) {
      await logHrAiUsage({ featureCode: HR_AI_FEATURE_FLAGS.READINESS_EXPLAIN, entityId: employeeId, outputType: "readiness_explanation", status: "failure", durationMs, model: null, promptTokens: null, completionTokens: null, profileId: ctx.profile.id, providerCode: null, configCode: null, configId: null });
      return { success: false, error: outcome.error };
    }

    let parsed: unknown;
    try { parsed = JSON.parse(outcome.rawJson); } catch { return { success: false, error: "AI returned invalid JSON." }; }

    const validated = HrAiReadinessExplanationSchema.safeParse(parsed);
    if (!validated.success) return { success: false, error: "AI response failed validation." };

    await logHrAiUsage({ featureCode: HR_AI_FEATURE_FLAGS.READINESS_EXPLAIN, entityId: employeeId, outputType: "readiness_explanation", status: "success", durationMs, model: outcome.model, promptTokens: outcome.promptTokens, completionTokens: outcome.completionTokens, profileId: ctx.profile.id, providerCode: outcome.providerCode, configCode: outcome.configCode, configId: outcome.configId });
    return { success: true, data: validated.data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unexpected error." };
  }
}
