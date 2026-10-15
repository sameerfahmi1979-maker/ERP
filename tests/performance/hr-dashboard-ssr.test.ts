import {afterEach, expect, it, vi} from "vitest";
const state = vi.hoisted(() => ({auth: vi.fn(), read: vi.fn()}));
vi.mock("@/lib/rbac/check", async () => ({...await import("@/lib/rbac/scope"), getAuthContext: state.auth}));
vi.mock("@/server/reads/hr-dashboard", () => ({readHrDashboard: state.read}));
vi.mock("next/navigation", () => ({redirect: (path: string) => {throw Error(`REDIRECT:${path}`);}}));
vi.mock("@/features/hr/dashboard/hr-dashboard-page-client", () => ({HrDashboardPageClient: () => null}));
import Page from "@/app/(protected)/admin/hr/dashboard/page";
import {hrDashboardReadIdentity} from "@/lib/reads/hr-dashboard-schema";
import type {AuthContext} from "@/lib/rbac/check";
const ctx = {profile: {id: 1, auth_user_id: "synthetic"}, isAccountActive: true, accountStatus: "active", permissionCodes: ["hr.dashboard.view"], roleCodes: [], roleAssignments: []} as unknown as AuthContext;
afterEach(() => {vi.clearAllMocks();});
it("SSR passes one validated context directly to composition and seeds exactly that identity", async () => {
  const data = {synthetic: true}; state.auth.mockResolvedValue(ctx); state.read.mockResolvedValue({success: true, data});
  const page = await Page(); expect(state.auth).toHaveBeenCalledTimes(1); expect(state.read).toHaveBeenCalledExactlyOnceWith({}, ctx);
  expect(page.props.authContext).toBe(ctx); expect(page.props.initialRead).toEqual({identity: hrDashboardReadIdentity(ctx), data});
});
it("SSR failure is not serialized as successful empty initialData", async () => {
  state.auth.mockResolvedValue(ctx); state.read.mockResolvedValue({success: false, error: "Unavailable"});
  expect((await Page()).props.initialRead).toBeUndefined();
});
it("unauthorized SSR stops before the dashboard reader", async () => {
  state.auth.mockResolvedValue({...ctx, permissionCodes: []}); await expect(Page()).rejects.toThrow("REDIRECT:/admin/hr/employees"); expect(state.read).not.toHaveBeenCalled();
});
