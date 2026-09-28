import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadCorrectionSource } from "../correction-source-loader";

// Real loader, private eligibility helper and registry; mock database replies only.
const db = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
beforeEach(() => {
  vi.resetAllMocks(); db.from.mockReturnValue(db); db.select.mockReturnValue(db); db.eq.mockReturnValue(db);
});
function replies(valueType: string, previous: string | null, overrides: Record<string, unknown> = {}) {
  db.maybeSingle.mockResolvedValueOnce({ data: {
    id: 90001, apply_run_id: 90002, target_table: "dms_documents", target_field: "title",
    target_record_id: 90003, target_display_label: "Synthetic", value_type: valueType,
    current_value_summary: previous, applied_value_summary: "Applied synthetic", status: "applied", ...overrides,
  }, error: null }).mockResolvedValueOnce({ data: {
    id: 90002, run_code: "SYNTHETIC", document_id: 90004, target_module: "dms",
  }, error: null }).mockResolvedValueOnce({ data: { title: "CURRENT_LIVE_SYNTHETIC" }, error: null });
}
describe("actual correction source loader", () => {
  it.each([
    ["date", "2024-01-15", true, null], ["date", null, false, "No previous value"],
    ["date", "   ", false, "No previous value"], ["number", "42.5", true, null],
    ["number", "", false, "No previous value"], ["boolean", "true", true, null],
    ["text", "Short text value", true, "summary"], ["text", "Truncated...", true, "truncated"],
    ["text", "A".repeat(200), true, "truncated"], ["text", null, false, "No previous"],
    ["text", "", false, "No previous"], ["unknown_type", "value", false, null],
  ])("loads actual %s eligibility for previous %s", async (type, previous, enabled, warning) => {
    replies(type, previous); const result = await loadCorrectionSource(90001, 90005);
    expect(result.ok).toBe(true); if (!result.ok) throw new Error(result.error.message);
    expect(result.data.restorePreviousEnabled).toBe(enabled);
    if (warning === null) expect(result.data.restorePreviousWarning).toBeNull();
    else expect(result.data.restorePreviousWarning).toContain(warning);
    expect(result.data.currentValueSummary).toBe("CURRENT_LIVE_SYNTHETIC");
    expect(result.data.originalBeforeSummary).toBe(previous);
    expect(db.from.mock.calls.map(c => c[0])).toEqual(["dms_ai_erp_apply_items", "dms_ai_erp_apply_runs", "dms_documents"]);
    expect(db.eq).toHaveBeenLastCalledWith("id", 90003);
  });
  it("rejects a returned source-item error", async () => {
    db.maybeSingle.mockResolvedValue({ data: null, error: { message: "synthetic" } });
    expect(await loadCorrectionSource(90001, 90005)).toMatchObject({ ok: false, error: { error: "original_item_not_found" } });
    expect(db.from).toHaveBeenCalledOnce();
  });
  it("rejects an original item that was not applied", async () => {
    replies("text", "previous", { status: "failed" });
    expect(await loadCorrectionSource(90001, 90005)).toMatchObject({ ok: false, error: { error: "original_item_not_applied" } });
    expect(db.from).toHaveBeenCalledOnce();
  });
});
