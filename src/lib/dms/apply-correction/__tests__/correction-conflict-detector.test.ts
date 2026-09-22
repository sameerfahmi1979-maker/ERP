import { beforeEach, describe, expect, it, vi } from "vitest";
import { detectCorrectionConflicts, type PreApplyState } from "../correction-conflict-detector";

// Only transport is mocked. Status, allowlist and live-value comparisons use
// the production function, not a mirrored implementation.
const db = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const base: PreApplyState = {
  proposalStatus: "draft", originalItemStatus: "applied", targetTable: "dms_documents",
  targetField: "title", targetModule: "dms", targetRecordId: 90001,
  proposalCurrentSummary: null, replaceExistingConfirmed: false,
};
beforeEach(() => {
  vi.resetAllMocks();
  db.from.mockReturnValue(db); db.select.mockReturnValue(db); db.eq.mockReturnValue(db);
  db.maybeSingle.mockResolvedValue({ data: { title: null }, error: null });
});
describe("actual correction conflict detector", () => {
  it.each([
    ["applied", "proposal_already_applied"], ["cancelled", "proposal_already_cancelled"],
    ["conflict", "proposal_not_in_correctable_state"], ["failed", "proposal_not_in_correctable_state"],
  ])("blocks proposal %s before any database read", async (proposalStatus, code) => {
    expect(await detectCorrectionConflicts({ ...base, proposalStatus })).toMatchObject({ conflict: true, code });
    expect(db.from).not.toHaveBeenCalled();
  });
  it.each(["draft", "pending_confirmation"])("allows %s only after the actual target read", async (proposalStatus) => {
    expect(await detectCorrectionConflicts({ ...base, proposalStatus })).toEqual({ conflict: false });
    expect(db.from).toHaveBeenCalledWith("dms_documents"); expect(db.eq).toHaveBeenCalledWith("id", 90001);
  });
  it.each(["skipped", "conflict", "failed"])("blocks original item %s", async (originalItemStatus) => {
    expect(await detectCorrectionConflicts({ ...base, originalItemStatus })).toMatchObject({ conflict: true, code: "original_item_not_applied" });
    expect(db.from).not.toHaveBeenCalled();
  });
  it("allows an applied original item with an unchanged empty target", async () => {
    expect(await detectCorrectionConflicts(base)).toEqual({ conflict: false }); expect(db.maybeSingle).toHaveBeenCalledOnce();
  });
  it.each([
    ["new value", "original value", false, "conflict_detected"],
    ["Trade License", "Trade License", false, "replace_existing_required"],
    ["Trade License", "Trade License", true, null],
    [null, null, false, null],
    ["trade license", "Trade License", true, null],
  ])("compares live %s against snapshot %s", async (live, snapshot, confirmed, code) => {
    db.maybeSingle.mockResolvedValue({ data: { title: live }, error: null });
    const result = await detectCorrectionConflicts({ ...base, proposalCurrentSummary: snapshot, replaceExistingConfirmed: confirmed });
    expect(result).toMatchObject(code ? { conflict: true, code } : { conflict: false });
    expect(db.select).toHaveBeenCalledWith("title");
  });
  it("rejects a forbidden target through the actual registry before querying it", async () => {
    expect(await detectCorrectionConflicts({ ...base, targetTable: "user_roles", targetField: "role_id" })).toMatchObject({ conflict: true, code: "target_not_allowlisted" });
    expect(db.from).not.toHaveBeenCalled();
  });
  it("blocks a missing row or returned read error instead of allowing overwrite", async () => {
    db.maybeSingle.mockResolvedValue({ data: null, error: { message: "synthetic read failure" } });
    expect(await detectCorrectionConflicts(base)).toMatchObject({ conflict: true, code: "target_record_not_found" });
  });
  it("blocks a rejected live-value read", async () => {
    db.maybeSingle.mockRejectedValue(new Error("synthetic transport failure"));
    expect(await detectCorrectionConflicts(base)).toMatchObject({ conflict: true, code: "conflict_detected" });
  });
});
