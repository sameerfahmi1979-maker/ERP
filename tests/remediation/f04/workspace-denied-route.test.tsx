// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useLayoutEffect } from "react";
import { WorkspaceDraftProvider } from "@/components/workspace/workspace-draft-provider";
import { canAccessRoute } from "@/lib/rbac/route-access-registry";
import { createTabFromRoute } from "@/lib/workspace/workspace-route-registry";
import { MAX_TABS, persistToStorage } from "@/lib/workspace/workspace-store";

const nav = vi.hoisted(() => ({
  pathname: "/notifications",
  query: "",
  router: { push: vi.fn(), replace: vi.fn() },
  warning: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.query),
  useRouter: () => nav.router,
}));
vi.mock("sonner", () => ({ toast: { warning: nav.warning } }));
vi.mock("@/components/erp/unsaved-changes-dialog", () => ({ UnsavedChangesDialog: () => null }));
import { WorkspaceProvider, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { WorkspaceContent } from "@/components/workspace/workspace-content";

let context: NonNullable<ReturnType<typeof useWorkspaceContext>>;
const rendered = vi.fn();
const noRole = (route: string) => canAccessRoute(route.split("?")[0], [], false);
const allAllowed = () => true;
function Observe() {
  const current = useWorkspaceContext()!;
  useLayoutEffect(() => { context = current; }, [current]);
  return null;
}
function PageProbe() {
  rendered(nav.pathname);
  return <div data-testid="route-body">{nav.pathname}</div>;
}
function Tree({ canRestoreRoute = noRole, home = "/notifications" }: {
  canRestoreRoute?: (route: string) => boolean; home?: string;
}) {
  return <WorkspaceDraftProvider><WorkspaceProvider principalId="denied-route-actor" defaultRoute={home} canRestoreRoute={canRestoreRoute}>
    <Observe /><WorkspaceContent><PageProbe /></WorkspaceContent>
  </WorkspaceProvider></WorkspaceDraftProvider>;
}
function seedHome() {
  const home = createTabFromRoute("/notifications");
  persistToStorage([home], home.id, "denied-route-actor");
}
beforeEach(() => {
  vi.stubGlobal("localStorage", window.localStorage);
  localStorage.clear(); vi.clearAllMocks(); nav.pathname = "/notifications"; nav.query = "";
});
afterEach(cleanup);

it.each(["/admin/hr/employees", "/dashboard"])("known denied direct route converges to Notifications without mounting its children: %s", async denied => {
  seedHome(); nav.pathname = denied;
  const view = render(<Tree />);
  await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith("/notifications"));
  expect(nav.router.replace).toHaveBeenCalledTimes(1);
  expect(rendered).not.toHaveBeenCalled();
  expect(context.state.tabs.map(tab => tab.route)).toEqual(["/notifications"]);
  expect(localStorage.getItem("algt_erp_workspace_manifest:v5:denied-route-actor")).not.toContain(denied);
  // Model completion of the requested Next navigation, not server/auth behavior.
  nav.pathname = "/notifications"; view.rerender(<Tree />);
  await waitFor(() => expect(screen.getByTestId("route-body").textContent).toBe("/notifications"));
  expect(screen.queryByText("Preparing workspace…")).toBeNull();
  expect(rendered.mock.calls.every(([path]) => path === "/notifications")).toBe(true);
});

it("fresh denied entry with no manifest also retains only permitted Home", async () => {
  nav.pathname = "/admin/hr/employees";
  render(<Tree />);
  await waitFor(() => expect(nav.router.replace).toHaveBeenLastCalledWith("/notifications"));
  expect(context.state.tabs.map(tab => tab.route)).toEqual(["/notifications"]);
  expect(rendered).not.toHaveBeenCalled();
});

it("denied SPA navigation preserves unrelated allowed dirty tabs and storage", async () => {
  const permitted = (route: string) => route.split("?")[0] !== "/admin/hr/employees";
  const view = render(<Tree canRestoreRoute={permitted} />);
  const retainedRoute = "/admin/common-master-data/departments/record/983101?mode=edit";
  act(() => context.openTab({ route: retainedRoute }));
  const retainedId = context.state.activeTabId!;
  act(() => context.dispatch({ type: "MARK_DIRTY", tabId: retainedId, dirty: true }));
  localStorage.setItem("unrelated-owner-data", "retain");
  rendered.mockClear(); nav.pathname = "/admin/hr/employees";
  view.rerender(<Tree canRestoreRoute={permitted} />);
  await waitFor(() => expect(nav.router.replace).toHaveBeenLastCalledWith("/notifications"));
  expect(rendered).not.toHaveBeenCalled();
  expect(context.state.tabs.find(tab => tab.id === retainedId)).toMatchObject({ route: retainedRoute, dirty: true });
  expect(localStorage.getItem("unrelated-owner-data")).toBe("retain");
  nav.pathname = "/notifications"; view.rerender(<Tree canRestoreRoute={permitted} />);
  await waitFor(() => expect(screen.getByTestId("route-body").textContent).toBe("/notifications"));
  expect(context.state.tabs.find(tab => tab.id === retainedId)?.dirty).toBe(true);
});

it("allowed list routes still acquire an owner and render with no replacement", async () => {
  nav.pathname = "/admin/hr/employees";
  const permitted = (route: string) => canAccessRoute(route.split("?")[0], ["hr.employees.view"], false);
  render(<Tree canRestoreRoute={permitted} />);
  await waitFor(() => expect(screen.getByTestId("route-body").textContent).toBe(nav.pathname));
  expect(context.state.tabs.filter(tab => tab.route === nav.pathname)).toHaveLength(1);
  expect(nav.router.replace).not.toHaveBeenCalled();
});

it("unknown record routes retain server-guard ownership and allow their denied destination", async () => {
  nav.pathname = "/admin/hr/employees/record/983102";
  const view = render(<Tree />);
  await waitFor(() => expect(screen.getByTestId("route-body").textContent).toBe(nav.pathname));
  expect(nav.router.replace).not.toHaveBeenCalled();
  // The real record guard redirects; this only proves the shell does not suppress it.
  nav.pathname = "/access-denied"; view.rerender(<Tree />);
  await waitFor(() => expect(screen.getByTestId("route-body").textContent).toBe("/access-denied"));
  expect(screen.queryByText("Preparing workspace…")).toBeNull();
});

it("the DMS record denial's dashboard hop converges to permitted Notifications", async () => {
  nav.pathname = "/dms/documents/record/983101";
  const view = render(<Tree />);
  await waitFor(() => expect(screen.getByTestId("route-body").textContent).toBe(nav.pathname));
  // Model the existing DMS server guard's destination; do not mock its authority.
  rendered.mockClear(); nav.pathname = "/dashboard"; view.rerender(<Tree />);
  await waitFor(() => expect(nav.router.replace).toHaveBeenLastCalledWith("/notifications"));
  expect(rendered).not.toHaveBeenCalled();
  expect(context.state.tabs.some(tab => tab.route === "/dashboard")).toBe(false);
  nav.pathname = "/notifications"; view.rerender(<Tree />);
  await waitFor(() => expect(screen.getByTestId("route-body").textContent).toBe("/notifications"));
  expect(screen.queryByText("Preparing workspace…")).toBeNull();
});

it("same-URL permission loss redirects and permission restoration can readmit before navigation settles", async () => {
  nav.pathname = "/admin/hr/employees";
  const view = render(<Tree canRestoreRoute={allAllowed} />);
  await waitFor(() => expect(screen.getByTestId("route-body")).toBeTruthy());
  rendered.mockClear(); view.rerender(<Tree />);
  await waitFor(() => expect(nav.router.replace).toHaveBeenLastCalledWith("/notifications"));
  expect(rendered).not.toHaveBeenCalled();
  expect(context.state.tabs.some(tab => tab.route === nav.pathname)).toBe(false);
  view.rerender(<Tree canRestoreRoute={allAllowed} />);
  await waitFor(() => expect(screen.getByTestId("route-body").textContent).toBe("/admin/hr/employees"));
  expect(context.state.tabs.filter(tab => tab.route === nav.pathname)).toHaveLength(1);
});

it("no permitted configured Home falls back to the existing generic access-denied page", async () => {
  nav.pathname = "/admin/hr/employees";
  const view = render(<Tree home="/dashboard" />);
  await waitFor(() => expect(nav.router.replace).toHaveBeenLastCalledWith("/access-denied"));
  expect(rendered).not.toHaveBeenCalled();
  nav.pathname = "/access-denied"; view.rerender(<Tree home="/dashboard" />);
  await waitFor(() => expect(screen.getByTestId("route-body").textContent).toBe("/access-denied"));
});

it("allowed route admission still enforces the cap and preserves the existing active dirty owner", async () => {
  const view = render(<Tree canRestoreRoute={allAllowed} />);
  act(() => {
    for (let i = 1; i <= MAX_TABS; i++) context.openTab({ route: `/admin/hr/employees/record/${983100 + i}` });
  });
  const active = context.state.tabs.find(tab => tab.id === context.state.activeTabId)!;
  act(() => context.dispatch({ type: "MARK_DIRTY", tabId: active.id, dirty: true }));
  nav.pathname = "/admin/common-master-data/departments/record/new";
  view.rerender(<Tree canRestoreRoute={allAllowed} />);
  await waitFor(() => expect(nav.router.replace).toHaveBeenLastCalledWith(active.route));
  expect(context.state.tabs.filter(tab => tab.closable)).toHaveLength(MAX_TABS);
  expect(context.state.tabs.find(tab => tab.id === active.id)?.dirty).toBe(true);
  expect(context.state.tabs.some(tab => tab.route === nav.pathname)).toBe(false);
  expect(nav.warning).toHaveBeenCalled();
});
