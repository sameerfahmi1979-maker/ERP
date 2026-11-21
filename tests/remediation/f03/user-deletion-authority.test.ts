import { beforeEach, expect, it, vi } from "vitest";
import { syntheticAuthContext } from "../../performance/fixtures/auth-context";

const state = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), admin: vi.fn(), profile: vi.fn() }));
vi.mock("@/lib/rbac/check", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/rbac/check")>(), getAuthContext: state.auth }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: state.rpc }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: state.admin }));
vi.mock("@/server/actions/audit", () => ({ logAudit: vi.fn() }));

import { deleteUser } from "@/server/actions/users";

beforeEach(() => {
  vi.resetAllMocks();
  state.auth.mockResolvedValue({ ...syntheticAuthContext(["users.delete"]), globalPermissionCodes: [],
    roleAssignments: [{ roleId: 41, roleCode: "operator", ownerCompanyId: 1, branchId: 2, permissionCodes: ["users.delete"] }] });
  state.profile.mockResolvedValue({ data: null, error: null });
  state.admin.mockImplementation(() => {
    const query = { select: () => query, eq: () => query, single: state.profile };
    return { from: () => query };
  });
});

it.each([{ data: false, error: null }, { data: null, error: { code: "42501" } }])(
  "rejects an unavailable whole-identity scope before using a privileged lookup", async (authority) => {
    state.rpc.mockResolvedValue(authority);
    expect(await deleteUser(7)).toEqual({ success: false, error: "This account is unavailable or outside your company/branch scope." });
    expect(state.rpc).toHaveBeenCalledWith("administrator_can_manage_identity", { target_profile: 7, capability: "users.delete" });
    expect(state.admin).not.toHaveBeenCalled();
  },
);

it("checks native admission before lookup and safely handles a missing profile after admission", async () => {
  state.rpc.mockResolvedValue({ data: true, error: null });
  state.profile.mockResolvedValue({ data: null, error: { message: "Private lookup diagnostic" } });
  expect(await deleteUser(7)).toEqual({ success: false, error: "This account is unavailable or outside your company/branch scope." });
  expect(state.rpc.mock.invocationCallOrder[0]).toBeLessThan(state.admin.mock.invocationCallOrder[0]);
});
