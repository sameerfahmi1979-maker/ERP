import { beforeEach, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/rbac/check";

const m = vi.hoisted(() => ({ ctx: {} as AuthContext, read: vi.fn(), admin: vi.fn(), flag: vi.fn() }));
vi.mock("@/lib/rbac/check", async () => ({ ...await vi.importActual("@/lib/rbac/scope"), getAuthContext: async () => m.ctx }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: m.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => chain(m.flag) }) }));
function chain(read: typeof m.read) {
  const calls: Array<[string, ...unknown[]]> = [];
  const q = new Proxy({}, { get: (_target, key) => key === "then"
    ? (ok: (value: unknown) => unknown, fail: (error: unknown) => unknown) => Promise.resolve().then(() => read(calls)).then(ok, fail)
    : (...args: unknown[]) => { calls.push([String(key), ...args]); return q; } });
  return q;
}
import { getDmsAiJobQueueObservability, getDmsAiPipelineHealth, getDmsAiObservabilityConfig, getDmsAiObservabilityOverview } from "@/server/actions/dms/ai-observability";

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx = { profile: { id: 1 } as AuthContext["profile"], email: null, isAccountActive: true, accountStatus: "active", roleCodes: [], permissionCodes: ["dms.ai_observability.view"], globalPermissionCodes: ["dms.ai_observability.view"], roleAssignments: [] };
  m.flag.mockResolvedValue({ data: { is_enabled: true }, error: null });
  m.admin.mockReturnValue({ from: () => chain(m.read) });
  m.read.mockResolvedValue({ data: [], count: 0, error: null });
});
it.each([getDmsAiJobQueueObservability, getDmsAiPipelineHealth])("never labels a failed count as healthy zero", async action => {
  m.read.mockResolvedValue({ data: null, count: null, error: { message: "private-payload" } });
  const result = await action();
  expect(result.success).toBe(false); expect(result.data).toBeUndefined(); expect(JSON.stringify(result)).not.toContain("private-payload");
});
it("distinguishes a failed flag read from a disabled feature", async () => {
  m.flag.mockResolvedValue({ data: null, error: { message: "private flag error" } });
  const result = await getDmsAiObservabilityConfig();
  expect(result.success).toBe(false); expect(result.data).toBeUndefined();
});
it("does not expose thrown provider/database diagnostics", async () => {
  m.read.mockRejectedValue(new Error("document-content password=confidential"));
  const result = await getDmsAiObservabilityOverview();
  expect(result.success).toBe(false); expect(JSON.stringify(result)).not.toMatch(/document-content|confidential/);
});
it("rejects an inactive account even with a stale administrator role label", async () => {
  m.ctx = { ...m.ctx, isAccountActive: false, roleCodes: ["system_admin"] };
  expect((await getDmsAiObservabilityOverview()).success).toBe(false);
  expect(m.admin).not.toHaveBeenCalled();
});
it("returns verified empty counts", async () => {
  expect((await getDmsAiJobQueueObservability()).data?.queuedCount).toBe(0);
  expect((await getDmsAiPipelineHealth()).data?.documentsAiFailed).toBe(0);
});
