import type React from "react";
import {beforeEach, expect, it, vi} from "vitest";
import type {AuthContext} from "@/lib/rbac/check";
const state = vi.hoisted(() => ({auth: vi.fn(), database: vi.fn(), registry: {} as Record<string, unknown>, query: [] as unknown[][]}));
vi.mock("@/lib/rbac/check", async () => ({...await vi.importActual("@/lib/rbac/scope"), getAuthContext: state.auth}));
// The SSR route's pre-existing registry client is deliberately unchanged. This
// is not the new scoped criterion reader and not acceptance of registry adoption.
vi.mock("@/lib/supabase/admin", () => ({createAdminClient: state.database}));
vi.mock("@/features/report-center/report-run-page", () => ({ReportRunPage: () => null}));
vi.mock("next/navigation", () => ({redirect: (path: string) => {throw Error(`REDIRECT:${path}`);}, notFound: () => {throw Error("NOT_FOUND");}}));
import Page from "@/app/(protected)/admin/reports/run/[reportCode]/page";
const auth = {profile: {id: 1, auth_user_id: "synthetic"}, isAccountActive: true, accountStatus: "active", roleCodes: [], permissionCodes: ["reports.run"], roleAssignments: []} as unknown as AuthContext;
beforeEach(() => {
  state.auth.mockReset().mockResolvedValue(auth); state.query = []; state.registry = {report_code: "SYNTHETIC", required_permissions: ["reports.run"]};
  const query: Record<string, unknown> = {maybeSingle: async () => ({data: state.registry, error: null})};
  for (const method of ["select", "eq", "is"]) query[method] = (...args: unknown[]) => {state.query.push([method, ...args]); return query;};
  state.database.mockReset().mockReturnValue({from: () => query});
});
it("the SSR call passes the existing live context unchanged and keeps existing route/initial-filter semantics", async () => {
  const result = await Page({params: Promise.resolve({reportCode: "synthetic"}), searchParams: Promise.resolve({employee_id: "701", search: "", unrelated: "kept-as-before"})});
  const child = result.props.children as React.ReactElement<Record<string, unknown>>;
  expect(state.auth).toHaveBeenCalledTimes(1); expect(child.props.authContext).toBe(auth); expect(child.props.initialFilters).toEqual({employee_id: "701", unrelated: "kept-as-before"});
  expect(state.query).toContainEqual(["eq", "report_code", "SYNTHETIC"]);
});
it("the unchanged route-level permission rejection still precedes registry access", async () => {
  state.auth.mockResolvedValue({...auth, permissionCodes: []}); await expect(Page({params: Promise.resolve({reportCode: "synthetic"}), searchParams: Promise.resolve({})})).rejects.toThrow("REDIRECT:/admin/reports");
  expect(state.database).not.toHaveBeenCalled();
});
it("the unchanged registry required-permission decision is preserved", async () => {
  state.registry.required_permissions = ["unheld.synthetic.permission"];
  await expect(Page({params: Promise.resolve({reportCode: "synthetic"}), searchParams: Promise.resolve({})})).rejects.toThrow("REDIRECT:/admin/reports");
});
