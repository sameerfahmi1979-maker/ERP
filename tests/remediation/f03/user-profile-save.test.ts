import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  readProfile: vi.fn(),
  rpc: vi.fn(),
  update: vi.fn(),
  filter: vi.fn(),
  updatedRow: vi.fn(),
  audit: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("@/lib/rbac/check", async () => ({
  ...await vi.importActual("@/lib/rbac/scope"),
  getAuthContext: m.getAuthContext,
  assertAccountActive: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: m.rpc,
    from: () => {
      const write = { eq: m.filter, select: () => write, maybeSingle: m.updatedRow };
      m.filter.mockReturnValue(write);
      const read = { select: () => read, eq: () => read, single: m.readProfile };
      return { ...read, update: m.update.mockReturnValue(write) };
    },
  }),
}));
vi.mock("@/server/actions/audit", () => ({
  createAuditDiff: (before: object, after: object) => ({ old_values: before, new_values: after }),
  logAudit: m.audit,
}));
vi.mock("@/lib/auth/invitations", () => ({ issueAccountInvitation: vi.fn() }));
vi.mock("@/lib/auth/security-email", () => ({ sendSecurityTemplate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { adminUpdateUserProfile, assignRoleToUser, removeRoleFromUser } from "@/server/actions/users";

const currentVersion = "2026-11-22T12:00:00+00:00";
const earlierVersion = "2026-11-22T11:00:00+00:00";

beforeEach(() => {
  vi.resetAllMocks();
  m.getAuthContext.mockResolvedValue({
    profile: { id: 5, status: "active" },
    isAccountActive: true,
    roleCodes: [],
    permissionCodes: ["users.update", "users.roles.assign"],
  });
  m.readProfile.mockResolvedValue({
    data: {
      id: 13,
      user_code: "USER-FIXTURE",
      full_name: "Fixture User",
      phone: "",
      job_title: "Dispatcher",
      status: "active",
      owner_company_id: 7,
      branch_id: 9,
      updated_at: currentVersion,
      last_admin_updated_at: earlierVersion,
    },
    error: null,
  });
  m.rpc.mockResolvedValue({ data: true, error: null });
  m.updatedRow.mockResolvedValue({ data: { id: 13 }, error: null });
  m.audit.mockResolvedValue({ success: true });
});

it("returns unchanged for equivalent supplied profile fields after checking identity authority", async () => {
  const result = await adminUpdateUserProfile({
    id: 13,
    full_name: "Fixture User",
    phone: null,
    status: "active",
  });

  expect(result).toEqual({ success: true, data: { changed: false } });
  expect(m.rpc).toHaveBeenCalledExactlyOnceWith("administrator_can_manage_identity", {
    target_profile: 13,
    capability: "users.update",
  });
  expect(m.update).not.toHaveBeenCalled();
  expect(m.audit).not.toHaveBeenCalled();
  expect(m.revalidate).not.toHaveBeenCalled();
});

it("checks identity authority before acknowledging an unchanged request", async () => {
  m.rpc.mockResolvedValue({ data: false, error: null });

  const result = await adminUpdateUserProfile({ id: 13, full_name: "Fixture User" });

  expect(result.success).toBe(false);
  expect(m.update).not.toHaveBeenCalled();
  expect(m.audit).not.toHaveBeenCalled();
  expect(m.revalidate).not.toHaveBeenCalled();
});

it("uses the loaded row version and sends only changed allowed fields for a partial update", async () => {
  const result = await adminUpdateUserProfile({
    id: 13,
    expected_updated_at: currentVersion,
    job_title: "Supervisor",
    phone: null,
  });

  expect(result).toEqual({ success: true, data: { changed: true } });
  expect(m.update).toHaveBeenCalledExactlyOnceWith({
    job_title: "Supervisor",
    last_admin_updated_at: expect.any(String),
  });
  expect(m.filter).toHaveBeenCalledWith("id", 13);
  expect(m.filter).toHaveBeenCalledWith("updated_at", currentVersion);
  expect(m.updatedRow).toHaveBeenCalledOnce();
  expect(m.audit).toHaveBeenCalledOnce();
  expect(m.revalidate).toHaveBeenCalledExactlyOnceWith("/admin/users");
});

it("rejects a stale changed submission and accepts a repeat of the current values", async () => {
  const stale = await adminUpdateUserProfile({
    id: 13,
    expected_updated_at: earlierVersion,
    job_title: "Supervisor",
  });
  const repeat = await adminUpdateUserProfile({
    id: 13,
    expected_updated_at: earlierVersion,
    job_title: "Dispatcher",
  });

  expect(stale).toMatchObject({ success: false, error: expect.stringMatching(/changed/i) });
  expect(repeat).toEqual({ success: true, data: { changed: false } });
  expect(m.update).not.toHaveBeenCalled();
  expect(m.audit).not.toHaveBeenCalled();
  expect(m.revalidate).not.toHaveBeenCalled();
});

it("keeps a lost optimistic update separate from a confirmed save", async () => {
  m.updatedRow.mockResolvedValue({ data: null, error: null });

  const result = await adminUpdateUserProfile({ id: 13, job_title: "Supervisor" });

  expect(result).toMatchObject({ success: false, error: expect.stringMatching(/changed/i) });
  expect(m.audit).not.toHaveBeenCalled();
  expect(m.revalidate).not.toHaveBeenCalled();
});

it("returns confirmed profile data when cache refresh throws after the update", async () => {
  m.revalidate.mockImplementation(() => { throw new Error("Synthetic refresh failure"); });

  const result = await adminUpdateUserProfile({ id: 13, job_title: "Supervisor" });

  expect(result).toMatchObject({
    success: true,
    data: { changed: true },
    warning: expect.stringMatching(/refresh/i),
  });
  expect(m.audit).toHaveBeenCalledOnce();
});

const assignment = { user_profile_id: 13, role_id: 5, owner_company_id: 7, branch_id: 9, is_active: true };

it("dispatches assignment and its audit together after one live authorization check", async () => {
  m.rpc.mockResolvedValue({ data: 49, error: null });

  const result = await assignRoleToUser(assignment);

  expect(result).toEqual({ success: true, data: { id: 49 } });
  expect(m.getAuthContext).toHaveBeenCalledOnce();
  expect(m.rpc).toHaveBeenCalledExactlyOnceWith("erp_assign_user_role", {
    target_profile_id: 13, target_role_id: 5, company_id: 7, branch_id: 9, assignment_active: true,
  });
  expect(m.audit).not.toHaveBeenCalled();
  expect(m.revalidate).toHaveBeenCalledExactlyOnceWith("/admin/users");
});

it("reports the existing exact-scope duplicate without a second audit or refresh", async () => {
  m.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "user_roles_scope_unique" } });

  const result = await assignRoleToUser(assignment);

  expect(result).toMatchObject({ success: false, error: expect.stringMatching(/already exists.*same scope/i) });
  expect(m.audit).not.toHaveBeenCalled();
  expect(m.revalidate).not.toHaveBeenCalled();
});

it("returns the witnessed removal when its display refresh fails", async () => {
  m.rpc.mockResolvedValue({ data: 49, error: null });
  m.revalidate.mockImplementation(() => { throw new Error("Synthetic refresh failure"); });

  const result = await removeRoleFromUser({ user_role_id: 49 });

  expect(result).toMatchObject({ success: true, warning: expect.stringMatching(/refresh/i) });
  expect(m.getAuthContext).toHaveBeenCalledOnce();
  expect(m.rpc).toHaveBeenCalledExactlyOnceWith("erp_remove_user_role", { assignment_id: 49 });
  expect(m.audit).not.toHaveBeenCalled();
});

it("requires a confirmed removal and preserves last-administrator failure", async () => {
  m.rpc.mockResolvedValueOnce({ data: 48, error: null });
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "Cannot remove the last active system administrator" } });

  const unwitnessed = await removeRoleFromUser({ user_role_id: 49 });
  const lastAdmin = await removeRoleFromUser({ user_role_id: 49 });

  expect(unwitnessed).toMatchObject({ success: false, error: expect.stringMatching(/confirm/i) });
  expect(lastAdmin).toMatchObject({ success: false, error: expect.stringMatching(/last active system administrator/i) });
  expect(m.audit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    action: "LAST_ADMIN_GUARD_TRIGGERED", entity_id: 49,
  }));
  expect(m.revalidate).not.toHaveBeenCalled();
});
