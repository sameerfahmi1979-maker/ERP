// @vitest-environment jsdom
import {afterEach, expect, it, vi} from "vitest";
import {cleanup, render} from "@testing-library/react";
import {syntheticAuthContext} from "./fixtures/auth-context";
const m = vi.hoisted(() => ({auth: vi.fn(), child: vi.fn(), redirect: vi.fn((url: string) => {throw Error("REDIRECT:" + url);})}));
vi.mock("@/lib/rbac/check", async original => ({...await original<typeof import("@/lib/rbac/check")>(), getAuthContext: m.auth}));
vi.mock("next/navigation", () => ({redirect: m.redirect}));
vi.mock("@/components/erp/page-header", () => ({ERPPageHeader: () => null}));
vi.mock("@/features/dms/approvals/dms-approvals-queue-page-client", () => ({DmsApprovalsQueuePageClient: (props: unknown) => {m.child(props); return null;}}));
import ApprovalPage from "@/app/(protected)/dms/approvals/page";
import { canAccessRoute } from "@/lib/rbac/route-access-registry";
const auth = syntheticAuthContext(["dms.approvals.view"], {id: 6, auth_user_id: "synthetic"});
afterEach(() => {cleanup(); vi.clearAllMocks();});
it("queue parent passes the exact request principal without introducing another read", async () => {
  m.auth.mockResolvedValue(auth); render(await ApprovalPage()); expect(m.auth).toHaveBeenCalledTimes(1);
  expect(m.child).toHaveBeenCalledWith({authContext: auth, canAct: false, isAdmin: false});
});
it("a no-role principal is rejected before the client is mounted", async () => {
  m.auth.mockResolvedValue({...auth, permissionCodes: [], globalPermissionCodes: []});
  await expect(ApprovalPage()).rejects.toThrow("REDIRECT:/access-denied"); expect(m.child).not.toHaveBeenCalled();
});

it("permits history-only users to see the same Approval Queue in navigation and by direct route", async () => {
  const history = syntheticAuthContext(["dms.approvals.history.view"], {id: 6, auth_user_id: "synthetic"});
  expect(canAccessRoute("/dms/approvals", history.permissionCodes, false)).toBe(true);
  expect(canAccessRoute("/dms/approvals", ["dms.documents.view"], false)).toBe(false);
  m.auth.mockResolvedValue(history);
  render(await ApprovalPage());
  expect(m.child).toHaveBeenCalledWith({authContext: history, canAct: false, isAdmin: false});
});
