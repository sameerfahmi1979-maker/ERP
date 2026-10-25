"use server";
import {createHash} from 'node:crypto';

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

import { callCommonAiStructuredCompletion } from "@/lib/ai/common/provider-bridge";
import { isHrAiFeatureEnabled, isHrAiMasterEnabled } from "@/lib/hr/ai/feature-flags";
import {
  buildSafeEmployeeContext,
} from "@/lib/hr/ai/hr-ai-redaction";
import type {
  HrAiActionResult,
  HrAiComplianceExplanation,
  HrAiCorrectionOutput,
  HrAiReadinessExplanation,
} from "@/lib/hr/ai/types";
import {
  HR_AI_FEATURE_FLAGS,
  HrAiComplianceExplanationSchema,
  HrAiCorrectionOutputSchema,
  HrAiReadinessExplanationSchema,
} from "@/lib/hr/ai/types";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logHrAiUsage } from "@/lib/hr/ai/usage-log";
import { createClient } from "@/lib/supabase/server";
import { getEmployeeAccess } from "@/lib/rbac/employee-access";
import {readHrAiReviewFacts} from '@/server/reads/hr-ai-review-facts';
import {hrDashboardCalendar} from '@/lib/hr/dashboard-metrics';

async function verifyReviewAccess(employeeId:number,profileId:number,feature:Parameters<typeof isHrAiFeatureEnabled>[0],permission?:string,medical=false){
 const current=await getEmployeeAccess(await getAuthContext(),employeeId);
 if(current.scopedContext.profile?.id!==profileId||!hasPermission(current.scopedContext,'hr.ai.use')||permission&&!current.allows(permission)||medical&&!current.allows('hr.medical.view')||!await isHrAiMasterEnabled()||!await isHrAiFeatureEnabled(feature))throw Error('Current advisory access or feature availability changed');
}

// ── Usage logger (shared pattern) ─────────────────────────────────────────────


// ── Shared employee data loader ───────────────────────────────────────────────

async function loadEmployeeSafeProfile(employeeId: number) {
  const db = await createClient();
  const { data, error } = await db
    .from("employees")
    .select(`
      id, employee_code, full_name_en, employee_status, joining_date,
      date_of_birth, gender, contract_type, contract_end_date, probation_end_date,
      nationality:countries(name_en),
      department:departments(department_name_en),
      designation:designations(designation_name_en),
      branch:branches(branch_name_en),
      owner_company:owner_companies!employees_owner_company_id_fkey(legal_name_en),
      primary_work_site:work_sites(site_name),
      employment_type:hr_employment_types(type_name:name_en)
    `)
    .eq("id", employeeId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw Error("Authorized employee facts unavailable");
  return data?.id === employeeId ? data : null;
}

// ── 1. Correction Suggestions ─────────────────────────────────────────────────

export async function generateEmployeeCorrectionSuggestions(
  employeeId: number
): Promise<HrAiActionResult<HrAiCorrectionOutput>> {
  const start = Date.now();
  try {
    const access = await getEmployeeAccess(await getAuthContext(), employeeId);
    const ctx = access.scopedContext;
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
    const { contextText } = buildSafeEmployeeContext(
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

    const today = hrDashboardCalendar().today;
    const sourceFingerprint=createHash('sha256').update(JSON.stringify({today,employee:emp})).digest('hex');

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

    const userPrompt = `Employee Profile (as of ${today} Dubai; source ${sourceFingerprint}):\n${contextText}\n\nReturn JSON:
{
  "suggestions": [
    {"severity":"high","category":"Missing Field","fieldOrTable":"employees.mobile_number","currentValue":null,"recommendedAction":"Add employee mobile number","reason":"Required for payroll and emergency contact","source":"profile","isApplyable":false}
  ],
  "overallHealthScore": 75,
  "summary": "Employee profile has 2 critical gaps..."
}`;

    await verifyReviewAccess(employeeId,ctx.profile.id,HR_AI_FEATURE_FLAGS.CORRECTIONS);
    const outcome = await callCommonAiStructuredCompletion(systemPrompt, userPrompt, {
      maxTokens: 2000,
      temperature: 0,
    });
    await verifyReviewAccess(employeeId,ctx.profile.id,HR_AI_FEATURE_FLAGS.CORRECTIONS);
    if(createHash('sha256').update(JSON.stringify({today:hrDashboardCalendar().today,employee:await loadEmployeeSafeProfile(employeeId)})).digest('hex')!==sourceFingerprint)return {success:false,error:'Advisory source facts changed; refresh before retrying.'};
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
    return { success: true, data: {...validated.data,suggestions:validated.data.suggestions.map(s=>({...s,isApplyable:false}))} };
  } catch {
    return { success: false, error: "HR advisory could not be safely completed. Refresh and retry." };
  }
}

// ── 2. Compliance Explanation ─────────────────────────────────────────────────

export async function explainEmployeeCompliance(
  employeeId: number
): Promise<HrAiActionResult<HrAiComplianceExplanation>> {
  const start = Date.now();
  try {
    const access = await getEmployeeAccess(await getAuthContext(), employeeId);
    const ctx = access.scopedContext;
    if (!ctx.profile?.id) return { success: false, error: "Not authenticated." };
    if (!access.allows('hr.compliance.view')) return {success:false,error:'Compliance advisory access denied.'};
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

    const db = await createClient();
    const canMedical = hasPermission(ctx, "hr.medical.view");
    const facts=await readHrAiReviewFacts(db,employeeId,'compliance',canMedical);
    const today=facts.asOf,complianceContext=facts.text+`\nSource fingerprint: ${facts.sourceFingerprint}`;

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

    await verifyReviewAccess(employeeId,ctx.profile.id,HR_AI_FEATURE_FLAGS.COMPLIANCE_EXPLAIN,'hr.compliance.view',canMedical);
    const outcome = await callCommonAiStructuredCompletion(systemPrompt, userPrompt, { maxTokens: 1500, temperature: 0 });
    await verifyReviewAccess(employeeId,ctx.profile.id,HR_AI_FEATURE_FLAGS.COMPLIANCE_EXPLAIN,'hr.compliance.view',canMedical);
    if((await readHrAiReviewFacts(db,employeeId,'compliance',canMedical)).sourceFingerprint!==facts.sourceFingerprint)return {success:false,error:'Advisory source facts changed; refresh before retrying.'};
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
    return { success: true, data: {...validated.data,overallComplianceLevel:'unknown'} };
  } catch {
    return { success: false, error: "HR advisory could not be safely completed. Refresh and retry." };
  }
}

// ── 3. Readiness Explanation ──────────────────────────────────────────────────

export async function explainEmployeeReadiness(
  employeeId: number
): Promise<HrAiActionResult<HrAiReadinessExplanation>> {
  const start = Date.now();
  try {
    const access = await getEmployeeAccess(await getAuthContext(), employeeId);
    const ctx = access.scopedContext;
    if (!ctx.profile?.id) return { success: false, error: "Not authenticated." };
    if (!access.allows('hr.assignments.view')) return {success:false,error:'Readiness advisory access denied.'};
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

    const db = await createClient();

    const facts=await readHrAiReviewFacts(db,employeeId,'readiness');
    const readinessContext=facts.text+`\nSource fingerprint: ${facts.sourceFingerprint}`;

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

    await verifyReviewAccess(employeeId,ctx.profile.id,HR_AI_FEATURE_FLAGS.READINESS_EXPLAIN,'hr.assignments.view');
    const outcome = await callCommonAiStructuredCompletion(systemPrompt, userPrompt, { maxTokens: 1500, temperature: 0 });
    await verifyReviewAccess(employeeId,ctx.profile.id,HR_AI_FEATURE_FLAGS.READINESS_EXPLAIN,'hr.assignments.view');
    if((await readHrAiReviewFacts(db,employeeId,'readiness')).sourceFingerprint!==facts.sourceFingerprint)return {success:false,error:'Advisory source facts changed; refresh before retrying.'};
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
    return { success: true, data: {...validated.data,overallStatus:facts.overallStatus} };
  } catch {
    return { success: false, error: "HR advisory could not be safely completed. Refresh and retry." };
  }
}
