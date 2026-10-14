// @vitest-environment jsdom
import "../remediation/f05/setup";
import React, {useEffect} from "react";
import {afterEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {QueryClient, QueryClientProvider, useQuery, useQueryClient} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
import {ReportHistoryPage} from "@/features/report-center/report-history-page";
import {ReadError} from "@/lib/reads/client";
import {reportHistoryIdentity, type ReportHistoryRow} from "@/lib/reads/report-history-schema";
import type {ReportHistoryProps} from "@/hooks/use-report-history";
const state = vi.hoisted(() => ({read: vi.fn(), delivery: vi.fn(), clients: [] as unknown[]}));
vi.mock("@/lib/reads/client", async original => ({...await original<typeof import("@/lib/reads/client")>(), readJson: state.read}));
vi.mock("next/navigation", () => ({usePathname: () => "/admin/reports/history"}));
vi.mock("@/features/report-center/report-delivery-log-page", () => ({ReportDeliveryLogPanel: ({runId}: {runId: number}) => {
  const client = useQueryClient();
  useEffect(() => {state.clients.push(client);}, [client]);
  const read = useQuery({queryKey: ["report-delivery-logs", runId], queryFn: () => state.delivery(runId), retry: false, gcTime: 0});
  return <div data-testid="delivery-child">{read.data ?? "Loading isolated deliveries"}</div>;
}}));
const context = {profile: {id: 6, auth_user_id: "synthetic-history-owner", must_change_password: false}, accountStatus: "active", isAccountActive: true, permissionCodes: ["reports.view"], roleCodes: [], roleAssignments: []} as unknown as AuthContext;
const row = (id = 3): ReportHistoryRow => ({id, report_code: `PERF-REPORT-${id}`, run_reference: `PERF-RUN-${id}`, run_status: "success", output_format: "pdf", row_count: 10, duration_ms: 15, run_by: 6, started_at: "2026-10-05T00:00:00+00:00", sensitive_data_included: false, was_multi_company: false, report: {report_name_en: `Synthetic report ${id}`, module_code: "hr"}, runner: {display_name: "Synthetic runner"}});
const page = (rows = [row()]) => ({mode: "list" as const, page: 1, pageSize: 25, totalCount: rows.length, rows});
const detail = (id = 3) => ({success: true, data: {mode: "detail", record: {...row(id), completed_at: "2026-10-05T00:00:01+00:00", template_selected_manually: false, error_message: `Synthetic detail ${id}`, redaction_summary_json: {wasRedacted: true, totalFieldsRedacted: 1, redactedFields: [{field: "synthetic", action: "masked"}]}}}});
const clients: QueryClient[] = [];
function mount(input: Partial<ReportHistoryProps> = {}) {
  const client = new QueryClient({defaultOptions: {queries: {retryDelay: 0}}}); clients.push(client);
  const props = {authContext: context, initialReadIdentity: reportHistoryIdentity(context), initialUpdatedAt: Date.now(), initialPage: page(), ...input};
  const tree = (value: ReportHistoryProps) => <QueryClientProvider client={client}><ReportHistoryPage {...value} /></QueryClientProvider>;
  const view = render(tree(props)); return {...view, client, props, replace: (next: Partial<ReportHistoryProps>) => view.rerender(tree({...props, ...next}))};
}
afterEach(() => {cleanup(); clients.splice(0).forEach(c => c.clear()); state.read.mockReset(); state.delivery.mockReset(); state.clients = [];});
it("the actual table reuses matching SSR rows and exposes all seven reviewed sort controls", async () => {
  mount(); await screen.findByText("Synthetic report 3"); expect(state.read).not.toHaveBeenCalled(); expect(screen.getByText("1 runs")).toBeTruthy();
  expect(screen.getByText(/hold Shift to sort by multiple columns/)).toBeTruthy(); expect(screen.queryByText(/awaiting compatible/)).toBeNull();
  for (const name of ["Report", "Format", "Status", "Rows", "Duration", "Run By", "Started"]) expect((screen.getByRole("button", {name}) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByText("Synthetic detail 3")).toBeNull(); expect(state.delivery).not.toHaveBeenCalled();
  expect(screen.getByRole("button", {name: "View run PERF-RUN-3 details"})).toBeTruthy();
});
it("selected detail is fetched only on open; closing destroys the child's separate query cache", async () => {
  state.read.mockResolvedValue(detail()); state.delivery.mockResolvedValue("Synthetic delivery"); const view = mount();
  fireEvent.click(screen.getByRole("button", {name: "View run PERF-RUN-3 details"})); await screen.findByText("Synthetic detail 3"); await screen.findByText("Synthetic delivery");
  expect(state.read).toHaveBeenCalledTimes(1); expect(state.read.mock.calls[0].slice(0, 2)).toEqual(["report-history", {mode: "detail", recordId: 3}]);
  expect(state.clients).toHaveLength(1); expect(state.clients[0]).not.toBe(view.client); expect(view.client.getQueryData(["report-delivery-logs", 3])).toBeUndefined();
  fireEvent.click(screen.getByRole("button", {name: "Close"})); await waitFor(() => expect(screen.queryByText("Synthetic detail 3")).toBeNull());
  await waitFor(() => expect((state.clients[0] as QueryClient).getQueryCache().getAll()).toHaveLength(0));
});
it("a malformed selected response is rejected without displaying its data or child deliveries", async () => {
  state.read.mockResolvedValue(detail(4)); mount(); fireEvent.click(screen.getByRole("button", {name: "View run PERF-RUN-3 details"}));
  await screen.findByText(/Could not load complete run details/); expect(state.read).toHaveBeenCalledTimes(2); expect(screen.queryByText("Synthetic detail 4")).toBeNull(); expect(state.delivery).not.toHaveBeenCalled();
});
it("detail failures expose an explicit retry rather than assuming no redaction or no deliveries", async () => {
  state.read.mockRejectedValue(new ReadError("Unavailable", 503)); state.delivery.mockResolvedValue("Synthetic delivery"); mount();
  fireEvent.click(screen.getByRole("button", {name: "View run PERF-RUN-3 details"})); await screen.findByRole("button", {name: "Retry run details"});
  expect(state.read).toHaveBeenCalledTimes(2); expect(screen.queryByText("No redaction applied.")).toBeNull(); expect(state.delivery).not.toHaveBeenCalled();
  state.read.mockResolvedValue(detail()); fireEvent.click(screen.getByRole("button", {name: "Retry run details"})); await screen.findByText("Synthetic detail 3");
});
it.each([401, 403])("detail denial %s masks warm rows, destroys the detail mount, clears caches and never retries", async status => {
  state.read.mockRejectedValue(new ReadError("Denied", status)); const view = mount(); fireEvent.click(screen.getByRole("button", {name: "View run PERF-RUN-3 details"}));
  await screen.findByText(/Your access to report history could not be verified/); expect(state.read).toHaveBeenCalledTimes(1); expect(screen.queryByText("Synthetic report 3")).toBeNull(); expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() => expect(view.client.getQueryCache().getAll().some(q => q.state.data)).toBe(false));
});
it("closing an unresolved detail aborts its request and a late result cannot resurrect the dialog", async () => {
  let finish!: (value: unknown) => void; state.read.mockImplementation(() => new Promise(resolve => {finish = resolve;})); mount();
  fireEvent.click(screen.getByRole("button", {name: "View run PERF-RUN-3 details"})); await screen.findByText("Loading run details..."); const signal = state.read.mock.calls[0][2] as AbortSignal;
  fireEvent.click(screen.getByRole("button", {name: "Close"})); await waitFor(() => expect(signal.aborted).toBe(true)); await act(async () => finish(detail()));
  expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.queryByText("Synthetic detail 3")).toBeNull(); expect(state.delivery).not.toHaveBeenCalled();
});
it("changing principal removes old rows and selected detail immediately, including private child caches", async () => {
  state.read.mockResolvedValue(detail()); state.delivery.mockResolvedValue("First principal delivery"); const view = mount();
  fireEvent.click(screen.getByRole("button", {name: "View run PERF-RUN-3 details"})); await screen.findByText("First principal delivery"); const firstClient = state.clients[0] as QueryClient;
  state.read.mockResolvedValue({success: true, data: page([row(4)])});
  const authContext = {...context, profile: {...context.profile!, id: 7, auth_user_id: "synthetic-second"}} as AuthContext;
  view.replace({authContext}); await screen.findByText("Synthetic report 4"); expect(screen.queryByText("First principal delivery")).toBeNull(); expect(screen.queryByText("Synthetic detail 3")).toBeNull();
  await waitFor(() => expect(firstClient.getQueryCache().getAll()).toHaveLength(0));
  expect(view.client.getQueryCache().getAll().some(q => q.queryKey.includes(reportHistoryIdentity(context)))).toBe(false);
  state.read.mockResolvedValue(detail(4)); state.delivery.mockResolvedValue("Second principal delivery"); fireEvent.click(screen.getByRole("button", {name: "View run PERF-RUN-4 details"})); await screen.findByText("Second principal delivery");
  expect(state.clients[1]).not.toBe(firstClient);
});
it("same profile with changed assignment scope does not retain old data or accept its server seed", async () => {
  const view = mount(); await screen.findByText("Synthetic report 3");
  state.read.mockResolvedValue({success: true, data: page([])});
  const authContext = {...context, roleAssignments: [{roleId: 4, roleCode: "scoped", ownerCompanyId: 2, branchId: 3, permissionCodes: ["reports.view"]}]} as AuthContext;
  view.replace({authContext}); await screen.findByText("0 runs"); expect(screen.queryByText("Synthetic report 3")).toBeNull(); expect(state.read).toHaveBeenCalledTimes(1);
});
it("list failure preserves unknown count, clears warm rows during refresh, and supports recovery", async () => {
  const view = mount(); state.read.mockRejectedValue(new ReadError("Unavailable", 503)); fireEvent.click(screen.getByRole("button", {name: "Refresh"}));
  await screen.findByRole("button", {name: "Retry report history"}); expect(screen.queryByText("Synthetic report 3")).toBeNull(); expect(screen.getByText("Count unavailable")).toBeTruthy(); expect(screen.queryByText("0 runs")).toBeNull();
  expect(screen.queryByText("No report runs found.")).toBeNull();
  expect(screen.getByText("Records could not yet be verified. Check the read status or retry.")).toBeTruthy();
  expect(state.read).toHaveBeenCalledTimes(2); state.read.mockResolvedValue({success: true, data: page([row(4)])}); fireEvent.click(screen.getByRole("button", {name: "Retry report history"})); await screen.findByText("Synthetic report 4"); expect(view.client.getQueryCache().getAll().length).toBeGreaterThan(0);
});
it("revocation or suspension stops reads and immediately masks a warm table", async () => {
  const view = mount(); await screen.findByText("Synthetic report 3"); view.replace({authContext: {...context, isAccountActive: false, accountStatus: "suspended"}});
  await screen.findByText(/Your access to report history could not be verified/); expect(screen.queryByText("Synthetic report 3")).toBeNull(); expect(state.read).not.toHaveBeenCalled();
});
it("actual paging, page-size and debounced search controls request complete server criteria", async () => {
  const many = {...page(Array.from({length: 25}, (_, index) => row(index + 1))), totalCount: 1107};
  state.read.mockImplementation(async (_resource, criteria) => {
    const p = criteria as {page: number; pageSize: number; search: string};
    const totalCount = p.search ? 2 : 1107, offset = (p.page - 1) * p.pageSize;
    return {success: true, data: {mode: "list", page: p.page, pageSize: p.pageSize, totalCount, rows: Array.from({length: Math.min(p.pageSize, Math.max(0, totalCount - offset))}, (_, index) => row(offset + index + 1))}};
  });
  mount({initialPage: many}); await screen.findByText("1107 runs"); fireEvent.click(screen.getByRole("button", {name: "Next"})); await screen.findByText("Synthetic report 26");
  expect(state.read.mock.calls[0][1]).toMatchObject({page: 2, pageSize: 25, sorting: [{id: "started_at", desc: true}]});
  fireEvent.change(screen.getByRole("combobox", {name: "Rows per page"}), {target: {value: "100"}}); await screen.findByText("Synthetic report 100"); expect(state.read.mock.calls[1][1]).toMatchObject({page: 1, pageSize: 100});
  const search = screen.getByPlaceholderText("Search by report, reference, user..."); fireEvent.change(search, {target: {value: "PERF"}}); fireEvent.change(search, {target: {value: "PERF-REPORT"}});
  expect(screen.queryByText("Synthetic report 100")).toBeNull(); await screen.findByText("2 runs"); expect(state.read).toHaveBeenCalledTimes(3); expect(state.read.mock.calls[2][1]).toMatchObject({page: 1, pageSize: 100, search: "PERF-REPORT"});
});
it("an out-of-range confirmed count clamps to a valid page rather than showing an empty successful page forever", async () => {
  const many = {...page(Array.from({length: 25}, (_, index) => row(index + 1))), totalCount: 1107};
  state.read.mockResolvedValueOnce({success: true, data: {mode: "list", page: 2, pageSize: 25, totalCount: 1, rows: []}}).mockResolvedValueOnce({success: true, data: page([row(4)])});
  mount({initialPage: many}); fireEvent.click(screen.getByRole("button", {name: "Next"}));
  // A shrinking page first reports its confirmed count, then reloads page one.
  // Wait for that replacement row rather than observing the intermediate count.
  await screen.findByText("Synthetic report 4"); expect(screen.getByText("1 runs")).toBeTruthy(); expect(screen.getByText("Page 1 of 1")).toBeTruthy();
  expect(state.read).toHaveBeenCalledTimes(2); expect(state.read.mock.calls[0][1]).toMatchObject({page: 2}); expect(state.read.mock.calls[1][1]).toMatchObject({page: 1}); expect(screen.getByText("Synthetic report 4")).toBeTruthy();
});
it("a late list response from another principal is aborted and cannot replace the current table", async () => {
  const completions: Array<(value: unknown) => void> = [];
  state.read.mockImplementation(() => new Promise(resolve => completions.push(resolve))); const view = mount({initialPage: undefined});
  await waitFor(() => expect(state.read).toHaveBeenCalledTimes(1)); const firstSignal = state.read.mock.calls[0][2] as AbortSignal;
  view.replace({authContext: {...context, profile: {...context.profile!, id: 7, auth_user_id: "new-history-owner"}} as AuthContext});
  await waitFor(() => expect(state.read).toHaveBeenCalledTimes(2)); expect(firstSignal.aborted).toBe(true);
  await act(async () => completions[0]({success: true, data: page([row(3)])})); expect(screen.queryByText("Synthetic report 3")).toBeNull();
  await act(async () => completions[1]({success: true, data: page([row(4)])})); await screen.findByText("Synthetic report 4"); expect(screen.queryByText("Synthetic report 3")).toBeNull();
});
it.each([401, 403])("list denial %s clears a warm seed with no automatic retry", async status => {
  state.read.mockRejectedValue(new ReadError("Denied", status)); mount(); fireEvent.click(screen.getByRole("button", {name: "Refresh"}));
  await screen.findByText(/Your access to report history could not be verified/); expect(state.read).toHaveBeenCalledTimes(1); expect(screen.queryByText("Synthetic report 3")).toBeNull();
});
it("late legacy delivery completion cannot appear after an account boundary or retain its cache", async () => {
  let finish!: (value: unknown) => void; state.read.mockResolvedValue(detail()); state.delivery.mockImplementation(() => new Promise(resolve => {finish = resolve;})); const view = mount();
  fireEvent.click(screen.getByRole("button", {name: "View run PERF-RUN-3 details"})); await screen.findByText("Loading isolated deliveries"); const firstClient = state.clients[0] as QueryClient;
  state.read.mockResolvedValue({success: true, data: page([])}); view.replace({authContext: {...context, profile: {...context.profile!, id: 7, auth_user_id: "another-owner"}} as AuthContext}); await screen.findByText("0 runs");
  await act(async () => finish("OLD PRIVATE DELIVERY")); expect(screen.queryByText("OLD PRIVATE DELIVERY")).toBeNull(); expect(firstClient.getQueryCache().getAll()).toHaveLength(0);
});
it("actual supported sort and filter dialogs feed server criteria instead of filtering the loaded page", async () => {
  state.read.mockResolvedValue({success: true, data: page([row(4)])}); mount();
  fireEvent.click(screen.getByRole("button", {name: "Format"})); await screen.findByText("Synthetic report 4");
  expect(state.read.mock.calls[0][1]).toMatchObject({sorting: [{id: "output_format", desc: false}], page: 1});
  fireEvent.click(screen.getByRole("button", {name: "Edit filters"})); fireEvent.change(screen.getByLabelText("Report code"), {target: {value: "PERF_%"}});
  fireEvent.change(screen.getByLabelText("Status"), {target: {value: "failed"}}); fireEvent.click(screen.getByRole("button", {name: "Apply"}));
  await waitFor(() => expect(state.read).toHaveBeenCalledTimes(2)); expect(state.read.mock.calls[1][1]).toMatchObject({page: 1, columnFilters: {report_code: "PERF_%", run_status: "failed"}});
});
it("actual Shift sorting retains all seven ordered columns and directions without silently slicing them", async () => {
  state.read.mockResolvedValue({success: true, data: page([row(4)])}); mount();
  const headers = ["Report", "Run By", "Duration", "Format", "Status", "Rows", "Started"];
  const ids = ["report", "run_by", "duration", "output_format", "run_status", "row_count", "started_at"];
  for (let index = 0; index < headers.length; index++) {
    fireEvent.click(screen.getByRole("button", {name: headers[index]}), {shiftKey: index > 0});
    await waitFor(() => expect(state.read).toHaveBeenCalledTimes(index + 1));
    await screen.findByText("Synthetic report 4");
    expect(state.read.mock.calls[index][1]).toMatchObject({page: 1, sorting: ids.slice(0, index + 1).map(id => ({id, desc: id === "duration" || id === "row_count"}))});
  }
  fireEvent.click(screen.getByRole("button", {name: "Report"}), {shiftKey: true});
  await waitFor(() => expect(state.read).toHaveBeenCalledTimes(8));
  expect(state.read.mock.calls[7][1].sorting).toHaveLength(7); expect(state.read.mock.calls[7][1].sorting[0]).toEqual({id: "report", desc: true});
});
it("literal whitespace survives the actual debounced global search control", async () => {
  state.read.mockResolvedValue({success: true, data: page([])}); mount();
  fireEvent.change(screen.getByPlaceholderText("Search by report, reference, user..."), {target: {value: "  "}});
  await screen.findByText("0 runs"); expect(state.read.mock.calls[0][1].search).toBe("  ");
  fireEvent.change(screen.getByPlaceholderText("Search by report, reference, user..."), {target: {value: "  تقرير_2  "}});
  await waitFor(() => expect(state.read).toHaveBeenCalledTimes(2)); expect(state.read.mock.calls[1][1].search).toBe("  تقرير_2  ");
});
it("overlong search and its stale debounce are never dispatched or silently truncated", async () => {
  state.read.mockResolvedValue({success: true, data: page([])}); mount();
  const search = screen.getByPlaceholderText("Search by report, reference, user...");
  fireEvent.change(search, {target: {value: "x".repeat(201)}}); await screen.findByText(/Could not load report history/);
  expect(screen.queryByText("No report runs found.")).toBeNull();
  expect(screen.getByText("Records could not yet be verified. Check the read status or retry.")).toBeTruthy();
  await act(async () => {await new Promise(resolve => setTimeout(resolve, 300));}); expect(state.read).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", {name: "Retry report history"}));
  await act(async () => {await new Promise(resolve => setTimeout(resolve, 10));}); expect(state.read).not.toHaveBeenCalled();
  fireEvent.change(search, {target: {value: "valid"}}); expect(state.read).not.toHaveBeenCalled();
  await screen.findByText("0 runs"); expect(state.read).toHaveBeenCalledTimes(1); expect(state.read.mock.calls[0][1].search).toBe("valid");
});
it("duration zero from the actual filter dialog remains an explicit accessor filter", async () => {
  state.read.mockResolvedValue({success: true, data: page([{...row(4), duration_ms: null}])}); mount();
  fireEvent.click(screen.getByRole("button", {name: "Edit filters"})); fireEvent.change(screen.getByLabelText("Duration (ms)"), {target: {value: "0"}});
  fireEvent.click(screen.getByRole("button", {name: "Apply"})); await screen.findByText("Synthetic report 4");
  expect(state.read.mock.calls[0][1]).toMatchObject({columnFilters: {duration: "0"}});
});
it("a verified empty first page displays an honest empty result rather than a failure", async () => {
  mount({initialPage: page([])});
  await screen.findByText("No report runs found.");
  expect(screen.getByText("0 runs")).toBeTruthy();
  expect(screen.queryByText("Records could not yet be verified. Check the read status or retry.")).toBeNull();
  expect(screen.queryByRole("button", {name: "Retry report history"})).toBeNull();
  expect(state.read).not.toHaveBeenCalled();
});
