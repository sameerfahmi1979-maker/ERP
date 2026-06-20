"use server";

/**
 * HR.12 — HR AI Activity Log
 *
 * Reads HR AI usage logs from erp_ai_usage_logs filtered to HR AI features.
 * No raw prompts, responses, or sensitive data stored or returned.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { HR_AI_FEATURE_FLAGS } from "@/lib/hr/ai/types";
import type { HrAiActivityRecord, HrAiActionResult } from "@/lib/hr/ai/types";

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

    const db = createAdminClient();
    const { data, error } = await db
      .from("erp_ai_usage_logs")
      .select("id, feature_code, entity_type, entity_id, action_type, status, duration_ms, model_used, prompt_tokens, completion_tokens, user_profile_id, created_at, provider_code, config_code, config_id")
      .in("feature_code", HR_FEATURE_CODES)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return { success: false, error: error.message };

    const records: HrAiActivityRecord[] = (data ?? []).map((row) => ({
      id: row.id,
      featureCode: row.feature_code,
      entityType: row.entity_type,
      entityId: row.entity_id,
      inputContextType: "employee_profile",
      redactionProfile: "standard",
      sensitiveDataIncluded: false,
      outputType: row.action_type,
      status: row.status,
      durationMs: row.duration_ms,
      createdAt: row.created_at,
      createdBy: row.user_profile_id,
      model: row.model_used,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
    }));

    return { success: true, data: records };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unexpected error." };
  }
}
