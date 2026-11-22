import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { verifiedHead } from "./verified-aggregate";

type SessionClient = Awaited<ReturnType<typeof createClient>>;

export function readAiSummaryCount(query: Parameters<typeof verifiedHead>[0]): Promise<number | null> {
  return verifiedHead(query).then(result => result.count, () => null);
}

export async function readAiSummaryFeature(db: SessionClient, code: string): Promise<boolean | null> {
  try {
    const { data, error } = await db.from("erp_ai_feature_flags")
      .select("is_enabled").eq("feature_code", code).maybeSingle();
    return !error && typeof data?.is_enabled === "boolean" ? data.is_enabled : null;
  } catch {
    return null;
  }
}
