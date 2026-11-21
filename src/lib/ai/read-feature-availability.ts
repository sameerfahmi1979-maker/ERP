import "server-only";

import { createClient } from "@/lib/supabase/server";

type SetupFeature = "ERP_AI_DAILY_DASHBOARD" | "DMS_AI_OBSERVABILITY";
export type FeatureAvailability = "setup_required" | "disabled" | "enabled" | "unavailable";

export async function readFeatureAvailability(feature: SetupFeature): Promise<FeatureAvailability> {
  try {
    const db = await createClient();
    const { data, error } = await db.rpc("fa_read_ai_setup_feature", { p_feature: feature });
    if (!error && (data === "setup_required" || data === "disabled" || data === "enabled")) return data;
  } catch {
    // Preserve an unavailable read even if the request fails before reaching the database.
  }
  return "unavailable";
}
