// @vitest-environment jsdom
// Real ReportRunPage, criteria hook and QueryClient. External actions/exports and
// output visual shells are controlled doubles; no report, email or file is issued.
import "../remediation/f05/setup";
import React from "react";
import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
import type {ReportDataResult, ReportRegistryEntry} from "@/lib/report-center/types";
import type {listSavedFilters} from "@/server/actions/reports/saved-filters";
import {syntheticAuthContext} from "./fixtures/auth-context";
const m = vi.hoisted(() => ({run: vi.fn(), saved: vi.fn(), branding: vi.fn(), excel: vi.fn(), read: vi.fn(),
  export: null as null | ((format: "excel") => Promise<void>), canUseData: null as null | (() => boolean)}));
vi.mock("@/lib/reads/client", async () => ({...await vi.importActual("@/lib/reads/client"),
  // Keep this output suite's controlled saved-filter source, now behind the
  // counted transport. The real saved-filter parent suite verifies its contract.
  readJson: (resource: string, input: unknown, signal: AbortSignal) => resource === "report-saved-filters"
    ? m.saved(input, signal).then((r: Awaited<ReturnType<typeof listSavedFilters>>) => ({...r, data: {criteria: input, rows: r.data ?? [], totalCount: (r.data ?? []).length}}))
    : m.read(resource, input, signal)}));
vi.mock("@/server/actions/reports/runner", () => ({runReportAction: m.run}));
vi.mock("@/server/actions/reports/saved-filters", () => ({listSavedFilters: m.saved, createSavedFilter: vi.fn(), deleteSavedFilter: vi.fn(), setDefaultSavedFilter: vi.fn()}));
vi.mock("@/server/actions/reports/templates", () => ({resolveTemplatePreview: m.branding}));
vi.mock("@/lib/export/excel", () => ({exportToExcel: m.excel}));
vi.mock("@/lib/export/pdf", () => ({exportToPDF: vi.fn()}));
vi.mock("@/lib/export/print", () => ({exportToPrint: vi.fn()}));
vi.mock("@/components/report-center/report-template-select-dialog", () => ({ReportTemplateSelectDialog: () => null}));
vi.mock("@/components/report-center/report-preview-header", () => ({ReportPreviewHeader: ({branding}: {branding: unknown}) => <div data-testid="branding">{JSON.stringify(branding)}</div>}));
vi.mock("@/features/report-center/report-results-table", () => ({ReportResultsTable: ({data}: {data: ReportDataResult}) => <div data-testid="results">{JSON.stringify(data)}</div>}));
vi.mock("@/features/report-center/report-export-toolbar", () => ({ReportExportToolbar: ({onExport, canUseData}: {onExport: (format: "excel") => Promise<void>; canUseData: () => boolean}) => {m.export = onExport; m.canUseData = canUseData; return <button onClick={() => void onExport("excel")}>Export synthetic result</button>;}}));
vi.mock("next/navigation", () => ({useRouter: () => ({back: vi.fn()}), usePathname: () => "/admin/reports/run/SYNTHETIC_OUTPUT"}));
import {ReportRunPage} from "@/features/report-center/report-run-page";
import {ReadError} from "@/lib/reads/client";
const auth = syntheticAuthContext(["reports.run", "reports.view"], {id: 31, auth_user_id: "synthetic-a"});
const registry = {id: 1, report_code: "SYNTHETIC_OUTPUT", report_name_en: "Synthetic output", report_category: "synthetic", sensitive_profile: "normal", required_permissions: [],
  default_output_formats: ["screen", "excel"], default_orientation: "portrait", filter_schema_json: {filters: ["date_from"]}} as unknown as ReportRegistryEntry;
const result = (label = "PRIVATE_SYNTHETIC_ROW") => ({success: true, data: {success: true, runId: 19, resolvedTemplateId: 5, data: {columns: ["name"], rows: [{name: label}]}}});
function deferred<T>() {let resolve!: (value: T) => void; const promise = new Promise<T>(done => {resolve = done;}); return {promise, resolve};}
const clients: QueryClient[] = [];
function mount(entry = registry, initialAuth = auth) {
  const q = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(q);
  const ui = (context: AuthContext) => <QueryClientProvider client={q}><ReportRunPage authContext={context} registryEntry={entry} initialFilters={{date_from: "2026-10-01"}} /></QueryClientProvider>;
  const view = render(ui(initialAuth)); return {...view, q, replace: (context: AuthContext) => view.rerender(ui(context))};
}
async function run() {fireEvent.click(screen.getByRole("button", {name: "Run Report"})); await waitFor(() => expect(m.run).toHaveBeenCalledTimes(1));}
beforeEach(() => {m.run.mockResolvedValue(result()); m.saved.mockResolvedValue({success: true, data: []}); m.branding.mockResolvedValue({success: true, data: {name: "PRIVATE_SYNTHETIC_BRAND"}}); m.excel.mockResolvedValue(undefined); m.export = null; m.canUseData = null;
  m.read.mockImplementation(async (_resource, input) => ({success: true, data: {criteria: input, rows: [], totalCount: 0, selected: null}}));
});
afterEach(() => {cleanup(); clients.splice(0).forEach(q => q.clear()); [m.run, m.saved, m.branding, m.excel, m.read].forEach(mock => mock.mockReset());});

it("a current authorized result and branding still render and export unchanged", async () => {
  mount(); await run(); await screen.findByTestId("branding"); expect(screen.getByTestId("results").textContent).toContain("PRIVATE_SYNTHETIC_ROW");
  fireEvent.click(screen.getByRole("button", {name: "Export synthetic result"})); await waitFor(() => expect(m.excel).toHaveBeenCalledTimes(1));
  expect(m.excel.mock.calls[0][0].data).toEqual([{name: "PRIVATE_SYNTHETIC_ROW"}]);
});
const replacements = {
  account: {...auth, profile: {...auth.profile!, id: 32, auth_user_id: "synthetic-b"}},
  revoked: {...auth, permissionCodes: [], globalPermissionCodes: []},
  suspended: {...auth, accountStatus: "suspended", isAccountActive: false},
  scope: {...auth, roleAssignments: [{roleId: 8, roleCode: "synthetic", ownerCompanyId: 2, branchId: 4, permissionCodes: ["reports.run", "reports.view"]}]},
} satisfies Record<string, AuthContext>;
it.each(Object.entries(replacements))("%s change immediately retires output/branding and retained exports", async (_name, next) => {
  const view = mount(); await run(); await screen.findByTestId("branding"); const oldExport = m.export!, oldGuard = m.canUseData!;
  view.replace(next); expect(screen.queryByTestId("results")).toBeNull(); expect(screen.queryByTestId("branding")).toBeNull();
  expect(oldGuard()).toBe(false); await act(async () => {await oldExport("excel");}); expect(m.excel).not.toHaveBeenCalled();
});

it.each([401, 403])("warm result is retired after verified criteria %s without a changed auth prop", async status => {
  const context = {...auth, permissionCodes: [...auth.permissionCodes, "hr.employees.view"], globalPermissionCodes: [...auth.globalPermissionCodes, "hr.employees.view"]};
  const view = mount({...registry, filter_schema_json: {filters: ["employee_id", "date_from"]}}, context);
  await waitFor(() => expect(m.read).toHaveBeenCalledTimes(1)); await run(); await screen.findByTestId("results"); const old = m.export!, oldGuard = m.canUseData!;
  m.read.mockRejectedValue(new ReadError("Denied", status)); await act(async () => {await view.q.invalidateQueries({queryKey: ["reports", "criteria"]});});
  await waitFor(() => expect(screen.queryByTestId("results")).toBeNull()); expect(oldGuard()).toBe(false);
  await act(async () => {await old("excel");}); expect(m.excel).not.toHaveBeenCalled(); expect(screen.queryByTestId("branding")).toBeNull();
});
it("an ordinary lookup failure preserves date filters and does not masquerade as owner revocation", async () => {
  const context = {...auth, permissionCodes: [...auth.permissionCodes, "hr.employees.view"], globalPermissionCodes: [...auth.globalPermissionCodes, "hr.employees.view"]};
  const view = mount({...registry, filter_schema_json: {filters: ["employee_id", "date_from"]}}, context);
  await waitFor(() => expect(m.read).toHaveBeenCalledTimes(1)); await run(); await screen.findByTestId("results");
  m.read.mockRejectedValue(new ReadError("Unavailable", 503)); await act(async () => {await view.q.invalidateQueries({queryKey: ["reports", "criteria"]});});
  await screen.findByText(/Choices could not be loaded/); expect(screen.getByTestId("results").textContent).toContain("PRIVATE_SYNTHETIC_ROW");
  expect((screen.getByLabelText("Date From") as HTMLInputElement).value).toBe("2026-10-01"); expect(m.canUseData!()).toBe(true);
});
it("reset prevents a retained export or delayed branding from reusing the previous output", async () => {
  const pending = deferred<unknown>(); m.branding.mockReturnValue(pending.promise);
  mount(); await run(); await screen.findByTestId("results"); const old = m.export!, oldGuard = m.canUseData!;
  fireEvent.click(screen.getByRole("button", {name: "Reset"})); expect(oldGuard()).toBe(false);
  await act(async () => {await old("excel");}); expect(m.excel).not.toHaveBeenCalled();
  await act(async () => {pending.resolve({success: true, data: {name: "RETIRED_AFTER_RESET"}});});
  expect(screen.queryByTestId("results")).toBeNull(); expect(screen.queryByTestId("branding")).toBeNull();
});
it("starting a replacement report invalidates former-result exports without changing account", async () => {
  mount(); await run(); await screen.findByTestId("results"); const old = m.export!, oldGuard = m.canUseData!;
  const pending = deferred<ReturnType<typeof result>>(); m.run.mockReturnValue(pending.promise);
  fireEvent.click(screen.getByRole("button", {name: "Run Report"})); expect(oldGuard()).toBe(false);
  await act(async () => {await old("excel");}); expect(m.excel).not.toHaveBeenCalled();
  await act(async () => {pending.resolve(result("CURRENT_REPLACEMENT"));}); await screen.findByTestId("results");
  expect(m.canUseData!()).toBe(true); expect(oldGuard()).toBe(false);
});
it("unmount denies captured exports and a late branding response", async () => {
  const pending = deferred<unknown>(); m.branding.mockReturnValue(pending.promise); const view = mount(); await run(); await screen.findByTestId("results");
  const old = m.export!, oldGuard = m.canUseData!; view.unmount(); expect(oldGuard()).toBe(false);
  await act(async () => {await old("excel"); pending.resolve({success: true, data: {name: "RETIRED_UNMOUNT"}});}); expect(m.excel).not.toHaveBeenCalled();
});
it.each(["returned", "rejected"])("branding %s failure is visible without claiming a branded result", async failure => {
  if (failure === "returned") m.branding.mockResolvedValue({success: false, error: "Synthetic failure"});
  else m.branding.mockRejectedValue(new Error("Synthetic failure"));
  mount(); await run(); await screen.findByText("Report branding is unavailable. Try running the report again.");
  expect(screen.queryByTestId("branding")).toBeNull(); expect(screen.getByTestId("results").textContent).toContain("PRIVATE_SYNTHETIC_ROW");
});
it("an old run cannot reinstall output after another account signs in", async () => {
  const pending = deferred<ReturnType<typeof result>>(); m.run.mockReturnValue(pending.promise);
  const view = mount(); await run(); view.replace(replacements.account);
  await act(async () => {pending.resolve(result());}); expect(screen.queryByTestId("results")).toBeNull(); expect(m.branding).not.toHaveBeenCalled();
});
it("returning to the original identity cannot accept its earlier retired response", async () => {
  const pending = deferred<ReturnType<typeof result>>(); m.run.mockReturnValue(pending.promise);
  const view = mount(); await run(); view.replace(replacements.account); view.replace(auth);
  await act(async () => {pending.resolve(result());}); expect(screen.queryByTestId("results")).toBeNull(); expect(m.branding).not.toHaveBeenCalled();
});
it("late branding from a retired run cannot label a new account's output", async () => {
  const old = deferred<unknown>(); m.branding.mockReturnValueOnce(old.promise).mockResolvedValue({success: true, data: {name: "NEW_BRAND"}});
  const view = mount(); await run(); await screen.findByTestId("results"); view.replace(replacements.account);
  m.run.mockResolvedValue(result("NEW_ROW")); fireEvent.click(screen.getByRole("button", {name: "Run Report"})); await waitFor(() => expect(m.run).toHaveBeenCalledTimes(2));
  await screen.findByTestId("branding"); await act(async () => {old.resolve({success: true, data: {name: "RETIRED_BRAND"}});});
  expect(screen.getByTestId("branding").textContent).toContain("NEW_BRAND"); expect(screen.getByTestId("results").textContent).toContain("NEW_ROW");
});
it("saved-filter reads are principal-scoped, cancel late former data and retain no old cache", async () => {
  const old = deferred<unknown>(); m.saved.mockReturnValueOnce(old.promise).mockResolvedValue({success: true, data: []}); const view = mount();
  await waitFor(() => expect(m.saved).toHaveBeenCalledTimes(1)); view.replace(replacements.account); await waitFor(() => expect(m.saved).toHaveBeenCalledTimes(2));
  await act(async () => {old.resolve({success: true, data: [{id: 17, filter_name: "RETIRED_FILTER", filters_json: {date_from: "2000-01-01"}}]});});
  expect(screen.queryByText("RETIRED_FILTER")).toBeNull(); expect(JSON.stringify(view.q.getQueriesData({queryKey: ["report-saved-filters"]}))).not.toContain("RETIRED_FILTER");
});
