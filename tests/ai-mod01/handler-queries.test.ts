import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ permitted: true, read: vi.fn(), calls: [] as Array<[string, ...unknown[]]>, result: { data: [] as unknown[], error: null as unknown } }));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: async () => ({}), hasPermission: () => state.permitted }));
vi.mock("@/lib/ai/common/assistant/entity-access", () => ({ readAuthorizedAssistantEntity: state.read, normalizeAssistantReference: (entityType: string, entityId: number) => ["company", "party", "branch", "site", "dms_document"].includes(entityType) && Number.isSafeInteger(entityId) && entityId > 0 ? { entityType, entityId } : null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from(table: string) { state.calls.push(["from", table]); const chain: Record<string, unknown> = { then: (done: (v: unknown) => unknown) => Promise.resolve(state.result).then(done) }; for (const key of ["select", "eq", "in", "is", "order", "limit", "or"]) chain[key] = (...args: unknown[]) => { state.calls.push([key, ...args]); return chain; }; return chain; } }) }));
import { getComplianceFindingsForHandler, getDuplicateCandidatesForHandler } from "@/lib/ai/common/assistant/handler-queries";
beforeEach(() => { state.permitted = true; state.calls.length = 0; state.result = { data: [], error: null }; state.read.mockReset().mockResolvedValue({ label: "SYNTHETIC" }); });
describe("helper schema, failures and exact sides", () => {
  it("does not turn absent signal permission into no findings", async () => { state.permitted = false; await expect(getComplianceFindingsForHandler("party",42,5)).rejects.toThrow(); expect(state.calls).toEqual([]); });
  it("maps actual compliance columns and preserves verified empty", async () => {
    expect(await getComplianceFindingsForHandler("party", 42, 5)).toEqual([]);
    state.result.data = [{ id: 1, severity: "high", ai_reason: "SYNTHETIC finding", recommended_action: null, finding_type: "mismatch", status: "open" }];
    expect((await getComplianceFindingsForHandler("party", 42, 5))[0].finding_text).toBe("SYNTHETIC finding");
    expect(state.calls.find(c => c[0] === "select")![1]).not.toContain("finding_text");
  });
  it.each(["compliance", "duplicates"])("%s read failure never becomes empty success", async kind => {
    state.result.error = { code: "57014" };
    await expect((kind === "compliance" ? getComplianceFindingsForHandler : getDuplicateCandidatesForHandler)("party", 42, 5)).rejects.toThrow();
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid source identity %s", async id => expect(getDuplicateCandidatesForHandler("party", id, 5)).rejects.toThrow());
  it.each([0, -1, 11, 2.5])("rejects unbounded limit %s", async limit => expect(getComplianceFindingsForHandler("party", 42, limit)).rejects.toThrow());
  it("does not execute an unauthorized or unregistered table lookup", async () => {
    state.read.mockResolvedValue(null); await expect(getComplianceFindingsForHandler("party", 42, 5)).rejects.toThrow(); expect(state.calls).toEqual([]);
    await expect(getDuplicateCandidatesForHandler("party),id.gt.0", 42, 5)).rejects.toThrow();
  });
  it("pairs type and ID on the same side and uses confidence_score", async () => {
    state.result.data = [{ id: 1, confidence_score: 0.99, status: "pending", entity_type_a: "party", entity_id_a: 42, entity_type_b: "company", entity_id_b: 90 }];
    expect((await getDuplicateCandidatesForHandler("party", 42, 5))[0].similarity_score).toBe(0.99);
    expect(state.calls.filter(c => c[0] === "or")).toEqual([["or", "and(entity_type_a.eq.party,entity_id_a.eq.42),and(entity_type_b.eq.party,entity_id_b.eq.42)"]]);
    expect(state.calls.find(c => c[0] === "order")![1]).toBe("confidence_score");
  });
  it("rejects cross-paired responses defensively", async () => {
    state.result.data = [{ id: 1, confidence_score: 0.99, status: "pending", entity_type_a: "party", entity_id_a: 7, entity_type_b: "company", entity_id_b: 42 }];
    await expect(getDuplicateCandidatesForHandler("party", 42, 5)).rejects.toThrow();
  });
  it("does not count an inaccessible opposite side", async () => {
    state.result.data = [{ id: 1, status: "pending", entity_type_a: "party", entity_id_a: 42, entity_type_b: "company", entity_id_b: 90 }];
    state.read.mockImplementation(async (type: string) => type === "party" ? { label: "SYNTHETIC" } : null);
    await expect(getDuplicateCandidatesForHandler("party", 42, 5)).rejects.toThrow();
  });
});
