import { describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/rbac/check";
import { employeeRecord } from "../hr-directory";
import type { Db } from "../hr-reads";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const actor = {
  profile: { id: 9 },
  roleCodes: [],
  roleAssignments: [],
  permissionCodes: [],
} as unknown as AuthContext;

function fixture({ allowed = true, returnedId = 12 } = {}) {
  const calls: string[] = [];
  const db = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push(name);
      switch (name) {
        case "f03_has_employee_permission":
          expect(args.employee_id).toBe(12);
          return { data: allowed && args.permission_code === "hr.employee_profile.view" };
        case "mobile_hr_profile":
          expect(args.p_employee).toBe(12);
          return { data: {
            id: returnedId, employee_code: "S012", full_name_en: "Synthetic Employee", employee_status: "active",
            joining_date: null, workspace_revision: 7, owner_company_id: 8, branch_id: 9, reporting_manager_id: null,
            owner_company: "Synthetic company", branch: "Branch", department: null, designation: null, manager: null,
            site: null, own: false, contacts: null,
          } };
        case "mobile_hr_own_access":
          return { data: null };
        case "mobile_hr_staff_capabilities":
          expect(args).toEqual({ p_subject: 12, p_expanded: true, p_own: false });
          return { data: { roster: false, approvalsGeneral: false, approvalsLeave: false, approvalsProposal: false, requestsTeam: true } };
        case "hr_subject_photo_state":
          expect(args).toEqual({ p_employee: 12, p_dependent: null });
          return { data: { documentId: null, photo: null, framing: null, canDownload: false } };
        case "mobile_dms_document":
          expect(args).toEqual({ p_action: "employee_folder_access", p_data: { employeeId: 12 } });
          return { data: false };
        default:
          throw new Error(`Unexpected RPC ${name}`);
      }
    },
    from(table: string) {
      calls.push(table);
      expect(table).toBe("employees");
      const query = {
        select(fields: string) {
          expect(fields).not.toMatch(/bank|blood|salary/);
          return query;
        },
        eq(key: string, value: number) {
          expect([key, value]).toEqual(["id", 12]);
          return query;
        },
        is: () => query,
        async maybeSingle() { return { data: { supervisor: { full_name_en: "Synthetic Supervisor" } } }; },
      };
      return query;
    },
  } as unknown as Db;
  createClient.mockResolvedValue(db);
  return { db, calls };
}

describe("scoped mobile employee record", () => {
  it("loads one matching profile for identity and capabilities", async () => {
    const { db, calls } = fixture();
    const result = await employeeRecord(db, actor, 12);
    expect(result).toMatchObject({
      employeeId: 12, name: "Synthetic Employee", revision: "7", own: false, photo: null,
      capabilities: { requestsTeam: true, profile: true, linkedDocuments: false },
      sections: { contacts: [], emergency: [], medical: null },
    });
    expect(result.sections.employment).toContainEqual({ key: "supervisor", label: "Supervisor", value: "Synthetic Supervisor" });
    expect(calls.filter(call => call === "mobile_hr_profile")).toHaveLength(1);
  });

  it("stops before loading profile data when the employee is outside current authority", async () => {
    const { db, calls } = fixture({ allowed: false });
    await expect(employeeRecord(db, actor, 12)).rejects.toMatchObject({ status: 403 });
    expect(calls).toEqual(["f03_has_employee_permission", "f03_has_employee_permission"]);
  });

  it("rejects a profile returned for another employee", async () => {
    const { db, calls } = fixture({ returnedId: 13 });
    await expect(employeeRecord(db, actor, 12)).rejects.toMatchObject({ status: 403 });
    expect(calls).not.toContain("mobile_dms_document");
  });
});
