"use server";

/**
 * HR.12 — HR AI Activity Log
 *
 * Reads HR AI usage logs from erp_ai_usage_logs filtered to HR AI features.
 * No raw prompts, responses, or sensitive data stored or returned.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission, hasPermissionInScope } from "@/lib/rbac/check";
import { getEmployeeAccess } from "@/lib/rbac/employee-access";
import { createClient } from "@/lib/supabase/server";
import { HR_AI_FEATURE_FLAGS } from "@/lib/hr/ai/types";
import type { HrAiActivityRecord, HrAiActionResult } from "@/lib/hr/ai/types";

import { verifiedPreview } from "@/server/reads/verified-aggregate";

const HR_FEATURE_CODES = Object.values(HR_AI_FEATURE_FLAGS);

export async function listHrAiActivity(
  entityType: "employee" | "candidate",
  entityId: number
): Promise<HrAiActionResult<HrAiActivityRecord[]>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) return { success: false, error: "Not authenticated." };
    if (!hasPermission(ctx, "hr.ai.view"))
      return { success: false, error: "Permission denied: hr.ai.view required." };

    if (!Number.isSafeInteger(entityId) || entityId <= 0) return { success: false, error: "Invalid subject." };
    if (entityType === "employee") {
      if (!(await getEmployeeAccess(ctx, entityId)).allows("hr.ai.view")) return { success: false, error: "Access denied." };
    } else if (entityType === "candidate") {
      const candidate = await (await createClient()).from("hr_candidates").select("id,owner_company_id,branch_id").eq("id",entityId).is("deleted_at",null).maybeSingle();
      if (candidate.error || !candidate.data || !hasPermissionInScope(ctx,"hr.ai.view",candidate.data.owner_company_id,candidate.data.branch_id)) return { success: false, error: "Candidate unavailable or access denied." };
    } else return { success: false, error: "Invalid subject." };

    const db = createAdminClient();
    const { data } = await verifiedPreview(db
      .from("erp_ai_usage_logs")
      .select("id,feature_area,operation_type,status,duration_ms,model_id,input_token_count,output_token_count,created_by,created_at", {count:"exact"})
      .in("feature_area", HR_FEATURE_CODES)
      .eq("metadata_json->>entity_type", entityType)
      .eq("metadata_json->>entity_id", String(entityId))
      .order("created_at", { ascending: false })
      .order("id", {ascending:false})
      .limit(50), 50);

    const records: HrAiActivityRecord[] = (data ?? []).map((row) => ({
      id: row.id,
      featureCode: row.feature_area,
      entityType,
      entityId,
      inputContextType: "authorized_subject_context",
      redactionProfile: "not_recorded",
      sensitiveDataIncluded: null,
      outputType: row.operation_type,
      status: row.status,
      durationMs: row.duration_ms,
      createdAt: row.created_at,
      createdBy: row.created_by,
      model: row.model_id,
      promptTokens: row.input_token_count,
      completionTokens: row.output_token_count,
    }));

    const current = await getAuthContext();
    if (current.profile?.id !== ctx.profile.id || !hasPermission(current,"hr.ai.view") || JSON.stringify(current.roleAssignments) !== JSON.stringify(ctx.roleAssignments)) return { success:false,error:"Access changed. Refresh and try again." };
    if (entityType === "employee" && !(await getEmployeeAccess(current,entityId)).allows("hr.ai.view")) return { success:false,error:"Access changed. Refresh and try again." };
    if (entityType === "candidate") {
      const check = await (await createClient()).from("hr_candidates").select("id,owner_company_id,branch_id").eq("id",entityId).is("deleted_at",null).maybeSingle();
      if (check.error || !check.data || !hasPermissionInScope(current,"hr.ai.view",check.data.owner_company_id,check.data.branch_id)) return { success:false,error:"Candidate unavailable or access denied." };
    }
    return { success: true, data: records };
  } catch {
    return { success: false, error: "Activity could not be verified. Refresh to try again." };
  }
}
