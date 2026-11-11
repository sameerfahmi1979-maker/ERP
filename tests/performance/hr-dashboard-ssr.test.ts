import {afterEach, expect, it, vi} from "vitest";
const state = vi.hoisted(() => ({auth: vi.fn(), read: vi.fn()}));
vi.mock("@/lib/rbac/check", async () => ({...await import("@/lib/rbac/scope"), getAuthContext: state.auth}));
vi.mock("@/server/reads/hr-dashboard", () => ({readHrDashboard: state.read}));
vi.mock("next/navigation", () => ({redirect: (path: string) => {throw Error(`REDIRECT:${path}`);}}));
vi.mock("@/features/hr/dashboard/hr-dashboard-page-client", () => ({HrDashboardPageClient: () => null}));
vi.mock("@/features/hr/dashboard/hr-dashboard-workspace", () => ({HrDashboardWorkspace: () => null}));
import Page from "@/app/(protected)/admin/hr/dashboard/page";
import type {AuthContext} from "@/lib/rbac/check";
const ctx = {profile: {id: 1, auth_user_id: "synthetic"}, isAccountActive: true, accountStatus: "active", permissionCodes: ["hr.dashboard.view"], roleCodes: [], roleAssignments: []} as unknown as AuthContext;
afterEach(() => {vi.clearAllMocks();});
it("SSR passes the validated identity to the single DMS-style client read path without a private seed", async () => {
  const data = {synthetic: true}; state.auth.mockResolvedValue(ctx); state.read.mockResolvedValue({success: true, data});
  const page = await Page(); expect(state.auth).toHaveBeenCalledTimes(1); expect(state.read).not.toHaveBeenCalled();
  expect(page.props.authContext).toBe(ctx); expect(page.props.initialRead).toBeUndefined();
});
it("SSR failure is not serialized as successful empty initialData", async () => {
  state.auth.mockResolvedValue(ctx); state.read.mockResolvedValue({success: false, error: "Unavailable"});
  expect((await Page()).props.initialRead).toBeUndefined();
});
it("unauthorized SSR stops before the dashboard reader", async () => {
  state.auth.mockResolvedValue({...ctx, permissionCodes: []}); await expect(Page()).rejects.toThrow("REDIRECT:/admin/hr/employees"); expect(state.read).not.toHaveBeenCalled();
});
