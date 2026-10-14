// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
import type {ReportRegistryEntry} from "@/lib/report-center/types";
const state = vi.hoisted(() => ({read: vi.fn(), legacy: vi.fn(), run: vi.fn(), create: vi.fn(), remove: vi.fn(), default: vi.fn(), saved: vi.fn()}));
const callbacks = vi.hoisted(() => ({submit: undefined as undefined | (() => Promise<void>)}));
vi.mock("@/lib/reads/client", async () => ({...await vi.importActual("@/lib/reads/client"),
  // Criteria assertions remain specific to their own route. Saved-filter
  // read/adoption has separate actual-parent coverage, not an extra criterion.
  readJson: (resource: string, input: unknown, signal: AbortSignal) => resource === "report-saved-filters"
    ? Promise.resolve({success: true, data: {criteria: input, rows: [], totalCount: 0}})
    : state.read(resource, input, signal)}));
vi.mock("@/server/actions/reports/runner", () => ({runReportAction: state.run}));
vi.mock("@/server/actions/reports/saved-filters", () => ({listSavedFilters: state.saved, createSavedFilter: state.create, deleteSavedFilter: state.remove, setDefaultSavedFilter: state.default}));
vi.mock("@/server/actions/reports/templates", () => ({resolveTemplatePreview: vi.fn()}));
vi.mock("@/lib/export/excel", () => ({exportToExcel: vi.fn()}));
vi.mock("@/lib/export/pdf", () => ({exportToPDF: vi.fn()}));
vi.mock("@/lib/export/print", () => ({exportToPrint: vi.fn()}));
vi.mock("@/components/report-center/report-template-select-dialog", () => ({ReportTemplateSelectDialog: () => null}));
vi.mock("next/navigation", () => ({useRouter: () => ({push: vi.fn(), back: vi.fn()}), usePathname: () => "/admin/reports/run/SYNTHETIC_REPORT"}));
// Keep the real shared validation form; expose only its actual callback for a
// retained-callback control. No validation or report dispatch is simulated.
vi.mock("@/components/workspace/validated-task-form", async () => {
  const actual = await vi.importActual<typeof import("@/components/workspace/validated-task-form")>("@/components/workspace/validated-task-form");
  return {...actual, ValidatedTaskForm: (props: React.ComponentProps<typeof actual.ValidatedTaskForm>) => {callbacks.submit = props.onSubmit as () => Promise<void>; return <actual.ValidatedTaskForm {...props} />;}};
});
import {ReportRunPage} from "@/features/report-center/report-run-page";
import {ReadError} from "@/lib/reads/client";
const permissions = ["reports.run", "reports.view", "hr.employees.view", "organizations.view", "branches.view", "common_md.view"];
const auth = {profile: {id: 31, auth_user_id: "synthetic-one", must_change_password: false}, accountStatus: "active", isAccountActive: true,
  email: null, roleCodes: [], permissionCodes: permissions, globalPermissionCodes: permissions,
  roleAssignments: [{roleId: 10, roleCode: "synthetic", ownerCompanyId: null, branchId: null, permissionCodes: permissions}]} as unknown as AuthContext;
const registry = {id: 1, report_code: "SYNTHETIC_REPORT", report_name_en: "Synthetic report", description_en: "Test-only criteria", module_code: "HR", required_permissions: ["hr.employees.view"],
  filter_schema_json: {filters: ["employee_id", "date_from", "date_to"]}, is_letter_type: false, supports_scheduling: false, default_output_formats: ["screen"]} as unknown as ReportRegistryEntry;
type Criteria = {reportCode: string; key: string; page?: number; pageSize?: number; search?: string; selectedId?: number; ownerCompanyId?: number; branchId?: number; departmentId?: number};
const option = (value = 701, label = "Synthetic beyond 500") => ({value, label, code: `TEST-${value}`});
function reply(input: Criteria, rows = [option()], totalCount = rows.length, selected = input.selectedId ? rows.find(row => row.value === input.selectedId) ?? null : null) {
  return {success: true, data: {criteria: {page: 1, pageSize: 25, search: "", ...input}, rows, totalCount, selected}};
}
const clients: QueryClient[] = [];
function mount(initialFilters: Record<string, string> = {}, context = auth, entry = registry) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(client);
  const ui = (ctx: AuthContext) => <QueryClientProvider client={client}><ReportRunPage registryEntry={entry} initialFilters={initialFilters} {...{authContext: ctx}} /></QueryClientProvider>;
  const view = render(ui(context)); return {...view, client, replace: (ctx: AuthContext) => view.rerender(ui(ctx))};
}
beforeEach(() => {
  state.read.mockImplementation(async (_resource, input: Criteria) => reply(input));
  state.legacy.mockResolvedValue({success: true, data: {employees: [option(1, "Legacy first page")]}});
  state.saved.mockResolvedValue({success: true, data: []}); state.run.mockResolvedValue({success: false, error: "SYNTHETIC RUN CONTROL"});
});
afterEach(() => {cleanup(); clients.splice(0).forEach(client => client.clear()); Object.values(state).forEach(mock => mock.mockReset());});

it("real report picker searches beyond the old 500-row cap using the scoped read route", async () => {
  mount(); const picker = await screen.findByRole("combobox", {name: "Employee Id"});
  fireEvent.click(picker); fireEvent.change(screen.getByPlaceholderText("Search..."), {target: {value: "beyond 500"}});
  await screen.findByRole("option", {name: /Synthetic beyond 500/});
  expect(state.read.mock.calls.some(([resource, input]) => resource === "report-criteria" && input.search === "beyond 500")).toBe(true);
  expect(state.legacy).not.toHaveBeenCalled(); expect(state.run).not.toHaveBeenCalled(); expect(state.create).not.toHaveBeenCalled();
});
it("a nonblank selection cannot dispatch a report after its lookup returns an error", async () => {
  state.legacy.mockResolvedValue({success: false, error: "Synthetic lookup unavailable"}); state.read.mockRejectedValue(new ReadError("Temporarily unavailable", 503));
  mount({employee_id: "701"}); await act(async () => {await new Promise(resolve => setTimeout(resolve, 40));});
  await waitFor(() => expect((screen.getByRole("button", {name: "Run Report"}) as HTMLButtonElement).disabled).toBe(true));
  fireEvent.click(screen.getByRole("button", {name: "Run Report"})); expect(state.run).not.toHaveBeenCalled();
});
it("account permission removal retires criterion labels and prevents report dispatch", async () => {
  const view = mount({employee_id: "701"}); await screen.findByRole("combobox", {name: "Employee Id"});
  view.replace({...auth, permissionCodes: [], globalPermissionCodes: [], roleAssignments: []});
  await waitFor(() => expect((screen.getByRole("button", {name: "Run Report"}) as HTMLButtonElement).disabled).toBe(true));
  fireEvent.click(screen.getByRole("button", {name: "Run Report"})); expect(state.run).not.toHaveBeenCalled();
  expect(screen.queryByText(/Synthetic beyond 500/)).toBeNull();
});
it("valid unchanged date filters dispatch the existing run payload exactly once", async () => {
  mount({date_from: "2026-10-01", date_to: "2026-10-05"});
  await waitFor(() => expect((screen.getByRole("button", {name: "Run Report"}) as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(screen.getByRole("button", {name: "Run Report"}));
  await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1));
  expect(state.run).toHaveBeenCalledWith({reportCode: "SYNTHETIC_REPORT", outputFormat: "screen", filters: {date_from: "2026-10-01", date_to: "2026-10-05"}, templateId: undefined});
});
it("selected historical employee is pinned outside the current search without dispatching anything", async () => {
  state.read.mockImplementation(async (_r, input: Criteria) => reply(input, [option(1, "Current page")], 1, input.selectedId ? option(input.selectedId, "Inactive historical employee") : null));
  mount({employee_id: "701"}); await screen.findByText(/Inactive historical employee/);
  expect(state.read.mock.calls[0][1].selectedId).toBe(701); expect(state.run).not.toHaveBeenCalled(); expect(state.create).not.toHaveBeenCalled();
});
it.each([401, 403])("terminal %s retires the whole report owner even when the entity filter is blank", async status => {
  state.read.mockRejectedValue(new ReadError("Denied", status)); const view = mount(); await screen.findByText(/Choices are unavailable/);
  expect((screen.getByRole("button", {name: "Run Report"}) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => {await callbacks.submit?.();}); expect(state.run).not.toHaveBeenCalled();
  expect(view.client.getQueriesData({queryKey: ["reports", "criteria"]}).some(([, data]) => !!data)).toBe(false); expect(state.read).toHaveBeenCalledTimes(1);
});
it.each(["", "701"])("typed optional restriction for selection '%s' is row-free and only unresolved nonblank blocks", async selected => {
  state.read.mockImplementation(async (_r, input: Criteria) => ({success: true, data: {criteria: {page: 1, pageSize: 25, search: "", ...input}, availability: "restricted"}}));
  const view = mount(selected ? {employee_id: selected} : {}); await screen.findByText(/Choices are unavailable/);
  expect((screen.getByRole("button", {name: "Run Report"}) as HTMLButtonElement).disabled).toBe(!!selected);
  if (selected) {await act(async () => {await callbacks.submit?.();}); expect(state.run).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", {name: "Clear Employee Id"}));}
  await waitFor(() => expect((screen.getByRole("button", {name: "Run Report"}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", {name: "Run Report"})); await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1));
  expect(state.run.mock.calls[0][0].filters).toEqual({}); expect(view.client.getQueriesData({queryKey: ["reports", "criteria"]}).every(([, data]) => !data || !JSON.stringify(data).includes("Synthetic beyond"))).toBe(true);
});
it("ordinary unavailable blank lookup stays explicit without blocking an otherwise lawful unfiltered report", async () => {
  state.read.mockRejectedValue(new ReadError("Retry later", 503)); mount(); await screen.findByText(/Choices could not be loaded/);
  expect(screen.queryByText("No matching choices.")).toBeNull(); fireEvent.click(screen.getByRole("button", {name: "Run Report"})); await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1));
});
it("ordinary failure preserves the nonblank draft, suppresses its label and recovers via visible retry", async () => {
  const view = mount({employee_id: "701", date_from: "2026-10-01"}); await screen.findByText(/Synthetic beyond 500/);
  state.read.mockRejectedValue(new ReadError("Retry later", 503)); await act(async () => {await view.client.invalidateQueries({queryKey: ["reports", "criteria"]});});
  await screen.findByText(/Choices could not be loaded/); expect(screen.queryByText(/Synthetic beyond 500/)).toBeNull();
  expect((screen.getByLabelText("Date From") as HTMLInputElement).value).toBe("2026-10-01"); expect((screen.getByRole("button", {name: "Run Report"}) as HTMLButtonElement).disabled).toBe(true);
  state.read.mockImplementation(async (_r, input: Criteria) => reply(input)); fireEvent.click(screen.getByRole("button", {name: "Retry Employee Id choices"}));
  await screen.findByText(/Synthetic beyond 500/); expect(state.read.mock.lastCall?.[1].selectedId).toBe(701); expect(state.run).not.toHaveBeenCalled();
});
it("a missing or invisible selected ID blocks run without displaying its raw ID or claiming no access to the whole report", async () => {
  state.read.mockImplementation(async (_r, input: Criteria) => reply(input, [], 0, null)); mount({employee_id: "99999"}); await screen.findByText(/This selection is unavailable/);
  expect(screen.queryByDisplayValue("99999")).toBeNull(); expect((screen.getByRole("button", {name: "Run Report"}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", {name: "Clear Employee Id"})); await waitFor(() => expect((screen.getByRole("button", {name: "Run Report"}) as HTMLButtonElement).disabled).toBe(false));
});
it("account switch clears criterion selections and search, aborts old reads and rejects late old success", async () => {
  let finish!: (value: unknown) => void, signal!: AbortSignal, old!: Criteria;
  state.read.mockImplementationOnce((_r, input: Criteria, s: AbortSignal) => {old = input; signal = s; return new Promise(resolve => {finish = resolve;});})
    .mockImplementation(async (_r, input: Criteria) => reply(input, [option(88, "Other account allowed")], 1));
  const view = mount({employee_id: "701"}); await waitFor(() => expect(state.read).toHaveBeenCalledTimes(1));
  view.replace({...auth, profile: {...auth.profile!, id: 32, auth_user_id: "synthetic-two"}});
  await waitFor(() => expect(state.read).toHaveBeenCalledTimes(2)); expect(signal.aborted).toBe(true); expect(state.read.mock.calls[1][1].selectedId).toBeUndefined();
  await act(async () => {finish(reply(old, [option(701, "RETIRED OLD ACCOUNT")], 1));});
  expect(screen.queryByText(/RETIRED OLD/)).toBeNull(); expect(JSON.stringify(view.client.getQueriesData({queryKey: ["reports", "criteria"]}))).not.toContain("RETIRED OLD");
  fireEvent.click(screen.getByRole("button", {name: "Reset"}));
  await waitFor(() => expect(screen.queryByRole("button", {name: "Clear Employee Id"})).toBeNull());
  expect(state.run).not.toHaveBeenCalled();
});
it("scope change retires old labels while independently revalidating a still-selected ID", async () => {
  const view = mount({employee_id: "701"}); await screen.findByText(/Synthetic beyond 500/);
  state.read.mockImplementation(async (_r, input: Criteria) => reply(input, [], 0, null));
  view.replace({...auth, roleAssignments: [{roleId: 10, roleCode: "synthetic", ownerCompanyId: 2, branchId: 12, permissionCodes: permissions}]});
  expect(screen.queryByText(/Synthetic beyond 500/)).toBeNull(); await screen.findByText(/This selection is unavailable/);
  expect((screen.getByRole("button", {name: "Run Report"}) as HTMLButtonElement).disabled).toBe(true); expect(state.run).not.toHaveBeenCalled();
});
it("invalid search never dispatches and remains correctable through the actual open combobox", async () => {
  mount(); fireEvent.click(await screen.findByRole("combobox", {name: "Employee Id"})); const input = screen.getByPlaceholderText("Search...");
  await waitFor(() => expect(state.read).toHaveBeenCalledTimes(1)); fireEvent.change(input, {target: {value: "x".repeat(201)}}); await screen.findByText(/at most 200/);
  await act(async () => {await new Promise(resolve => setTimeout(resolve, 280));}); expect(state.read).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByPlaceholderText("Search..."), {target: {value: "corrected"}});
  await waitFor(() => expect(state.read.mock.calls.some(([, input]) => input.search === "corrected")).toBe(true));
  expect(state.read.mock.calls.every(([, input]) => input.search.length <= 200)).toBe(true); expect(state.run).not.toHaveBeenCalled();
});
it("old retained form submission cannot reuse its formerly valid selection after filters change", async () => {
  mount({employee_id: "701"}); await screen.findByText(/Synthetic beyond 500/); const old = callbacks.submit!;
  fireEvent.click(screen.getByRole("button", {name: "Clear Employee Id"})); await waitFor(() => expect((screen.getByRole("button", {name: "Run Report"}) as HTMLButtonElement).disabled).toBe(false));
  await act(async () => {await old();}); expect(state.run).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", {name: "Run Report"})); await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1)); expect(state.run.mock.calls[0][0].filters).toEqual({});
});
it("company changes clear only dependent entity filters and re-request choices in the new company", async () => {
  const entry = {...registry, filter_schema_json: {filters: ["owner_company_id", "branch_id", "department_id", "employee_id", "date_from"]}};
  const labels: Record<string, [number, string]> = {owner_company_id: [1, "Company one"], branch_id: [11, "Branch eleven"], department_id: [21, "Department twenty-one"], employee_id: [701, "Employee seven hundred"]};
  state.read.mockImplementation(async (_r, input: Criteria) => {
    const [value, label] = labels[input.key], rows = [option(value, label), ...(input.key === "owner_company_id" ? [option(2, "Company two")] : [])];
    return reply(input, rows);
  });
  mount({owner_company_id: "1", branch_id: "11", department_id: "21", employee_id: "701", date_from: "2026-10-01"}, auth, entry);
  await screen.findByText(/Employee seven hundred/); fireEvent.click(screen.getByRole("combobox", {name: "Owner Company Id"}));
  fireEvent.click(await screen.findByRole("option", {name: /Company two/}));
  await waitFor(() => expect(state.read.mock.calls.some(([, input]) => input.key === "employee_id" && input.ownerCompanyId === 2 && input.selectedId === undefined)).toBe(true));
  expect((screen.getByLabelText("Date From") as HTMLInputElement).value).toBe("2026-10-01");
  expect(screen.queryByRole("button", {name: "Clear Branch Id"})).toBeNull(); expect(screen.queryByRole("button", {name: "Clear Department Id"})).toBeNull();
  expect(screen.queryByRole("button", {name: "Clear Employee Id"})).toBeNull(); expect(state.run).not.toHaveBeenCalled(); expect(state.create).not.toHaveBeenCalled();
});
it.each(["wrong-criteria", "malformed", "private-field"])("%s response is unavailable, not accepted as choices", async mode => {
  state.read.mockImplementation(async (_r, input: Criteria) => {
    const value = reply(input); if (mode === "wrong-criteria") value.data.criteria.search = "OTHER";
    if (mode === "malformed") return {success: true, data: {criteria: value.data.criteria}};
    if (mode === "private-field") return {success: true, data: {...value.data, salary: "PRIVATE"}};
    return value;
  });
  mount({employee_id: "701"}); await screen.findByText(/Choices could not be loaded/); expect(screen.queryByText(/Synthetic beyond 500/)).toBeNull(); expect(state.run).not.toHaveBeenCalled();
});
it("native choice paging uses bounded next/previous requests and never submits the surrounding form", async () => {
  state.read.mockImplementation(async (_r, input: Criteria) => {
    const start = ((input.page ?? 1) - 1) * 25, rows = Array.from({length: Math.min(25, Math.max(0, 51 - start))}, (_, i) => option(start + i + 1, `Page employee ${start + i + 1}`));
    return reply(input, rows, 51);
  });
  mount(); await screen.findByText("Page 1 · 51 matches"); fireEvent.click(screen.getByRole("button", {name: "Next Employee Id choices"}));
  await screen.findByText("Page 2 · 51 matches"); expect(state.read.mock.lastCall?.[1]).toMatchObject({page: 2, pageSize: 25});
  fireEvent.click(screen.getByRole("combobox", {name: "Employee Id"})); await screen.findByRole("option", {name: /Page employee 26$/});
  expect(screen.queryByRole("option", {name: /Page employee 1$/})).toBeNull(); fireEvent.keyDown(screen.getByPlaceholderText("Search..."), {key: "Escape"});
  fireEvent.click(screen.getByRole("button", {name: "Previous Employee Id choices"})); await screen.findByText("Page 1 · 51 matches"); expect(state.run).not.toHaveBeenCalled();
});
it("an aborted earlier search cannot replace newer matched options", async () => {
  let finish!: (value: unknown) => void, old!: Criteria, signal!: AbortSignal;
  state.read.mockImplementation(async (_r, input: Criteria, abort: AbortSignal) => {
    if (input.search === "old") {old = input; signal = abort; return new Promise(resolve => {finish = resolve;});}
    return reply(input, [option(88, input.search === "new" ? "New authorized match" : "Initial match")]);
  });
  const view = mount(); fireEvent.click(await screen.findByRole("combobox", {name: "Employee Id"}));
  fireEvent.change(screen.getByPlaceholderText("Search..."), {target: {value: "old"}}); await waitFor(() => expect(finish).toBeTypeOf("function"));
  fireEvent.change(screen.getByPlaceholderText("Search..."), {target: {value: "new"}}); await screen.findByRole("option", {name: /New authorized match/});
  expect(signal.aborted).toBe(true); await act(async () => {finish(reply(old, [option(1, "OLD REPLY")], 1));});
  expect(screen.queryByText(/OLD REPLY/)).toBeNull(); expect(JSON.stringify(view.client.getQueriesData({queryKey: ["reports", "criteria"]}))).not.toContain("OLD REPLY"); expect(state.run).not.toHaveBeenCalled();
});
it("typed restricted refresh retires an old selected label but does not clear legitimate unrelated date input", async () => {
  const view = mount({employee_id: "701", date_from: "2026-10-01"}); await screen.findByText(/Synthetic beyond 500/);
  state.read.mockImplementation(async (_r, input: Criteria) => ({success: true, data: {criteria: {page: 1, pageSize: 25, search: "", ...input}, availability: "restricted"}}));
  await act(async () => {await view.client.invalidateQueries({queryKey: ["reports", "criteria"]});}); await screen.findByText(/Choices are unavailable/);
  expect(screen.queryByText(/Synthetic beyond 500/)).toBeNull(); expect(JSON.stringify(view.client.getQueriesData({queryKey: ["reports", "criteria"]}))).not.toContain("Synthetic beyond");
  expect((screen.getByLabelText("Date From") as HTMLInputElement).value).toBe("2026-10-01"); expect((screen.getByRole("button", {name: "Run Report"}) as HTMLButtonElement).disabled).toBe(true);
});
it("branch changes retire the employee choice but preserve company-wide department/work-site drafts", async () => {
  const entry = {...registry, filter_schema_json: {filters: ["owner_company_id", "branch_id", "department_id", "work_site_id", "employee_id", "date_from"]}};
  const labels: Record<string, [number, string]> = {owner_company_id: [1, "Company one"], branch_id: [11, "Branch eleven"], department_id: [21, "Historical company-wide department"], work_site_id: [41, "Historical company-wide site"], employee_id: [701, "Branch eleven employee"]};
  state.read.mockImplementation(async (_r, input: Criteria) => {
    const [value, label] = labels[input.key], rows = [option(value, label), ...(input.key === "branch_id" ? [option(12, "Branch twelve")] : [])]; return reply(input, rows);
  });
  mount({owner_company_id: "1", branch_id: "11", department_id: "21", work_site_id: "41", employee_id: "701", date_from: "2026-10-01"}, auth, entry);
  await screen.findByText(/Historical company-wide site/); fireEvent.click(screen.getByRole("combobox", {name: "Branch Id"})); fireEvent.click(await screen.findByRole("option", {name: /Branch twelve/}));
  await waitFor(() => expect(state.read.mock.calls.some(([, input]) => input.key === "employee_id" && input.branchId === 12 && input.selectedId === undefined)).toBe(true));
  expect(screen.getByText(/Historical company-wide department/)).toBeTruthy(); expect(screen.getByText(/Historical company-wide site/)).toBeTruthy();
  expect(state.read.mock.calls.filter(([, input]) => ["department_id", "work_site_id"].includes(input.key)).every(([, input]) => input.ownerCompanyId === 1 && input.branchId === undefined)).toBe(true);
  expect(screen.queryByRole("button", {name: "Clear Employee Id"})).toBeNull(); expect((screen.getByLabelText("Date From") as HTMLInputElement).value).toBe("2026-10-01"); expect(state.run).not.toHaveBeenCalled();
});
