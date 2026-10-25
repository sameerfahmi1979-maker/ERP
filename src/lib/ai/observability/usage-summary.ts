import type { UsageOverviewData, TokenCostSummaryRow, ProviderModelBreakdownRow, FeatureBreakdownRow, RecentUsageEventRow, ErrorBreakdownRow } from "@/server/actions/dms/ai-observability";
import { z } from "zod";

const metric = z.number().finite().nonnegative().nullable();
export const usageRowSchema = z.object({
  id: z.number().int().positive(), status: z.string(),
  feature_area: z.string().nullable(), operation_type: z.string().nullable(),
  model_id: z.string().nullable(), provider_config_id: z.number().int().positive().nullable(),
  input_token_count: metric, output_token_count: metric, estimated_cost: metric, duration_ms: metric,
  document_id: z.number().int().positive().nullable(), created_at: z.string().datetime({ offset: true }),
  error_message: z.string().nullable(), cost_currency: z.string().nullable().optional(),
});
export type UsageRow = z.infer<typeof usageRowSchema>;
export interface UsageSnapshot {
  asOf: string;
  overview: UsageOverviewData;
  costs: TokenCostSummaryRow[];
  providers: ProviderModelBreakdownRow[];
  features: FeatureBreakdownRow[];
  recent: RecentUsageEventRow[];
  errors: ErrorBreakdownRow[];
}
export const failedUsageStatus = (status: string) => ["failed", "failure", "error"].includes(status);
/** Diagnostic text is untrusted and may contain documents, URLs or credentials. Never echo it. */
export function usageErrorCategory(message: string | null): string {
  if (!message) return "Failure details unavailable";
  if (/timeout|timed out/i.test(message)) return "Provider or dependency timeout";
  if (/rate.?limit|too many requests|\b429\b/i.test(message)) return "Provider rate limit";
  if (/permission|unauthorized|forbidden|\b40[13]\b/i.test(message)) return "Access or configuration failure";
  if (/unavailable|network|fetch failed|connection/i.test(message)) return "Provider or dependency unavailable";
  return "Processing failure";
}
function total(rows: UsageRow[], field: "input_token_count" | "output_token_count" | "estimated_cost") {
  if (rows.some(row => row[field] === null || field === "estimated_cost" && row.cost_currency !== "USD")) return null;
  const value = rows.reduce((sum, row) => sum + (row[field] ?? 0), 0);
  if (!Number.isFinite(value)) throw Error("Metric overflow");
  return value;
}
function group(rows: UsageRow[], key: (row: UsageRow) => string) {
  const groups = new Map<string, UsageRow[]>();
  for (const row of rows) { const id = key(row); const found = groups.get(id); if (found) found.push(row); else groups.set(id, [row]); }
  return [...groups.values()].sort((a, b) => b.length - a.length || a[0].id - b[0].id);
}
function measures(rows: UsageRow[]) {
  return { totalCalls: rows.length, successCalls: rows.filter(r => r.status === "success").length,
    failedCalls: rows.filter(r => failedUsageStatus(r.status)).length,
    totalInputTokens: total(rows, "input_token_count"), totalOutputTokens: total(rows, "output_token_count") };
}
/** All summaries derive from the same complete, validated set; group lists are not silently capped. */
export function buildUsageSnapshot(input: UsageRow[], asOf: string): UsageSnapshot {
  const rows = usageRowSchema.array().parse(input);
  const totalEstimatedCost = total(rows, "estimated_cost");
  const groups = group(rows, r => JSON.stringify([r.feature_area, r.operation_type]));
  const costs = groups.map(rs => ({ featureArea: rs[0].feature_area ?? "Unknown", operationType: rs[0].operation_type ?? "Unknown", ...measures(rs), estimatedCost: total(rs, "estimated_cost") }));
  const providers = group(rows, r => JSON.stringify([r.model_id, r.provider_config_id])).map(rs => ({ modelId: rs[0].model_id, providerConfigId: rs[0].provider_config_id, ...measures(rs), estimatedCost: total(rs, "estimated_cost") }));
  const features = groups.map(rs => {
    const durations = rs.flatMap(r => r.duration_ms === null ? [] : [r.duration_ms]);
    return { featureArea: rs[0].feature_area ?? "Unknown", operationType: rs[0].operation_type ?? "Unknown", ...measures(rs), avgDurationMs: durations.length ? Math.round(durations.reduce((a,b) => a+b, 0) / durations.length) : null, durationSampleCount: durations.length };
  });
  const recent = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id-a.id).slice(0, 100).map(r => ({
    id: r.id, featureArea: r.feature_area ?? "Unknown", operationType: r.operation_type ?? "Unknown", modelId: r.model_id, status: r.status,
    inputTokenCount: r.input_token_count, outputTokenCount: r.output_token_count, estimatedCost: r.cost_currency === "USD" ? r.estimated_cost : null, durationMs: r.duration_ms,
    documentId: r.document_id, createdAt: r.created_at, safeDisplayFields: {},
  }));
  const errors = group(rows.filter(r => failedUsageStatus(r.status)), r => JSON.stringify([r.feature_area, r.operation_type, usageErrorCategory(r.error_message)]))
    .map(rs => ({ featureArea: rs[0].feature_area ?? "Unknown", operationType: rs[0].operation_type ?? "Unknown", errorMessage: usageErrorCategory(rs[0].error_message), count: rs.length, lastSeen: rs.reduce((latest, r) => r.created_at > latest ? r.created_at : latest, rs[0].created_at) }));
  return { asOf, costs, providers, features, recent, errors, overview: {
    totalLogs: rows.length, successCount: rows.filter(r => r.status === "success").length,
    failedCount: rows.filter(r => failedUsageStatus(r.status)).length, skippedCount: rows.filter(r => r.status === "skipped").length,
    otherCount: rows.filter(r => !["success", "skipped"].includes(r.status) && !failedUsageStatus(r.status)).length,
    totalInputTokens: total(rows, "input_token_count"), totalOutputTokens: total(rows, "output_token_count"),
    totalEstimatedCost, costDataAvailable: totalEstimatedCost !== null, costKnownCount: rows.filter(r => r.estimated_cost !== null && r.cost_currency === "USD").length,
    asOf,
  } };
}
