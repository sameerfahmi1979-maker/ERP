import { beforeEach, describe, expect, it, vi } from "vitest";
import { readWorkQueueScopes } from "@/server/reads/work-queues";

const mocked = vi.hoisted(() => ({ actor: vi.fn(), rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rbac/check", async () => ({
  ...(await vi.importActual("@/lib/rbac/scope")),
  getAuthContext: mocked.actor,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocked.rpc }),
}));

function principal(role: string, company: number | null = null, permissions: string[] = []) {
  return {
    profile: { must_change_password: false },
    isAccountActive: true,
    roleCodes: [role],
    permissionCodes: permissions,
    roleAssignments: [{ roleCode: role, ownerCompanyId: company, branchId: null }],
  };
}

describe("operator and administrator Work Queue discovery", () => {
  beforeEach(() => {
    mocked.actor.mockReset();
    mocked.rpc.mockReset().mockResolvedValue({ data: [], error: null });
  });

  it("lets the reserved system administrator ask for scope choices without a business permission", async () => {
    mocked.actor.mockResolvedValue(principal("system_admin"));
    await expect(readWorkQueueScopes()).resolves.toEqual({ status: "ok", data: [] });
    expect(mocked.rpc).toHaveBeenCalledWith("t19_queue_scopes", {});
  });

  it.each([
    principal("group_admin"),
    principal("company_admin", 17),
    { ...principal("system_admin"), profile: { must_change_password: true } },
    { ...principal("system_admin"), isAccountActive: false },
  ])("rejects a principal without usable system or queue authority", async actor => {
    mocked.actor.mockResolvedValue(actor);
    await expect(readWorkQueueScopes()).resolves.toEqual({ status: "restricted" });
    expect(mocked.rpc).not.toHaveBeenCalled();
  });

  it("lets a scoped operator ask the database for choices", async () => {
    mocked.actor.mockResolvedValue(principal("operator", 17, ["hr.actions.view"]));
    await expect(readWorkQueueScopes()).resolves.toEqual({ status: "ok", data: [] });
    expect(mocked.rpc).toHaveBeenCalledWith("t19_queue_scopes", {});
  });
});
