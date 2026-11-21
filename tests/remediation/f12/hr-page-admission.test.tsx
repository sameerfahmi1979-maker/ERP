import type { AnchorHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import HrActionsPage from "@/app/(protected)/admin/hr/actions/page";
import EmployeeNewPage from "@/app/(protected)/admin/hr/employees/record/new/page";
import HrIndexPage from "@/app/(protected)/admin/hr/page";
import type { AuthContext } from "@/lib/rbac/check";

const { auth } = vi.hoisted(() => ({ auth: vi.fn<() => Promise<AuthContext>>() }));

vi.mock("@/lib/rbac/check", async (original) => ({
  ...await original<typeof import("@/lib/rbac/check")>(),
  getAuthContext: auth,
}));
vi.mock("@/features/hr/employees/employee-workspace-form", () => ({
  EmployeeWorkspaceForm: () => <div>Employee creation form</div>,
}));
vi.mock("next/link", () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));
vi.mock("next/navigation", () => ({
  redirect: (target: string) => { throw new Error(target); },
}));

function actor(permissionCodes: string[], roleCode = "synthetic_hr"): AuthContext {
  return {
    profile: { id: 6, must_change_password: false } as AuthContext["profile"],
    email: null,
    accountStatus: "active",
    isAccountActive: true,
    permissionCodes,
    roleCodes: [roleCode],
    roleAssignments: [{ roleId: 7, roleCode, ownerCompanyId: 12, branchId: 120, permissionCodes }],
  };
}

it.each([
  ["hr.dashboard.view", "/admin/hr/dashboard"],
  ["hr.employees.view", "/admin/hr/employees"],
  ["hr.employee_profile.view", "/admin/hr/employees"],
  ["hr.employees.view.self", "/admin/hr/employees"],
  ["hr.employees.view.team", "/admin/hr/employees"],
  ["hr.actions.view", "/admin/hr/actions/pro"],
  ["hr.attendance.view", "/admin/hr/time/attendance"],
  ["hr.leave.view", "/admin/hr/time/leave"],
  ["hr.eos.view", "/admin/hr/actions/eos"],
  ["hr.assignments.view", "/admin/hr/operations/assignments"],
  ["hr.recruitment.manage", "/admin/hr/recruitment/requisitions"],
])("routes an active %s actor to a usable HR page", async (capability, destination) => {
  auth.mockResolvedValue(actor([capability]));
  await expect(HrIndexPage()).rejects.toThrow(destination);
});

it.each(["hr.actions.manage", "hr.attendance.manage", "hr.leave.manage", "hr.eos.manage", "hr.assignments.manage"])(
  "does not choose a read-only HR route for %s alone",
  async (capability) => {
    auth.mockResolvedValue(actor([capability]));
    await expect(HrIndexPage()).rejects.toThrow("/access-denied");
  },
);

it("does not infer employee access from a legacy role label", async () => {
  auth.mockResolvedValue(actor([], "hr_manager"));
  await expect(HrIndexPage()).rejects.toThrow("/access-denied");
});

it("does not route an inactive account using cached capabilities", async () => {
  auth.mockResolvedValue({ ...actor(["hr.leave.view"]), isAccountActive: false });
  await expect(HrIndexPage()).rejects.toThrow("/access-denied");
});

it("opens Add Employee for a profile reader with the explicit creation grant", async () => {
  auth.mockResolvedValue(actor(["hr.employee_profile.view", "hr.employees.create"]));
  expect(renderToStaticMarkup(await EmployeeNewPage())).toContain("Employee creation form");
});

it("requires employee browsing and creation capabilities to open Add Employee", async () => {
  auth.mockResolvedValue(actor(["hr.employees.create"]));
  await expect(EmployeeNewPage()).rejects.toThrow("/access-denied");

  auth.mockResolvedValue(actor(["hr.employee_profile.view"]));
  await expect(EmployeeNewPage()).rejects.toThrow("/admin/hr/employees");
});

it("only links to Disciplinary from HR Actions when confidential reading is permitted", async () => {
  auth.mockResolvedValue(actor(["hr.actions.view"]));
  const general = renderToStaticMarkup(await HrActionsPage());
  expect(general).toContain('href="/admin/hr/actions/pro"');
  expect(general).toContain('href="/admin/hr/actions/approvals"');
  expect(general).not.toContain('href="/admin/hr/actions/disciplinary"');

  auth.mockResolvedValue(actor(["hr.actions.view", "hr.confidential.view"]));
  expect(renderToStaticMarkup(await HrActionsPage())).toContain('href="/admin/hr/actions/disciplinary"');
});
