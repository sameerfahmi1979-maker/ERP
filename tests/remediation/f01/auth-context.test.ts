import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  profile: {
    id: 1, auth_user_id: "test", status: "active", must_change_password: false,
    owner_company_id: null, branch_id: null,
  },
  assignments: [] as Array<{ role_id: number; owner_company_id: number | null; branch_id: number | null }>,
  roles: [] as Array<{ id: number; role_code: string }>,
  permissions: [] as Array<{ id: number; permission_code: string }>,
  links: [] as Array<{ role_id: number; permission_id: number }>,
}));

function query(table: string) {
  const data = table === "user_profiles" ? state.profile : table === "user_roles" ? state.assignments :
    table === "roles" ? state.roles : table === "role_permissions" ? state.links : state.permissions;
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    maybeSingle: async () => ({ data }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data }).then(resolve),
  };
  return builder;
}
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test", email: "f00-test@example.invalid" } } }) },
    rpc: async () => ({ data: true, error: null }),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: query, rpc: async () => ({ data: structuredClone(state), error: null }) }),
}));

import { getAuthContext, getAuthContextForProfileId, hasGlobalPermission, hasPermission, hasPermissionInScope, isGlobalAdmin } from "@/lib/rbac/check";

beforeEach(() => {
  state.profile.status = "active";
  state.assignments = [{ role_id: 1, owner_company_id: 900101, branch_id: null }];
  state.roles = [{ id: 1, role_code: "system_admin" }];
  state.permissions = [];
  state.links = [];
});

it("company-scoped system administrator has no global authority", async () => {
  const ctx = await getAuthContext();
  expect(isGlobalAdmin(ctx)).toBe(false);
  expect(hasPermission(ctx, "erp.admin")).toBe(false);
  expect(ctx.roleCodes).not.toContain("system_admin");
  expect(ctx.roleAssignments).toEqual([]);
});

it("valid global administrator retains authority", async () => {
  state.assignments = [{ role_id: 1, owner_company_id: null, branch_id: null }];
  const ctx = await getAuthContext();
  expect(isGlobalAdmin(ctx)).toBe(true);
  expect(hasPermission(ctx, "erp.admin")).toBe(true);
});

it("inactive global administrator loses authority", async () => {
  state.profile.status = "inactive";
  state.assignments = [{ role_id: 1, owner_company_id: null, branch_id: null }];
  const ctx = await getAuthContext();
  expect(isGlobalAdmin(ctx)).toBe(false);
  expect(hasPermission(ctx, "erp.admin")).toBe(false);
});

it("unknown account status fails closed", async () => {
  state.profile.status = "unexpected";
  expect((await getAuthContext()).isAccountActive).toBe(false);
});

it("preserves complete authority across companies, sibling branches, reserved roles and large grants", async () => {
  state.roles = [
    { id: 1, role_code: "system_admin" },
    { id: 2, role_code: "group_admin" },
    { id: 3, role_code: "company_admin" },
    { id: 4, role_code: "branch_admin" },
    { id: 5, role_code: "ordinary" },
  ];
  state.assignments.push(
    { role_id: 2, owner_company_id: 900101, branch_id: 900201 },
    { role_id: 3, owner_company_id: 900101, branch_id: null },
    { role_id: 3, owner_company_id: 900102, branch_id: 900203 },
    { role_id: 4, owner_company_id: 900102, branch_id: null },
    { role_id: 4, owner_company_id: 900102, branch_id: 900203 },
    { role_id: 5, owner_company_id: 900101, branch_id: 900202 },
    { role_id: 6, owner_company_id: null, branch_id: null },
  );
  state.permissions = Array.from({ length: 1002 }, (_, index) => ({
    id: index + 1, permission_code: index === 0 ? "settings.edit" : `fixture.permission.${index + 1}`,
  }));
  state.links = [
    { role_id: 1, permission_id: 1 },
    { role_id: 2, permission_id: 2 },
    { role_id: 3, permission_id: 3 },
    { role_id: 4, permission_id: 4 },
    ...state.permissions.map(permission => ({ role_id: 5, permission_id: permission.id })),
    { role_id: 5, permission_id: 1003 },
  ];

  const ctx = await getAuthContext();
  const worker = await getAuthContextForProfileId(1);
  expect(ctx).toEqual({ ...worker, email: "f00-test@example.invalid" });
  expect(ctx.roleCodes).toEqual(["company_admin", "branch_admin", "ordinary"]);
  expect(ctx.roleAssignments?.map(({ roleId, ownerCompanyId, branchId }) => [roleId, ownerCompanyId, branchId]))
    .toEqual([[3, 900101, null], [4, 900102, 900203], [5, 900101, 900202]]);
  expect(ctx.permissionCodes).toHaveLength(1001);
  expect(ctx.roleAssignments?.[2].permissionCodes).toHaveLength(1002);
  expect(hasGlobalPermission(ctx, "settings.edit")).toBe(false);
  expect(hasPermission(ctx, "settings.edit")).toBe(false);
  expect(hasPermissionInScope(ctx, "fixture.permission.3", 900101, 900201)).toBe(true);
  expect(hasPermissionInScope(ctx, "fixture.permission.3", 900102, 900203)).toBe(false);
  expect(hasPermissionInScope(ctx, "fixture.permission.4", 900102, 900203)).toBe(true);
  expect(hasPermissionInScope(ctx, "fixture.permission.4", 900102, 900204)).toBe(false);
  expect(hasPermissionInScope(ctx, "fixture.permission.1002", 900101, 900202)).toBe(true);
  expect(hasPermissionInScope(ctx, "fixture.permission.1002", 900101, 900201)).toBe(false);

  state.links.pop();
  state.links.pop();
  const revoked = await getAuthContext();
  expect(hasPermissionInScope(revoked, "fixture.permission.1002", 900101, 900202)).toBe(false);
  expect(hasPermissionInScope(revoked, "fixture.permission.1001", 900101, 900202)).toBe(true);
  state.assignments = state.assignments.filter(assignment => assignment.role_id !== 5);
  expect(hasPermissionInScope(await getAuthContext(), "fixture.permission.1001", 900101, 900202)).toBe(false);
});
