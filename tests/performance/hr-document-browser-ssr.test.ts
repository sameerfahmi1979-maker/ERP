import {afterEach, expect, it, vi} from "vitest";
const state = vi.hoisted(() => ({auth: vi.fn(), read: vi.fn()}));
vi.mock("@/lib/rbac/check", async () => ({...await import("@/lib/rbac/scope"), getAuthContext: state.auth}));
vi.mock("@/server/reads/hr-document-browser", () => ({readHrDocumentBrowser: state.read}));
vi.mock("next/navigation", () => ({redirect: (path: string) => {throw Error(`REDIRECT:${path}`);}}));
vi.mock("@/features/hr/document-browser/hr-doc-browser-page-client", () => ({HrDocBrowserPageClient: () => null}));
vi.mock("@/components/erp/page-header", () => ({ERPPageHeader: () => null}));
vi.mock("@/components/erp/load-error", () => ({LoadError: () => null}));
import Page from "@/app/(protected)/admin/hr/document-browser/page";
import {hrDocumentBrowserIdentity, hrBrowserEmployeesCriteria} from "@/lib/reads/hr-document-browser-schema";
import type {AuthContext} from "@/lib/rbac/check";
const ctx = {profile: {id: 1, auth_user_id: "synthetic"}, isAccountActive: true, accountStatus: "active", permissionCodes: ["hr.employees.view", "dms.documents.view"], roleCodes: [], roleAssignments: []} as unknown as AuthContext;
afterEach(() => {vi.clearAllMocks();});
it("SSR passes the existing request context directly to the first native page and seeds only its exact identity", async () => {
  const data = {criteria: hrBrowserEmployeesCriteria.parse({operation: "employees"}), asOf: new Date().toISOString(), totalCount: 0, rows: []}; state.auth.mockResolvedValue(ctx); state.read.mockResolvedValue({success: true, data});
  const page = await Page(); expect(state.auth).toHaveBeenCalledTimes(1); expect(state.read).toHaveBeenCalledExactlyOnceWith({operation: "employees"}, ctx);
  expect(page.props.children[1].props.authContext).toBe(ctx); expect(page.props.children[1].props.initialRead).toEqual({identity: hrDocumentBrowserIdentity(ctx), data});
});
it.each([{success: false}, {success: true, data: {rows: []}}, {success: true, data: null}])("failed/malformed SSR does not emit a successful empty tree: %j", async result => {
  state.auth.mockResolvedValue(ctx); state.read.mockResolvedValue(result); const page = await Page(); expect(page.props.retryHref).toBe("/admin/hr/document-browser"); expect(page.props.initialRead).toBeUndefined();
});
it.each([{codes: ["hr.employees.view"]}, {codes: ["dms.documents.view"]}, {codes: []}])("SSR requires both native module capabilities before any reader: %j", async ({codes}) => {
  state.auth.mockResolvedValue({...ctx, permissionCodes: codes}); await expect(Page()).rejects.toThrow("REDIRECT:/access-denied"); expect(state.read).not.toHaveBeenCalled();
});
