// @vitest-environment jsdom
// Actual parent, saved-filter read hook and QueryClient. Menu/output shells and
// external actions are controlled; no business report, file or email is issued.
import "../remediation/f05/setup";
import React from "react";
import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
import type {ReportRegistryEntry} from "@/lib/report-center/types";
import {reportSavedFiltersListSchema} from "@/lib/reads/report-saved-filters-schema";
const m = vi.hoisted(() => ({read: vi.fn(), legacy: vi.fn(), create: vi.fn(), remove: vi.fn(), default: vi.fn(), run: vi.fn(),
  template: null as null | {authContext: AuthContext; readGeneration?: string}, actions: new Map<string, () => unknown>(), toast: vi.fn()}));
vi.mock("@/lib/reads/client", async () => ({...await vi.importActual("@/lib/reads/client"), readJson: m.read}));
vi.mock("@/server/actions/reports/saved-filters", () => ({listSavedFilters: m.legacy, createSavedFilter: m.create, deleteSavedFilter: m.remove, setDefaultSavedFilter: m.default}));
vi.mock("@/server/actions/reports/runner", () => ({runReportAction: m.run}));
vi.mock("@/server/actions/reports/templates", () => ({resolveTemplatePreview: vi.fn()}));
vi.mock("@/lib/export/excel", () => ({exportToExcel: vi.fn()}));
vi.mock("@/lib/export/pdf", () => ({exportToPDF: vi.fn()}));
vi.mock("@/lib/export/print", () => ({exportToPrint: vi.fn()}));
vi.mock("@/components/report-center/report-template-select-dialog", () => ({ReportTemplateSelectDialog: (p: NonNullable<typeof m.template>) => {m.template = p; return null;}}));
vi.mock("@/components/report-center/report-preview-header", () => ({ReportPreviewHeader: () => null}));
vi.mock("@/features/report-center/report-export-toolbar", () => ({ReportExportToolbar: () => null}));
vi.mock("@/features/report-center/report-results-table", () => ({ReportResultsTable: () => null}));
vi.mock("next/navigation", () => ({useRouter: () => ({back: vi.fn()}), usePathname: () => "/admin/reports/run/SYNTHETIC_SAVED"}));
vi.mock("sonner", () => ({toast: {success: m.toast, error: m.toast}}));
vi.mock("@/components/ui/dropdown-menu", () => {
  const Box = ({children}: {children?: React.ReactNode}) => <div>{children}</div>;
  return {DropdownMenu: Box, DropdownMenuContent: Box, DropdownMenuGroup: Box, DropdownMenuLabel: Box, DropdownMenuSeparator: () => <hr />,
    DropdownMenuTrigger: ({children}: {children?: React.ReactNode}) => <button>{children}</button>,
    DropdownMenuItem: ({children, onClick}: {children?: React.ReactNode; onClick?: () => unknown}) => {
      const label = (React.Children.toArray(children)[0] as React.ReactElement<{children: React.ReactNode[]}>)?.props?.children?.[0];
      if (typeof label === "string" && onClick) m.actions.set(label, onClick);
      return <div role="menuitem" onClick={onClick}>{children}</div>;
    }};
});
import {ReportRunPage} from "@/features/report-center/report-run-page";
import {ReadError} from "@/lib/reads/client";
const auth = {profile: {id: 31, auth_user_id: "synthetic-a", must_change_password: false}, isAccountActive: true, accountStatus: "active",
  roleCodes: [], permissionCodes: ["reports.run", "reports.view"], globalPermissionCodes: ["reports.run", "reports.view"], roleAssignments: []} as unknown as AuthContext;
const registry = {id: 1, report_code: "SYNTHETIC_SAVED", report_name_en: "Synthetic saved filter", required_permissions: [],
  default_output_formats: ["screen"], filter_schema_json: {filters: ["date_from"]}} as unknown as ReportRegistryEntry;
const stamp = "2026-10-05T00:00:00Z";
const row = (id = 1) => ({id, report_id: 1, user_profile_id: 31, filter_name: `Synthetic filter ${id}`, is_default: false, is_shared: false, created_at: stamp, updated_at: stamp});
function response(input: Record<string, unknown>, ids = [1], count = ids.length) {
  if (input.mode === "detail") return {success: true, data: {criteria: input, record: {...row(Number(input.id)), filters_json: {date_from: "2026-10-02"}}}};
  return {success: true, data: {criteria: reportSavedFiltersListSchema.parse(input), rows: ids.map(id => row(id)), totalCount: count}};
}
function deferred<T>() {let resolve!: (value: T) => void; const promise = new Promise<T>(done => {resolve = done;}); return {promise, resolve};}
const clients: QueryClient[] = [];
function mount() {
  const q = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(q);
  const ui = (ctx: AuthContext) => <QueryClientProvider client={q}><ReportRunPage authContext={ctx} registryEntry={registry} initialFilters={{date_from: "2026-10-01"}} /></QueryClientProvider>;
  const view = render(ui(auth)); return {...view, q, replace: (ctx: AuthContext) => view.rerender(ui(ctx))};
}
const dateInput = () => screen.getByLabelText("Date From") as HTMLInputElement;
const lists = () => m.read.mock.calls.filter(([resource, p]) => resource === "report-saved-filters" && p.mode === "list");
beforeEach(() => {
  m.read.mockImplementation(async (_r, p) => response(p)); m.legacy.mockResolvedValue({success: true, data: []});
  for (const fn of [m.create, m.remove, m.default]) fn.mockResolvedValue({success: true, data: row(1)});
  m.run.mockResolvedValue({success: false, error: "SYNTHETIC CONTROL"}); m.actions.clear(); m.template = null;
});
afterEach(() => {cleanup(); clients.splice(0).forEach(q => q.clear()); [m.read, m.legacy, m.create, m.remove, m.default, m.run, m.toast].forEach(fn => fn.mockReset());});

it("uses the counted read, reaches page two and loads only the selected filter payload", async () => {
  m.read.mockImplementation(async (_r, p) => response(p, p.page === 2 ? [26, 27, 28, 29, 30] : Array.from({length: 25}, (_, i) => i + 1), 30));
  mount(); await screen.findByText("Synthetic filter 1"); expect(m.legacy).not.toHaveBeenCalled();
  expect(m.read.mock.calls.some(([, p]) => p.mode === "detail")).toBe(false);
  fireEvent.click(screen.getByRole("button", {name: "Next saved filters"})); await screen.findByText("Synthetic filter 30");
  fireEvent.click(screen.getByText("Synthetic filter 30")); await waitFor(() => expect(dateInput().value).toBe("2026-10-02"));
  expect(m.read.mock.calls.filter(([, p]) => p.mode === "detail").map(([, p]) => p.id)).toEqual([30]);
  expect(m.run).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
});
it("passes actual authorization and read generation into the template dialog", async () => {
  const view = mount(); await screen.findByText("Synthetic filter 1"); expect(m.template?.authContext).toBe(auth);
  const before = m.template?.readGeneration; view.replace({...auth, profile: {...auth.profile!, id: 32, auth_user_id: "synthetic-b"}});
  expect(m.template?.authContext.profile?.id).toBe(32); expect(m.template?.readGeneration).not.toBe(before);
});
it("a failed list is not an empty list and retry preserves the current draft", async () => {
  m.read.mockRejectedValue(new ReadError("Synthetic failure", 503)); mount();
  await screen.findByText("Saved filters could not be loaded."); expect(screen.queryByText("No saved filters match this search.")).toBeNull();
  expect(dateInput().value).toBe("2026-10-01"); m.read.mockImplementation(async (_r, p) => response(p));
  fireEvent.click(screen.getByRole("button", {name: "Retry saved filters"})); await screen.findByText("Synthetic filter 1");
});
it("search is debounced, requests counted matches, and resets to the first page", async () => {
  mount(); await screen.findByText("Synthetic filter 1"); const search = screen.getByLabelText("Search saved filters");
  fireEvent.change(search, {target: {value: "target 101"}}); await waitFor(() => expect(lists().some(([, p]) => p.search === "target 101" && p.page === 1)).toBe(true));
  expect(m.legacy).not.toHaveBeenCalled();
});
it.each(["edit", "reset", "newer selection", "owner ABA", "unmount"])("a late detail cannot overwrite after %s", async change => {
  const old = deferred<ReturnType<typeof response>>(); let pending: Record<string, unknown> | null = null;
  m.read.mockImplementation(async (_r, p) => {if (p.mode === "detail" && p.id === 1) {pending = p; return old.promise;} return response(p, [1, 2]);});
  const view = mount(); await screen.findByText("Synthetic filter 1"); fireEvent.click(screen.getByText("Synthetic filter 1"));
  await waitFor(() => expect(pending).not.toBeNull());
  if (change === "edit") fireEvent.change(dateInput(), {target: {value: "2026-10-03"}});
  if (change === "reset") fireEvent.click(screen.getByRole("button", {name: "Reset"}));
  if (change === "newer selection") {fireEvent.click(screen.getByText("Synthetic filter 2")); await waitFor(() => expect(dateInput().value).toBe("2026-10-02"));}
  if (change === "owner ABA") {view.replace({...auth, profile: {...auth.profile!, id: 32, auth_user_id: "synthetic-b"}}); view.replace(auth);}
  if (change === "unmount") view.unmount();
  const oldReply = response(pending!); if (oldReply.data.record) oldReply.data.record.filters_json = {date_from: "2026-09-01"};
  await act(async () => {old.resolve(oldReply);});
  if (change !== "unmount") expect(dateInput().value).not.toBe("2026-09-01");
  expect(m.toast.mock.calls.some(([text]) => text === "Loaded filter: Synthetic filter 1")).toBe(false);
});
it.each([401, 403])("warm list denial %s removes metadata and disables a retained selection", async status => {
  const view = mount(); await screen.findByText("Synthetic filter 1"); const old = m.actions.get("Synthetic filter 1")!;
  m.read.mockRejectedValue(new ReadError("Denied", status)); await act(async () => {await view.q.invalidateQueries({queryKey: ["report-saved-filters"]});});
  await waitFor(() => expect(screen.queryByText("Synthetic filter 1")).toBeNull()); const count = m.read.mock.calls.length;
  await act(async () => {await old();}); expect(m.read.mock.calls.length).toBe(count); expect(m.run).not.toHaveBeenCalled();
});
it.each(["delete", "default"])("successful %s refreshes the read but a failed mutation does not", async action => {
  mount(); await screen.findByText("Synthetic filter 1"); const fn = action === "delete" ? m.remove : m.default;
  fn.mockResolvedValueOnce({success: false, error: "SYNTHETIC FAILURE"});
  fireEvent.click(screen.getByTitle(action === "delete" ? "Delete" : "Set as default")); await waitFor(() => expect(fn).toHaveBeenCalledTimes(1)); expect(lists()).toHaveLength(1);
  fireEvent.click(screen.getByTitle(action === "delete" ? "Delete" : "Set as default")); await waitFor(() => expect(lists()).toHaveLength(2)); expect(fn).toHaveBeenCalledTimes(2);
});
it("a confirmed mutation refreshes the current search even if it changed while saving", async () => {
  const pending = deferred<{success: boolean}>(); m.remove.mockReturnValue(pending.promise);
  mount(); await screen.findByText("Synthetic filter 1"); fireEvent.click(screen.getByTitle("Delete"));
  fireEvent.change(screen.getByLabelText("Search saved filters"), {target: {value: "new search"}});
  await waitFor(() => expect(lists().some(([, p]) => p.search === "new search")).toBe(true)); await screen.findByText("Synthetic filter 1");
  const before = lists().length; await act(async () => {pending.resolve({success: true});});
  await waitFor(() => expect(lists().length).toBe(before + 1)); expect(lists().at(-1)?.[1].search).toBe("new search");
});
it("a confirmed deletion retires warm results even while the current search is invalid", async () => {
  const pending = deferred<{success: boolean}>(); m.remove.mockReturnValue(pending.promise);
  mount(); await screen.findByText("Synthetic filter 1"); fireEvent.click(screen.getByTitle("Delete"));
  fireEvent.change(screen.getByLabelText("Search saved filters"), {target: {value: "x".repeat(201)}});
  m.read.mockImplementation(async (_r, p) => response(p, [2]));
  await act(async () => {pending.resolve({success: true});});
  expect(lists()).toHaveLength(1); // Invalid input must not be sent to the server.
  fireEvent.change(screen.getByLabelText("Search saved filters"), {target: {value: ""}});
  await screen.findByText("Synthetic filter 2"); expect(screen.queryByText("Synthetic filter 1")).toBeNull();
  expect(lists()).toHaveLength(2);
});
it("saving a filter keeps the existing payload and refreshes only on confirmed success", async () => {
  mount(); await screen.findByText("Synthetic filter 1"); fireEvent.click(screen.getByTitle("Save current filters"));
  fireEvent.change(screen.getByPlaceholderText("Filter name..."), {target: {value: "Synthetic new"}});
  m.create.mockResolvedValueOnce({success: false, error: "SYNTHETIC FAILURE"}); fireEvent.click(screen.getAllByRole("button", {name: "Save"}).at(-1)!);
  await waitFor(() => expect(m.create).toHaveBeenCalledTimes(1)); expect(lists()).toHaveLength(1);
  expect((screen.getByPlaceholderText("Filter name...") as HTMLInputElement).value).toBe("Synthetic new");
  fireEvent.click(screen.getAllByRole("button", {name: "Save"}).at(-1)!); await waitFor(() => expect(lists()).toHaveLength(2));
  expect(m.create).toHaveBeenLastCalledWith({reportCode: "SYNTHETIC_SAVED", filterName: "Synthetic new", filtersJson: {date_from: "2026-10-01"}, isDefault: false, isShared: false});
  expect(screen.queryByPlaceholderText("Filter name...")).toBeNull(); expect(m.run).not.toHaveBeenCalled();
});
it("unavailable selected contents preserve the draft and report no fake success", async () => {
  m.read.mockImplementation(async (_r, p) => p.mode === "detail" ? {success: true, data: {criteria: p, record: null}} : response(p));
  mount(); await screen.findByText("Synthetic filter 1"); fireEvent.click(screen.getByText("Synthetic filter 1"));
  await waitFor(() => expect(m.toast).toHaveBeenCalledWith("This saved filter is no longer available.")); expect(dateInput().value).toBe("2026-10-01");
});
