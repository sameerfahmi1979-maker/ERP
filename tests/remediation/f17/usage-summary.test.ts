import { expect, it } from "vitest";
import { buildUsageSnapshot, usageErrorCategory, type UsageRow } from "@/lib/ai/observability/usage-summary";
import { observabilityWindow } from "@/server/reads/dms-ai-observability";
import { dashboardPeriodStart } from "@/lib/ai/common/dashboard/metric-definitions";
const now = "2026-10-26T01:00:00.000Z";
function row(id: number, values: Partial<UsageRow> = {}): UsageRow {
  return { id, status: "success", feature_area: "dms", operation_type: "ocr", model_id: "test-model", provider_config_id: 9,
    input_token_count: 10, output_token_count: 2, estimated_cost: .01, duration_ms: 40, document_id: null,
    created_at: now, error_message: null, cost_currency: "USD", ...values };
}
it("keeps totals complete beyond the old cap and labels only the recent preview as bounded", () => {
  const data = buildUsageSnapshot(Array.from({ length: 10001 }, (_, i) => row(i+1, { feature_area: `area-${i%25}` })), now);
  expect(data.overview.totalLogs).toBe(10001); expect(data.costs).toHaveLength(25);
  expect(data.costs.reduce((n, r) => n+r.totalCalls, 0)).toBe(10001);
  expect(data.overview.totalInputTokens).toBe(100010); expect(data.recent).toHaveLength(100);
  expect(data.recent[0].id).toBe(10001);
});
it("never presents a known subset of tokens or costs as a complete total", () => {
  const data = buildUsageSnapshot([row(1), row(2, { input_token_count: null, estimated_cost: null })], now);
  expect(data.overview.totalInputTokens).toBeNull(); expect(data.overview.totalOutputTokens).toBe(4);
  expect(data.overview.totalEstimatedCost).toBeNull(); expect(data.overview.costKnownCount).toBe(1);
  expect(data.costs[0].estimatedCost).toBeNull(); expect(data.providers[0].estimatedCost).toBeNull();
});
it("counts failure aliases without inventing skipped outcomes", () => {
  const data = buildUsageSnapshot(["success", "failed", "failure", "error", "skipped", "pending"].map((status, i) => row(i+1, { status })), now);
  expect(data.overview).toMatchObject({ totalLogs: 6, successCount: 1, failedCount: 3, skippedCount: 1, otherCount: 1 });
  expect(data.errors[0].count).toBe(3);
});
it("keeps operation boundaries when grouping errors and removes raw text", () => {
  const data = buildUsageSnapshot([row(1,{ status:"failed", error_message:"private document XYZ" }), row(2,{ status:"failed", operation_type:"summary", error_message:"private document XYZ" })],now);
  expect(data.errors).toHaveLength(2); expect(JSON.stringify(data)).not.toContain("private document");
});
it.each(["Bearer arbitrary_token", "https://secret.example?key=private", "john@private.example", '{"password":"secret"}', "private extracted salary text"])("never echoes diagnostics: %s", error => {
  expect(usageErrorCategory(error)).toBe("Processing failure");
});
it("distinguishes empty verified data from unknown metric evidence", () => {
  expect(buildUsageSnapshot([], now).overview).toMatchObject({ totalLogs:0, totalInputTokens:0, totalEstimatedCost:0 });
});
it.each([NaN, Infinity, -1])("rejects invalid metric %s", value => {
  expect(() => buildUsageSnapshot([row(1,{ estimated_cost:value })],now)).toThrow();
});
it("uses inclusive Dubai calendar dates with an exclusive next-day boundary", () => {
  expect(observabilityWindow({dateFrom:"2026-10-26",dateTo:"2026-10-26"})).toMatchObject({from:"2026-10-25T20:00:00.000Z",until:"2026-10-26T20:00:00.000Z"});
  expect(observabilityWindow({dateTo:"2028-02-29"}).until).toBe("2028-02-29T20:00:00.000Z");
});
it.each([{dateFrom:"2026-02-29"},{dateFrom:"2026-10-27",dateTo:"2026-10-26"},{documentId:0},{modelId:"x".repeat(121)}])("rejects malformed filters %j", filters => {
  expect(() => observabilityWindow(filters)).toThrow();
});
it("uses Dubai midnight independently of server timezone", () => {
  expect(dashboardPeriodStart("today",new Date("2026-10-25T21:00:00Z"))).toBe("2026-10-25T20:00:00.000Z");
  expect(dashboardPeriodStart("last_7_days",new Date(now))).toBe("2026-10-19T01:00:00.000Z");
  expect(() => dashboardPeriodStart("bad" as never)).toThrow();
});
