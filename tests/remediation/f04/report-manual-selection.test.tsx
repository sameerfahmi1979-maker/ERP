// @vitest-environment jsdom
import "../f05/setup";
// Real current ReportRunPage, report-view lifetime, criteria/saved-filter hooks
// and QueryClient. Server actions/read transport are offline doubles. The
// picker/results presentation shells expose the actual parent's rendered state.
import React from "react";
import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import type {AuthContext} from "@/lib/rbac/check";
import type {ReportDataResult, ReportRegistryEntry} from "@/lib/report-center/types";

const m = vi.hoisted(() => ({
  run: vi.fn(), read: vi.fn(), branding: vi.fn(), write: vi.fn(), output: vi.fn(), network: vi.fn(), picker: vi.fn(),
}));
vi.mock("@/lib/reads/client", async () => ({...await vi.importActual("@/lib/reads/client"), readJson: m.read}));
vi.mock("@/server/actions/reports/runner", () => ({runReportAction: m.run}));
vi.mock("@/server/actions/reports/saved-filters", () => ({listSavedFilters: m.write, createSavedFilter: m.write, deleteSavedFilter: m.write, setDefaultSavedFilter: m.write}));
vi.mock("@/server/actions/reports/templates", () => ({resolveTemplatePreview: m.branding}));
vi.mock("@/lib/export/excel", () => ({exportToExcel: m.output}));
vi.mock("@/lib/export/pdf", () => ({exportToPDF: m.output}));
vi.mock("@/lib/export/print", () => ({exportToPrint: m.output}));
vi.mock("@/components/report-center/report-preview-header", () => ({ReportPreviewHeader: () => null}));
vi.mock("@/features/report-center/report-export-toolbar", () => ({ReportExportToolbar: () => null}));
vi.mock("@/features/report-center/report-results-table", () => ({ReportResultsTable: ({data}: {data: ReportDataResult}) => <div data-testid="results">{JSON.stringify(data)}</div>}));
vi.mock("@/components/report-center/report-template-select-dialog", () => ({
  ReportTemplateSelectDialog: (props: {open: boolean; onSelect: (id: number) => void}) => {
    m.picker(props);
    return props.open ? <div role="dialog" aria-label="Select Report Template"><button onClick={() => props.onSelect(701)}>Use synthetic template</button></div> : null;
  },
}));
vi.mock("next/navigation", () => ({useRouter: () => ({back: vi.fn()}), usePathname: () => "/admin/reports/run/SYNTHETIC_MANUAL"}));

import {ReportRunPage} from "@/features/report-center/report-run-page";
import {ReadError} from "@/lib/reads/client";

const auth = {
  profile: {id: 31, auth_user_id: "synthetic-offline-only", must_change_password: false},
  isAccountActive: true, accountStatus: "active", roleCodes: [], roleAssignments: [],
  permissionCodes: ["reports.view", "reports.run"], globalPermissionCodes: ["reports.view", "reports.run"],
} as unknown as AuthContext;
const registry = {
  id: 1, report_code: "SYNTHETIC_MANUAL", report_name_en: "Synthetic manual selection",
  report_category: "summary", sensitive_profile: "normal", required_permissions: [],
  default_output_formats: ["screen"], default_orientation: "portrait", filter_schema_json: {filters: ["date_from"]},
} as unknown as ReportRegistryEntry;
const manualMessage = "This report spans multiple companies. Please select a template manually.";
const clients: QueryClient[] = [];
let allowBranding = false;
let consoleError: ReturnType<typeof vi.spyOn>;
let consoleWarn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  allowBranding = false;
  m.branding.mockResolvedValue({success: true, data: {name: "SYNTHETIC_SELECTED_BRAND"}});
  m.read.mockImplementation(async (resource, criteria) => {
    if (resource !== "report-saved-filters") throw Error(`Unexpected offline read: ${resource}`);
    return {success: true, data: {criteria, rows: [], totalCount: 0}};
  });
  m.network.mockImplementation(() => {throw Error("Network prohibited in isolated report regression");});
  vi.stubGlobal("fetch", m.network);
  consoleError = vi.spyOn(console, "error");
  consoleWarn = vi.spyOn(console, "warn");
});
afterEach(() => {
  cleanup(); clients.splice(0).forEach(client => client.clear());
  try {
    expect(m.network).not.toHaveBeenCalled(); expect(m.write).not.toHaveBeenCalled();
    expect(m.output).not.toHaveBeenCalled();
    if (!allowBranding) expect(m.branding).not.toHaveBeenCalled();
    else for (const [request] of m.branding.mock.calls) expect(request).toEqual({templateId: 701, reportCode: "SYNTHETIC_MANUAL"});
    expect(consoleError).not.toHaveBeenCalled(); expect(consoleWarn).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks(); vi.unstubAllGlobals(); Object.values(m).forEach(mock => mock.mockReset());
  }
});
function mount() {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(client);
  const ui = (context: AuthContext) => <QueryClientProvider client={client}><ReportRunPage authContext={context} registryEntry={registry} initialFilters={{date_from: "2026-10-01"}} /></QueryClientProvider>;
  const view = render(ui(auth));
  return {...view, client, replace: (context: AuthContext) => view.rerender(ui(context))};
}
async function dispatchRun() {
  await waitFor(() => expect(m.read).toHaveBeenCalledTimes(1));
  await act(async () => {fireEvent.click(screen.getByRole("button", {name: "Run Report"}));});
  expect(m.run).toHaveBeenCalledTimes(1);
  expect(m.run).toHaveBeenCalledWith({reportCode: "SYNTHETIC_MANUAL", outputFormat: "screen", filters: {date_from: "2026-10-01"}, templateId: undefined});
}
async function mountAndRun(reply: unknown) {
  m.run.mockResolvedValue(reply);
  const view = mount(); await dispatchRun(); return view;
}
const manualReply = () => ({success: false, data: {success: false, requiresManualTemplateSelection: true, error: manualMessage}, error: manualMessage});

it("exact server manual-selection reply opens the picker instead of returning a generic error", async () => {
  // Shape returned by runReportAction when runReport requests manual branding.
  await mountAndRun(manualReply());
  expect(screen.queryByRole("dialog", {name: "Select Report Template"})).not.toBeNull();
  expect(screen.queryByText(manualMessage)).toBeNull();
  expect(screen.queryByTestId("results")).toBeNull();
});

it("a denied result without the manual flag stays an error and never opens the picker", async () => {
  const message = "You do not have permission to run reports.";
  await mountAndRun({success: false, error: message});
  expect(screen.getByText(message)).toBeDefined();
  expect(screen.queryByRole("dialog", {name: "Select Report Template"})).toBeNull();
  expect(screen.queryByTestId("results")).toBeNull();
});

it("ordinary successful report data still renders without opening the picker", async () => {
  await mountAndRun({success: true, data: {success: true, runId: 19, rowCount: 1, data: {columns: ["name"], rows: [{name: "OFFLINE_SUCCESS_CONTROL"}]}}});
  expect(screen.getByTestId("results").textContent).toContain("OFFLINE_SUCCESS_CONTROL");
  expect(screen.queryByRole("dialog", {name: "Select Report Template"})).toBeNull();
  expect(screen.queryByText(manualMessage)).toBeNull();
});

it.each(["account change", "permission retirement", "unmount"])("late manual-selection reply cannot open a picker after %s", async retirement => {
  let resolve!: (reply: ReturnType<typeof manualReply>) => void;
  const pending = new Promise<ReturnType<typeof manualReply>>(done => {resolve = done;});
  m.run.mockReturnValue(pending);
  const view = mount(); await dispatchRun();
  if (retirement === "unmount") view.unmount();
  else if (retirement === "account change") view.replace({...auth, profile: {...auth.profile!, id: 32, auth_user_id: "synthetic-next-owner"}});
  else view.replace({...auth, permissionCodes: [], globalPermissionCodes: []});
  await act(async () => {resolve(manualReply());});
  expect(screen.queryByRole("dialog", {name: "Select Report Template"})).toBeNull();
  expect(screen.queryByText(manualMessage)).toBeNull();
  expect(screen.queryByTestId("results")).toBeNull();
  expect(m.run).toHaveBeenCalledTimes(1);
});


const selectedSuccess = (name = "SELECTED_SUCCESS_CONTROL") => ({success: true, data: {success: true, runId: 20, rowCount: 1, data: {columns: ["name"], rows: [{name}]}}});
function currentSelection() {
  const props = m.picker.mock.calls.at(-1)?.[0] as {open: boolean; onSelect: (id: number) => void};
  expect(props.open).toBe(true); return props.onSelect;
}
async function selectTemplate() {
  await act(async () => {fireEvent.click(screen.getByRole("button", {name: "Use synthetic template"}));});
}
function expectSelectedRequest() {
  expect(m.run).toHaveBeenCalledTimes(2);
  expect(m.run.mock.calls[0][0]).toEqual({reportCode: "SYNTHETIC_MANUAL", outputFormat: "screen", filters: {date_from: "2026-10-01"}, templateId: undefined});
  expect(m.run.mock.calls[1][0]).toEqual({...m.run.mock.calls[0][0], templateId: 701});
}

it("picker callback continues once with the newly chosen ID and unchanged request scope, then renders success", async () => {
  allowBranding = true;
  m.run.mockImplementation(async request => request.templateId === 701 ? selectedSuccess() : manualReply());
  mount(); await dispatchRun(); await selectTemplate();
  expectSelectedRequest();
  expect(screen.getByTestId("results").textContent).toContain("SELECTED_SUCCESS_CONTROL");
  expect(screen.queryByRole("dialog", {name: "Select Report Template"})).toBeNull();
  expect(screen.queryByText(manualMessage)).toBeNull();
  // The existing pre-preview and accepted-run fallback must both use the chosen ID.
  expect(m.branding).toHaveBeenCalledTimes(2);
});

it("server denial of the selected template remains an error with no automatic rerun or reopened picker", async () => {
  allowBranding = true;
  const error = "Selected template is not authorized.";
  m.run.mockResolvedValueOnce(manualReply()).mockResolvedValueOnce({success: false, error});
  mount(); await dispatchRun(); await selectTemplate();
  expectSelectedRequest();
  expect(screen.getByText(error)).toBeDefined();
  expect(screen.queryByTestId("results")).toBeNull();
  expect(screen.queryByRole("dialog", {name: "Select Report Template"})).toBeNull();
  expect(m.branding).toHaveBeenCalledTimes(1);
});

it.each(["account change", "permission retirement", "unmount", "read denial", "changed filters"])(
  "retained picker callback cannot rerun or resolve branding after %s",
  async retirement => {
    m.run.mockResolvedValue(manualReply());
    const view = mount(); await dispatchRun(); const oldSelect = currentSelection();
    if (retirement === "unmount") view.unmount();
    else if (retirement === "account change") view.replace({...auth, profile: {...auth.profile!, id: 32, auth_user_id: "synthetic-next-owner"}});
    else if (retirement === "permission retirement") view.replace({...auth, permissionCodes: [], globalPermissionCodes: []});
    else if (retirement === "changed filters") fireEvent.change(screen.getByLabelText("Date From"), {target: {value: "2026-10-02"}});
    else {
      m.read.mockRejectedValue(new ReadError("Denied", 403));
      await act(async () => {await view.client.invalidateQueries({queryKey: ["report-saved-filters"]});});
      await waitFor(() => expect(screen.queryByRole("dialog", {name: "Select Report Template"})).toBeNull());
    }
    await act(async () => {oldSelect(701);});
    expect(m.run).toHaveBeenCalledTimes(1);
    expect(m.branding).not.toHaveBeenCalled();
    expect(screen.queryByTestId("results")).toBeNull();
  }
);

it.each(["account change", "permission retirement", "unmount"])(
  "late selected-run response cannot reopen a picker after %s",
  async retirement => {
    allowBranding = true;
    let resolve!: (reply: ReturnType<typeof manualReply>) => void;
    const pending = new Promise<ReturnType<typeof manualReply>>(done => {resolve = done;});
    m.run.mockResolvedValueOnce(manualReply()).mockReturnValueOnce(pending);
    const view = mount(); await dispatchRun(); await selectTemplate(); expectSelectedRequest();
    if (retirement === "unmount") view.unmount();
    else if (retirement === "account change") view.replace({...auth, profile: {...auth.profile!, id: 32, auth_user_id: "synthetic-next-owner"}});
    else view.replace({...auth, permissionCodes: [], globalPermissionCodes: []});
    await act(async () => {resolve(manualReply());});
    expect(m.run).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog", {name: "Select Report Template"})).toBeNull();
    expect(screen.queryByTestId("results")).toBeNull();
    expect(screen.queryByText(manualMessage)).toBeNull();
    expect(m.branding).toHaveBeenCalledTimes(1);
  }
);
