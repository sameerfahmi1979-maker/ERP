// @vitest-environment jsdom
import {afterEach, expect, it, vi} from "vitest";
import {cleanup, render} from "@testing-library/react";
import type {AuthContext} from "@/lib/rbac/check";
const m = vi.hoisted(() => ({auth: vi.fn(), child: vi.fn(), redirect: vi.fn((url: string) => {throw Error("REDIRECT:" + url);})}));
vi.mock("@/lib/rbac/check", async original => ({...await original<typeof import("@/lib/rbac/check")>(), getAuthContext: m.auth}));
vi.mock("next/navigation", () => ({redirect: m.redirect}));
vi.mock("@/components/erp/page-header", () => ({ERPPageHeader: () => null}));
vi.mock("@/features/hr/search", () => ({HrSearchPageClient: (props: unknown) => {m.child(props); return null;}}));
import HrSearchPage from "@/app/(protected)/admin/hr/search/page";
const auth: AuthContext = {profile: {
  id: 6, auth_user_id: "synthetic", must_change_password: false, avatar_url: null, branch_id: null, created_at: "2026-10-05T00:00:00Z",
  department: null, display_name: null, email_confirmed_by_admin_at: null, email_confirmed_by_admin_id: null, employee_reference: null,
  full_name: null, job_title: null, last_admin_updated_at: null, last_password_security_action: null, last_password_security_action_at: null,
  last_password_security_action_by: null, manager_user_profile_id: null, must_change_password_reason: null, notes: null, owner_company_id: null,
  password_changed_at: null, password_reset_sent_at: null, password_set_by_admin_at: null, phone: null, preferred_language: null, status: "active",
  timezone: null, updated_at: "2026-10-05T00:00:00Z", user_code: null,
}, isAccountActive: true, accountStatus: "active", email: null, roleCodes: [], permissionCodes: ["hr.employees.view"], globalPermissionCodes: ["hr.employees.view"]};
afterEach(() => {cleanup(); vi.clearAllMocks();});
it("the actual server parent binds exact current principal and existing category capabilities without eager results", async () => {
  m.auth.mockResolvedValue(auth); render(await HrSearchPage()); expect(m.auth).toHaveBeenCalledTimes(1);
  expect(m.child).toHaveBeenCalledWith({authContext: auth, permissions: {canEmployees: true, canRecruitment: false, canCompliance: false, canTime: false, canPayroll: false, canOperations: false, canActions: false, canAiUse: false}});
});
it.each(["no-role", "inactive", "forced-change"])("the %s principal cannot mount a permitted search client", async mode => {
  m.auth.mockResolvedValue(mode === "no-role" ? {...auth, permissionCodes: [], globalPermissionCodes: []} : mode === "inactive" ? {...auth, isAccountActive: false}
    : {...auth, profile: {...auth.profile!, must_change_password: true}});
  await expect(HrSearchPage()).rejects.toThrow("REDIRECT:/admin/hr"); expect(m.child).not.toHaveBeenCalled();
});
