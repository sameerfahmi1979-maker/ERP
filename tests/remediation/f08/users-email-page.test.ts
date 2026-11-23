import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  auth: vi.fn(),
  rpc: vi.fn(),
  table: vi.fn(),
  listAuth: vi.fn(),
  getAuthUser: vi.fn(),
}));

vi.mock("@/lib/rbac/check", () => ({
  getAuthContext: mock.auth,
  hasPermission: (ctx: { permissionCodes: string[] }, permission: string) =>
    ctx.permissionCodes.includes(permission),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mock.table, rpc: mock.rpc }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { listUsers: mock.listAuth, getUserById: mock.getAuthUser } },
  }),
}));

import { listUsersPaginated } from "@/server/queries/users";

describe("admin Users exact scoped email search", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mock.auth.mockResolvedValue({ profile: { id: 20 }, permissionCodes: ["users.view"] });
    mock.listAuth.mockResolvedValue({
      data: {
        users: Array.from({ length: 1_000 }, (_, i) => ({
          id: "synthetic-" + (i + 1), email: `ordinary-${i + 1}@example.invalid`,
        })),
      },
      error: null,
    });
    mock.getAuthUser.mockResolvedValue({
      data: { user: { email: "late@example.invalid" } },
      error: null,
    });
  });

  it("finds the allowed 1,250th Auth record without enumerating Auth users", async () => {
    mock.rpc.mockReturnValue({
      single: async () => ({ data: { total_count: 1, profile_ids: [1250] }, error: null }),
    });
    mock.table.mockImplementation((relation) => {
      const relationshipPage = relation === "user_roles";
      const query = {
        select: () => query,
        eq: () => query,
        in: (column: string, ids: number[]) => {
          expect(column).toBe(relationshipPage ? "user_profile_id" : "id");
          expect(ids).toEqual([1250]);
          return query;
        },
        order: () => query,
        range: () => query,
        then: (resolve: (_: object) => void) => resolve(relationshipPage
          ? { data: [], count: 0, error: null }
          : {
              data: [{ id: 1250, auth_user_id: "synthetic-1250", owner_company_id: 20, branch_id: 30 }],
              error: null,
            }),
      };
      return query;
    });

    const result = await listUsersPaginated({
      page: 1, pageSize: 25, search: " LATE@Example.Invalid ", status: "active",
      ownerCompanyId: 20, branchId: 30, roleId: 40, mustChangePassword: true,
    });
    expect(result.totalCount).toBe(1);
    expect(result.rows.map(({ id, email, roles }) => ({ id, email, roles }))).toEqual([
      { id: 1250, email: "late@example.invalid", roles: [] },
    ]);
    expect(mock.rpc).toHaveBeenCalledWith("erp_users_search_email_page", {
      p_search: "LATE@Example.Invalid", p_status: "active", p_company_id: 20,
      p_branch_id: 30, p_role_id: 40, p_require_password_change: true, p_offset: 0, p_limit: 25,
    });
    expect(mock.listAuth).not.toHaveBeenCalled();
    expect(mock.getAuthUser).toHaveBeenCalledExactlyOnceWith("synthetic-1250");
  });

  it("keeps the exact authorized total past the last page with no Auth enrichment", async () => {
    mock.rpc.mockReturnValue({
      single: async () => ({ data: { total_count: 35, profile_ids: [] }, error: null }),
    });
    const result = await listUsersPaginated({ page: 3, pageSize: 25, search: "@example.invalid" });
    expect(result).toEqual({ page: 3, pageSize: 25, totalCount: 35, rows: [] });
    expect(mock.table).not.toHaveBeenCalled();
    expect(mock.listAuth).not.toHaveBeenCalled();
    expect(mock.getAuthUser).not.toHaveBeenCalled();
  });

  it("distinguishes search failure from an authorized empty result", async () => {
    mock.rpc.mockReturnValue({ single: async () => ({ data: null, error: { message: "isolated outage" } }) });
    await expect(listUsersPaginated({ search: "late@example.invalid" })).rejects.toThrow(
      "Email search could not be loaded.",
    );
    expect(mock.table).not.toHaveBeenCalled();
    expect(mock.listAuth).not.toHaveBeenCalled();
  });

  it("never starts Auth search when the Users permission is absent", async () => {
    mock.auth.mockResolvedValue({ profile: { id: 20 }, permissionCodes: [] });
    expect(await listUsersPaginated({ search: "late@example.invalid" })).toEqual({
      page: 1, pageSize: 25, totalCount: 0, rows: [],
    });
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.listAuth).not.toHaveBeenCalled();
  });
});
