import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ read: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/ai/common/assistant/entity-access", () => ({ readAuthorizedAssistantEntity: state.read }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: state.rpc }) }));
import { assistantAuthorityFingerprint, createAssistantHistoryBinding, createAssistantHistoryVerifier, verifyAssistantSessionNow } from "@/lib/ai/common/assistant/history-access";
import type { AuthContext } from "@/lib/rbac/check";
const context = () => ({ profile: { id: 11, must_change_password: false }, isAccountActive: true, accountStatus: "active", roleCodes: ["viewer"], permissionCodes: ["ai.assistant.use", "organizations.view"], roleAssignments: [{ roleId: 1, roleCode: "viewer", ownerCompanyId: 1, branchId: 2, permissionCodes: ["organizations.view"] }] }) as unknown as AuthContext;
const ref = { entityType: "company", entityId: 20 } as const;
beforeEach(() => { vi.clearAllMocks(); state.read.mockResolvedValue({ reference: ref, version: "source-v1", label: "SYNTHETIC", businessCode: "SYN-20" }); state.rpc.mockResolvedValue({ data: true, error: null }); });
describe("retained history source checks", () => {
  it("replays an owned, same-scope, current-source binding", async () => {
    const ctx = context(); const b = await createAssistantHistoryBinding(ctx, 7, [ref]);
    expect(await createAssistantHistoryVerifier(ctx, 7)(b)).toBe(true);
  });
  it.each([{}, null, { version: 9 }, { version: 1, sources: [] }])("withholds unbound or malformed legacy history %j", async raw => expect(await createAssistantHistoryVerifier(context(), 7)(raw)).toBe(false));
  it("does not grant AI administrators another owner's conversation", async () => {
    const b = await createAssistantHistoryBinding(context(), 7, [ref]); const admin = context(); admin.profile!.id = 99; admin.roleCodes = ["system_admin"]; admin.permissionCodes.push("ai.assistant.admin");
    expect(await createAssistantHistoryVerifier(admin, 7)(b)).toBe(false);
  });
  it("fences conversation identity and account switches", async () => {
    const b = await createAssistantHistoryBinding(context(), 7, [ref]); expect(await createAssistantHistoryVerifier(context(), 8)(b)).toBe(false);
  });
  it.each(["role", "permission", "company", "branch", "inactive", "password"])("withholds on %s changes", async change => {
    const ctx = context(); const b = await createAssistantHistoryBinding(ctx, 7, [ref]);
    if (change === "role") ctx.roleCodes.push("other"); if (change === "permission") ctx.permissionCodes.pop();
    if (change === "company") ctx.roleAssignments![0].ownerCompanyId = 2; if (change === "branch") ctx.roleAssignments![0].branchId = 3;
    if (change === "inactive") ctx.isAccountActive = false; if (change === "password") ctx.profile!.must_change_password = true;
    expect(await createAssistantHistoryVerifier(ctx, 7)(b)).toBe(false);
  });
  it("withholds source ownership/access revocation without a role change", async () => {
    const b = await createAssistantHistoryBinding(context(), 7, [ref]); state.read.mockResolvedValue(null);
    expect(await createAssistantHistoryVerifier(context(), 7)(b)).toBe(false);
  });
  it("withholds changed source versions and distinguishes read errors", async () => {
    const b = await createAssistantHistoryBinding(context(), 7, [ref]); state.read.mockResolvedValue({ version: "source-v2" });
    expect(await createAssistantHistoryVerifier(context(), 7)(b)).toBe(false);
    state.read.mockRejectedValue(new Error("outage")); await expect(createAssistantHistoryVerifier(context(), 7)(b)).rejects.toThrow("outage");
  });
  it("deduplicates source checks and caps binding size", async () => {
    const b = await createAssistantHistoryBinding(context(), 7, [ref, ref]); expect(b!.sources).toHaveLength(1);
    state.read.mockClear(); const verify = createAssistantHistoryVerifier(context(), 7); await verify(b); await verify(b); expect(state.read).toHaveBeenCalledTimes(1);
    expect(await createAssistantHistoryBinding(context(), 7, Array.from({ length: 11 }, (_, i) => ({ ...ref, entityId: i + 1 })))).toBe(null);
  });
  it("normalizes permission ordering without flattening exact assignments", () => {
    const a = context(), b = context(); b.permissionCodes.reverse(); expect(assistantAuthorityFingerprint(a)).toBe(assistantAuthorityFingerprint(b));
    b.roleAssignments![0].branchId = null; expect(assistantAuthorityFingerprint(a)).not.toBe(assistantAuthorityFingerprint(b));
  });
  it.each([{ data: false, error: null }, { data: null, error: { message: "unavailable" } }])("denies invalid/unavailable current sessions", async result => { state.rpc.mockResolvedValue(result); await expect(verifyAssistantSessionNow()).rejects.toThrow(); });
});
