import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ ctx: {} as Record<string, unknown>, response: { data: null as unknown, error: null as unknown }, rpc: { data: true as unknown, error: null as unknown }, calls: [] as string[] }));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: async () => state.ctx, hasPermission: (ctx: { permissionCodes: string[] }, code: string) => ctx.permissionCodes.includes(code) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: async () => state.rpc, from(table: string) { state.calls.push(table); const q = { select: () => q, eq: () => q, maybeSingle: async () => state.response }; return q; } }) }));
import { readAuthorizedAssistantEntity, normalizeAssistantReference } from "@/lib/ai/common/assistant/entity-access";
beforeEach(() => {
  state.ctx = { profile: { id: 1, must_change_password: false }, isAccountActive: true, roleCodes: [], permissionCodes: ["organizations.view", "dms.documents.view"] };
  state.response = { data: { id: 9, trade_name: "SYNTHETIC COMPANY", company_code: "SYN-9", updated_at: "v1" }, error: null }; state.rpc = { data: true, error: null }; state.calls = [];
});
describe("current record authorization before links/history", () => {
  it("normalizes known aliases without granting new capabilities", () => {
    expect(normalizeAssistantReference("organization", 9)).toEqual({ entityType: "company", entityId: 9 }); expect(normalizeAssistantReference("arbitrary_table", 9)).toBeNull();
  });
  it("returns only current permitted business labels and a version", async () => {
    expect(await readAuthorizedAssistantEntity("organization", 9)).toEqual({ reference: { entityType: "company", entityId: 9 }, label: "SYNTHETIC COMPANY", businessCode: "SYN-9", version: "v1" });
  });
  it.each(["inactive", "password", "permission"])("does not query business data on %s failure", async failure => {
    if (failure === "inactive") state.ctx.isAccountActive = false; if (failure === "password") (state.ctx.profile as Record<string, unknown>).must_change_password = true; if (failure === "permission") state.ctx.permissionCodes = ["ai.assistant.admin"];
    expect(await readAuthorizedAssistantEntity("company", 9)).toBeNull(); expect(state.calls).toEqual([]);
  });
  it("does not invent labels for missing, mismatched or unversioned records", async () => {
    for (const data of [null, { id: 8, updated_at: "v1" }, { id: 9 }]) { state.response.data = data; expect(await readAuthorizedAssistantEntity("company", 9)).toBeNull(); }
  });
  it("preserves underlying read failures", async () => { state.response.error = { code: "57014" }; await expect(readAuthorizedAssistantEntity("company", 9)).rejects.toThrow("unavailable"); });
  it("checks DMS record permission independently from coarse AI/admin access", async () => {
    state.rpc.data = false; expect(await readAuthorizedAssistantEntity("document", 9)).toBeNull(); expect(state.calls).toEqual([]);
    state.rpc.error = {}; await expect(readAuthorizedAssistantEntity("document", 9)).rejects.toThrow();
  });
  it("holds undeclared employee facts for the later identity/domain stage", async () => expect(await readAuthorizedAssistantEntity("employee", 9)).toBeNull());
});
