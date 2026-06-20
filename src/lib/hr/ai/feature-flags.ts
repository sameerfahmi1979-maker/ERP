/**
 * HR.12 — HR AI Feature Flag Helpers
 *
 * Server-side helpers for checking HR AI feature flag status.
 * Uses user-scoped Supabase client (respects RLS on erp_ai_feature_flags).
 */

import { createClient } from "@/lib/supabase/server";
import type { HrAiFeatureFlagCode } from "./types";

/**
 * Returns true if a specific HR AI feature flag is enabled in the DB.
 * Fails safe (returns false on error).
 */
export async function isHrAiFeatureEnabled(
  featureCode: HrAiFeatureFlagCode
): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", featureCode)
      .maybeSingle();
    return data?.is_enabled === true;
  } catch {
    return false;
  }
}

/**
 * Returns true if the master HR AI switch (ERP_AI_HR_EMPLOYEE_ASSIST) is on.
 * All HR AI features should check this first.
 */
export async function isHrAiMasterEnabled(): Promise<boolean> {
  return isHrAiFeatureEnabled("ERP_AI_HR_EMPLOYEE_ASSIST");
}
