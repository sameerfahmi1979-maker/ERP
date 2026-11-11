import { beforeEach, expect, it, vi } from "vitest";
import { syntheticAuthContext } from "../../performance/fixtures/auth-context";
import { adminListApprovalAssigneeOptions } from "@/server/actions/dms/document-approvals";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), select: vi.fn(), range: vi.fn(), branch: vi.fn() }));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/server/actions/audit", () => ({ logAudit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const criteria = { companyId: 2, branchId: 2, requiredRole: "als_reviewer" };
const permissions = ["dms.documents.view", "dms.documents.preview", "notifications.view", "dms.approvals.act"];

function profile(id: number, company: number | null, branch: number | null, code: string, grants = permissions) {
  return {
    id, user_code: null, display_name: `Synthetic reviewer ${id}`, full_name: null,
    assignments: [{ owner_company_id: company, branch_id: branch, is_active: true,
      role: { role_code: code, is_active: true,
        grants: grants.map(permission_code => ({ permission: { permission_code, is_active: true } })) } }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    ...syntheticAuthContext(["dms.approvals.admin"]),
    roleAssignments: [{ roleId: 10, roleCode: "als_configurator", ownerCompanyId: 2, branchId: null,
      permissionCodes: ["dms.approvals.admin"] }],
  });
  mocks.branch.mockResolvedValue({ data: { id: 2 }, error: null });
  const query = { select: mocks.select, eq: () => query, order: () => query, range: mocks.range, maybeSingle: mocks.branch };
  mocks.select.mockReturnValue(query);
  mocks.admin.mockReturnValue({ from: () => query });
});

it("loads the counted approver list and keeps candidates within the selected ALS scope and role", async () => {
  const data = [
    profile(11, 2, null, "als_reviewer"),
    profile(12, 2, 2, "als_reviewer"),
    profile(13, 2, 3, "als_reviewer"),
    profile(14, 1, null, "als_reviewer"),
    profile(15, 2, null, "different_role"),
    profile(16, 2, null, "als_reviewer", permissions.slice(0, 2)),
  ];
  mocks.range.mockResolvedValue({ data, count: data.length, error: null });
  expect(await adminListApprovalAssigneeOptions(criteria)).toEqual({ success: true, data: [
    { id: 11, label: "Synthetic reviewer 11" }, { id: 12, label: "Synthetic reviewer 12" },
  ] });
  expect(mocks.select).toHaveBeenCalledWith(expect.stringContaining("assignments:user_roles"), { count: "exact" });
});

it("rejects uncounted results and never returns names outside the caller's administration scope", async () => {
  mocks.range.mockResolvedValue({ data: [profile(11, 2, 2, "als_reviewer")], count: null, error: null });
  expect(await adminListApprovalAssigneeOptions(criteria)).toMatchObject({ success: false });
  mocks.admin.mockClear();
  mocks.auth.mockResolvedValue(syntheticAuthContext(["dms.documents.view"]));
  expect(await adminListApprovalAssigneeOptions(criteria)).toMatchObject({ success: false, error: "Permission denied" });
  expect(mocks.admin).not.toHaveBeenCalled();
});
