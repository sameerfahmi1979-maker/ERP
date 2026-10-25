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

import { isHrAiFeatureEnabled, isHrAiMasterEnabled } from "@/lib/hr/ai/feature-flags";
import type { HrAiActionResult, HrAiDuplicateOutput, HrAiDuplicateSuggestion } from "@/lib/hr/ai/types";
import { HR_AI_FEATURE_FLAGS } from "@/lib/hr/ai/types";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logHrAiUsage } from "@/lib/hr/ai/usage-log";
import { createClient } from "@/lib/supabase/server";
import { verifiedAggregate } from "@/server/reads/verified-aggregate";
import { getEmployeeAccess } from "@/lib/rbac/employee-access";


export async function detectEmployeeDuplicates(
  employeeId: number
): Promise<HrAiActionResult<HrAiDuplicateOutput>> {
  const start = Date.now();
  try {
    const access = await getEmployeeAccess(await getAuthContext(), employeeId);
    const ctx = access.scopedContext;
    if (!ctx.profile?.id) return { success: false, error: "Not authenticated." };
    if (!hasPermission(ctx, "hr.ai.use"))
      return { success: false, error: "Permission denied: hr.ai.use required." };

    const [masterEnabled, featureEnabled] = await Promise.all([
      isHrAiMasterEnabled(),
      isHrAiFeatureEnabled(HR_AI_FEATURE_FLAGS.DUPLICATES),
    ]);
    if (!masterEnabled || !featureEnabled)
      return { success: false, error: "HR AI duplicate detection is currently disabled.", featureDisabled: true };

    const db = await createClient();

    const { data: emp, error: employeeError } = await db
      .from("employees")
      .select("id, employee_code, full_name_en, mobile_number, personal_email")
      .eq("id", employeeId)
      .is("deleted_at", null)
      .maybeSingle();

    if (employeeError) throw Error("Employee source unavailable");
    if (!emp || emp.id !== employeeId) return { success: false, error: "Employee not found." };

    // Load identity documents for deterministic checks
    const { data: identityDocs } = await verifiedAggregate((from,to) => db
      .from("employee_identity_documents")
      .select("id,document_type,document_number",{count:"exact"})
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .order("id").range(from,to));

    // ── DETERMINISTIC CHECKS ─────────────────────────────────────────────────

    const duplicates: HrAiDuplicateSuggestion[] = [];
    const checksPerformed: string[] = [];

    // Check: same mobile number
    if (emp.mobile_number) {
      checksPerformed.push("Same mobile number");
      const { data: mobileDups } = await verifiedAggregate((from,to) => db
        .from("employees")
        .select("id,employee_code,full_name_en",{count:"exact"})
        .eq("mobile_number", emp.mobile_number)
        .neq("id", employeeId)
        .is("deleted_at", null)
        .order("id").range(from,to));

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
      const { data: emailDups } = await verifiedAggregate((from,to) => db
        .from("employees")
        .select("id,employee_code,full_name_en",{count:"exact"})
        .eq("personal_email", emp.personal_email)
        .neq("id", employeeId)
        .is("deleted_at", null)
        .order("id").range(from,to));

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

    // Check all permitted matching identity rows in bounded chunks, not one query per document.
    const numbers = [...new Set((identityDocs ?? []).map(d => d.document_number).filter((v): v is string => typeof v === "string" && !!v))];
    if (numbers.length > 200) throw Error("Identity comparison budget exceeded");
    const identityMatches = numbers.length ? (await verifiedAggregate((from,to) => db.from("employee_identity_documents")
      .select("id,employee_id,document_type,document_number,employees!inner(id,employee_code,full_name_en)",{count:"exact"})
      .in("document_number",numbers).neq("employee_id",employeeId).is("deleted_at",null).is("employees.deleted_at",null).order("id").range(from,to))).data : [];
    for (const doc of identityDocs ?? []) {
      if (!doc.document_number) continue;
      checksPerformed.push(`Same ${doc.document_type}`);
      const docDups = identityMatches.filter(r => r.document_type === doc.document_type && r.document_number === doc.document_number);

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

    const summary = duplicates.length === 0
      ? "No exact-match indicators found among the records currently available to your account. This does not certify that the person has no duplicates."
      : `Found ${duplicates.length} potential indicators among permitted records; showing up to 10. Human review is required before any action.`;

    const current = await getEmployeeAccess(await getAuthContext(),employeeId);
    if (current.scopedContext.profile?.id !== ctx.profile.id || JSON.stringify(current.scopedContext.roleAssignments) !== JSON.stringify(ctx.roleAssignments) || !hasPermission(current.scopedContext,"hr.ai.use") || !await isHrAiMasterEnabled() || !await isHrAiFeatureEnabled(HR_AI_FEATURE_FLAGS.DUPLICATES)) throw Error("Current access changed");
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
  } catch {
    return { success: false, error: "Duplicate checks could not be completed. Refresh and try again." };
  }
}
