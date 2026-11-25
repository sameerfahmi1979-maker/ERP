import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { verifiedHead } from "./verified-aggregate";

type SessionClient = Awaited<ReturnType<typeof createClient>>;

export function readAiSummaryCount(query: Parameters<typeof verifiedHead>[0]): Promise<number | null> {
  return verifiedHead(query).then(result => result.count, () => null);
}

type SummaryCountQuery = Parameters<typeof verifiedHead>[0];

export async function readAiGroupedCounts<Key extends string>(
  db: SessionClient,
  kind: "risk" | "compliance" | "duplicate",
  queries: Record<Key, () => SummaryCountQuery>,
): Promise<Record<Key, number | null>> {
  const fields = Object.keys(queries) as Key[];
  try {
    const { data, error, status } = await db.rpc("erp_ai_summary_counts", { p_kind: kind });
    if (status === 401 || status === 403 || error?.code === "42501") {
      return Object.fromEntries(fields.map(field => [field, null])) as Record<Key, null>;
    }
    const counts = data as Record<Key, unknown> | null;
    if (!error && counts && fields.every(field => {
      const n = counts[field];
      return typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
    })) {
      return Object.fromEntries(fields.map(field => [field, counts[field]])) as Record<Key, number>;
    }
  } catch {
    // Independent reads preserve per-card availability if the grouped read fails.
  }
  const entries = await Promise.all(fields.map(async field => [
    field,
    await Promise.resolve().then(() => readAiSummaryCount(queries[field]())).catch(() => null),
  ] as const));
  return Object.fromEntries(entries) as Record<Key, number | null>;
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
