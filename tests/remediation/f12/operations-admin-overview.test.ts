import { describe, expect, it } from "vitest";
import type { AuthContext } from "@/lib/rbac/check";
import {
  operationsOverviewAdmission, operationsOverviewScope, operationsOverviewRoutes,
} from "@/lib/operations/admin-overview";
import type { WorkQueueScope } from "@/lib/operations/work-queue-contract";

const assignment = (roleCode: string, ownerCompanyId: number | null, branchId: number | null) =>
  ({ roleCode, ownerCompanyId, branchId, permissionCodes: [] });

function actor(roleCode: string, company: number | null, branch: number | null) {
  return {
    isAccountActive: true, profile: { must_change_password: false }, roleCodes: [roleCode],
    permissionCodes: [], roleAssignments: [assignment(roleCode, company, branch)],
  } as unknown as AuthContext;
}

describe("operations administrator overview", () => {
  it("continues to use authorized operating pages for ordinary workflows", () => {
    const scoped = actor("operator", 1, 2);
    expect(operationsOverviewAdmission(scoped, true, undefined)).toBe("operation");
    expect(operationsOverviewAdmission(scoped, false, "1.2")).toBe("denied");
  });

  it("admits only the active reserved global identity to the administrative summary", () => {
    const admin = actor("system_admin", null, null);
    expect(operationsOverviewAdmission(admin, false, undefined)).toBe("overview");
    expect(operationsOverviewAdmission(admin, true, "1.2")).toBe("overview");
    expect(operationsOverviewAdmission(admin, true, undefined)).toBe("overview");
    const mixed = { ...admin, roleAssignments: [
      ...admin.roleAssignments, assignment("operator", 1, 2),
    ] };
    expect(operationsOverviewAdmission(mixed, true, undefined)).toBe("operation");
    expect(operationsOverviewAdmission(actor("system_admin", 1, 2), false, undefined)).toBe("denied");
    expect(operationsOverviewAdmission(actor("group_admin", null, null), false, undefined)).toBe("denied");
    expect(operationsOverviewAdmission({ ...admin, isAccountActive: false }, true, undefined)).toBe("denied");
  });

  it("matches only exact active scope values and never guesses a branch", () => {
    const scopes: WorkQueueScope[] = [
      { company: 1, branch: 2, company_name: "Test company", branch_name: "Test branch", kinds: ["custody"] },
      { company: 1, branch: null, company_name: "Test company", branch_name: null, kinds: ["pro"] },
    ];
    expect(operationsOverviewScope(scopes, undefined, false)).toBeUndefined();
    expect(operationsOverviewScope(scopes, "1.2", false)).toBe(scopes[0]);
    expect(operationsOverviewScope(scopes, "2.2", false)).toBeUndefined();
    expect(operationsOverviewScope(scopes, "1.0", false)).toBeUndefined();
    expect(operationsOverviewScope(scopes, "1.0", true)).toBe(scopes[1]);
    expect(operationsOverviewScope(scopes, ["1.2"], false)).toBeUndefined();
  });

  it("keeps all eleven audited menu destinations and the allowance detail entry in the overview registry", () => {
    expect(Object.keys(operationsOverviewRoutes)).toHaveLength(12);
    expect(operationsOverviewRoutes["/modules/fleet/allowance-rates"]).toMatchObject({ companyOnly: true });
    expect(operationsOverviewRoutes["/modules/workshop/job-work"]).toMatchObject({ companyOnly: false });
    expect(operationsOverviewRoutes["/admin/hr/operations/workshop-referrals"]).toBeDefined();
  });
});

