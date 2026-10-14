// @vitest-environment jsdom
import React from "react";
import {afterEach, expect, it, vi} from "vitest";
import {act, cleanup, renderHook, waitFor} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
const state = vi.hoisted(() => ({read: vi.fn(), change: vi.fn()}));
vi.mock("@/lib/reads/client", async () => ({...await vi.importActual("@/lib/reads/client"), readJson: state.read}));
import {useReportCriteria} from "@/hooks/use-report-criteria";
import {ReadError} from "@/lib/reads/client";
import {reportCriteriaSchema} from "@/lib/reads/report-criteria-schema";
import {invalidateHrEmployees} from "@/lib/query/invalidation";
const context = {profile: {id: 31, auth_user_id: "one"}, isAccountActive: true, accountStatus: "active", roleCodes: [], roleAssignments: [], permissionCodes: ["reports.run", "hr.employees.view"]} as unknown as AuthContext;
const clients: QueryClient[] = [];
const response = (input: unknown, label = "Synthetic") => {const criteria = reportCriteriaSchema.parse(input), row = {value: 1, label, code: null}; return {success: true, data: {criteria, rows: [row], totalCount: 1, selected: criteria.selectedId === 1 ? row : null}};};
const pagedResponse = (input: unknown) => {
  const criteria = reportCriteriaSchema.parse(input), start = (criteria.page - 1) * criteria.pageSize;
  const option = (value: number) => ({value, label: `Synthetic ${value}`, code: null});
  return {success: true, data: {criteria, rows: Array.from({length: Math.min(criteria.pageSize, Math.max(0, 51 - start))}, (_, index) => option(start + index + 1)),
    totalCount: 51, selected: criteria.selectedId ? option(criteria.selectedId) : null}};
};
function mount(filters: Record<string, string> = {}) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(client);
  const hook = renderHook(({auth, values}) => useReportCriteria(auth, "SYNTHETIC_REPORT", ["employee_id", "owner_company_id"], values, state.change),
    {initialProps: {auth: context, values: filters}, wrapper: ({children}: React.PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>});
  return {...hook, client};
}
afterEach(() => {cleanup(); clients.splice(0).forEach(client => client.clear()); state.read.mockReset(); state.change.mockReset();});
it("a retained manual Retry does not dispatch unvalidated unsettled search criteria", async () => {
  state.read.mockRejectedValue(new ReadError("Unavailable", 503)); const view = mount({employee_id: "1"});
  await waitFor(() => expect(view.result.current.fields.employee_id?.error).toBe(true)); const old = view.result.current.fields.employee_id!, before = state.read.mock.calls.length;
  act(() => old.search("x".repeat(201))); act(() => {old.retry(); view.result.current.fields.employee_id!.retry();});
  await act(async () => {await new Promise(resolve => setTimeout(resolve, 280));}); expect(state.read).toHaveBeenCalledTimes(before);
  state.read.mockImplementation(async (_r, p) => response(p)); act(() => view.result.current.fields.employee_id!.search("corrected"));
  await waitFor(() => expect(view.result.current.fields.employee_id?.ready).toBe(true)); expect(state.read.mock.calls.every(([, p]) => p.search.length <= 200)).toBe(true);
});
it("old selected/clear callbacks cannot affect another principal's current form", async () => {
  state.read.mockImplementation(async (_r, p) => response(p)); const view = mount({employee_id: "1"}); await waitFor(() => expect(view.result.current.fields.employee_id?.ready).toBe(true));
  const old = view.result.current.fields.employee_id!; view.rerender({auth: {...context, profile: {...context.profile!, id: 32, auth_user_id: "two"}}, values: {employee_id: "1"}});
  await waitFor(() => expect(view.result.current.fields.employee_id?.ready).toBe(true)); act(() => {old.select(1); old.select(null); old.search("OLD"); old.retry();});
  expect(state.change).not.toHaveBeenCalled(); expect(state.read.mock.calls.some(([, p]) => p.search === "OLD")).toBe(false);
});
it("old selected/clear callbacks cannot affect a new company dependency in the same principal", async () => {
  state.read.mockImplementation(async (_r, p) => response(p)); const view = mount({employee_id: "1", owner_company_id: "1"}); await waitFor(() => expect(view.result.current.fields.employee_id?.ready).toBe(true));
  const old = view.result.current.fields.employee_id!; view.rerender({auth: context, values: {employee_id: "1", owner_company_id: "2"}});
  await waitFor(() => expect(view.result.current.fields.employee_id?.ready).toBe(true)); act(() => {old.select(1); old.select(null);}); expect(state.change).not.toHaveBeenCalled();
  act(() => view.result.current.fields.employee_id!.select(null)); expect(state.change).toHaveBeenCalledWith("employee_id", "");
});
it("repeated retry coalesces a pending current lookup instead of dispatching duplicates", async () => {
  state.read.mockRejectedValue(new ReadError("Unavailable", 503)); const view = mount({employee_id: "1"}); await waitFor(() => expect(view.result.current.fields.employee_id?.error).toBe(true));
  const before = state.read.mock.calls.length; state.read.mockImplementation(() => new Promise(() => {}));
  act(() => {view.result.current.fields.employee_id!.retry(); view.result.current.fields.employee_id!.retry(); view.result.current.fields.employee_id!.retry();});
  await waitFor(() => expect(state.read).toHaveBeenCalledTimes(before + 1));
});
it.each(["account", "dependency", "search", "invalid search", "page", "selected ID"])("%s ABA never re-admits retained criteria controls", async transition => {
  state.read.mockImplementation(async (_r, p) => pagedResponse(p));
  const values: Record<string, string> = {employee_id: "1", ...(transition === "dependency" ? {owner_company_id: "1"} : {})};
  const view = mount(values); await waitFor(() => expect(view.result.current.fields.employee_id?.ready).toBe(true));
  const old = view.result.current.fields.employee_id!;
  if (transition === "account") {
    view.rerender({auth: {...context, profile: {...context.profile!, id: 32, auth_user_id: "two"}}, values});
    await waitFor(() => expect(view.result.current.fields.employee_id?.ready).toBe(true));
    view.rerender({auth: context, values});
  } else if (transition === "dependency" || transition === "selected ID") {
    view.rerender({auth: context, values: {...values, [transition === "dependency" ? "owner_company_id" : "employee_id"]: "2"}});
    await waitFor(() => expect(view.result.current.fields.employee_id?.ready).toBe(true));
    view.rerender({auth: context, values});
  } else if (transition === "page") {
    act(() => view.result.current.fields.employee_id!.move(2));
    await waitFor(() => {expect(view.result.current.fields.employee_id?.page).toBe(2); expect(view.result.current.fields.employee_id?.ready).toBe(true);});
    act(() => view.result.current.fields.employee_id!.move(1));
  } else {
    act(() => view.result.current.fields.employee_id!.search(transition === "invalid search" ? "x".repeat(201) : "other"));
    if (transition === "invalid search") expect(view.result.current.fields.employee_id?.invalid).toBe(true);
    else await waitFor(() => {expect(state.read.mock.calls.some(([, p]) => p.search === "other")).toBe(true); expect(view.result.current.fields.employee_id?.ready).toBe(true);});
    act(() => view.result.current.fields.employee_id!.search(""));
  }
  await waitFor(() => expect(view.result.current.fields.employee_id?.ready).toBe(true));
  const before = state.read.mock.calls.length;
  await act(async () => {old.select(1); old.select(null); old.move(2); old.search("RETIRED"); old.retry();});
  expect(state.change).not.toHaveBeenCalled(); expect(view.result.current.fields.employee_id?.page).toBe(1); expect(view.result.current.fields.employee_id?.ready).toBe(true);
  await act(async () => {await new Promise(resolve => setTimeout(resolve, 280));}); expect(state.read).toHaveBeenCalledTimes(before);
  act(() => view.result.current.fields.employee_id!.select(1)); expect(state.change).toHaveBeenCalledWith("employee_id", "1");
  act(() => view.result.current.fields.employee_id!.select(null)); expect(state.change).toHaveBeenLastCalledWith("employee_id", "");
  if (transition === "account") expect(view.result.current.fields.employee_id?.owner).not.toBe(old.owner);
  else expect(view.result.current.fields.employee_id?.owner).toBe(old.owner);
});
it.each(["account", "date filter"])("%s ABA retires a captured run guard while current authorization remains usable", async transition => {
  state.read.mockImplementation(async (_r, p) => response(p)); const values = {employee_id: "1", date_from: "2026-10-01"}, view = mount(values);
  await waitFor(() => expect(view.result.current.canRun).toBe(true)); const oldCanRun = view.result.current.canRunNow, before = state.read.mock.calls.length;
  view.rerender({auth: transition === "account" ? {...context, profile: {...context.profile!, id: 32, auth_user_id: "two"}} : context,
    values: transition === "date filter" ? {...values, date_from: "2026-10-02"} : values});
  await waitFor(() => expect(view.result.current.canRun).toBe(true)); view.rerender({auth: context, values});
  await waitFor(() => expect(view.result.current.canRunNow()).toBe(true)); expect(oldCanRun()).toBe(false);
  if (transition === "date filter") expect(state.read).toHaveBeenCalledTimes(before);
});
it.each([401, 403])("terminal %s retires warm clear/search/page/retry callbacks and their cached payload", async status => {
  state.read.mockImplementation(async (_r, p) => pagedResponse(p)); const view = mount({employee_id: "1"});
  await waitFor(() => expect(view.result.current.fields.employee_id?.ready).toBe(true)); const old = view.result.current.fields.employee_id!;
  state.read.mockRejectedValue(new ReadError("No access", status)); await act(async () => {await view.client.invalidateQueries({queryKey: ["reports", "criteria"]});});
  await waitFor(() => expect(view.result.current.ownerDenied).toBe(true)); const before = state.read.mock.calls.length;
  await act(async () => {old.select(null); old.search("RETIRED"); old.move(2); old.retry(); view.result.current.fields.employee_id!.select(null);});
  expect(state.change).not.toHaveBeenCalled(); expect(view.result.current.fields.employee_id?.options).toEqual([]); expect(view.result.current.canRunNow()).toBe(false);
  expect(view.client.getQueryCache().getAll()).toHaveLength(0); expect(state.read).toHaveBeenCalledTimes(before);
});
it.each(["restricted", "failed", "invalid"])("a current %s optional selection remains clearable without mutating unrelated filters", async mode => {
  state.read.mockImplementation(async (_r, input) => mode === "restricted" ? {success: true, data: {criteria: reportCriteriaSchema.parse(input), availability: "restricted"}} : response(input));
  if (mode === "failed") state.read.mockRejectedValue(new ReadError("Unavailable", 503));
  const values = {employee_id: mode === "invalid" ? "invalid" : "1", date_from: "2026-10-01"}, view = mount(values);
  await waitFor(() => expect(mode === "restricted" ? view.result.current.fields.employee_id?.denied : mode === "failed" ? view.result.current.fields.employee_id?.error : view.result.current.fields.employee_id?.invalid).toBe(true));
  expect(view.result.current.ownerDenied).toBe(false); expect(view.result.current.canRun).toBe(false);
  act(() => view.result.current.fields.employee_id!.select(null)); expect(state.change).toHaveBeenCalledExactlyOnceWith("employee_id", ""); expect(values.date_from).toBe("2026-10-01");
  view.rerender({auth: context, values: {date_from: "2026-10-01"}}); await waitFor(() => expect(view.result.current.canRunNow()).toBe(true));
});
it("layout-unmount retires captured controls before another cleanup can mutate or refetch", async () => {
  state.read.mockImplementation(async (_r, p) => response(p)); const client = new QueryClient({defaultOptions: {queries: {retry: false}}}); clients.push(client);
  const retained: {control?: ReturnType<typeof useReportCriteria>; allowed?: boolean} = {};
  const view = renderHook(() => {
    const control = useReportCriteria(context, "SYNTHETIC_REPORT", ["employee_id"], {employee_id: "1"}, state.change);
    React.useLayoutEffect(() => () => {
      retained.allowed = retained.control?.canRunNow(); const field = retained.control?.fields.employee_id;
      field?.select(null); field?.search("RETIRED"); field?.retry();
    }, []);
    return control;
  }, {wrapper: ({children}: React.PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>});
  await waitFor(() => expect(view.result.current.fields.employee_id?.ready).toBe(true)); retained.control = view.result.current; const before = state.read.mock.calls.length;
  view.unmount(); expect(retained.allowed).toBe(false); expect(state.change).not.toHaveBeenCalled(); expect(state.read).toHaveBeenCalledTimes(before); expect(client.getQueryCache().getAll()).toHaveLength(0);
});
it("closing one report instance aborts its pending lookup without retiring another instance", async () => {
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}}); clients.push(client);
  const wrapper = ({children}: React.PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  let signal: AbortSignal | undefined, finish: (() => void) | undefined;
  state.read.mockImplementationOnce((_r, input, current: AbortSignal) => new Promise(resolve => {signal = current; finish = () => resolve(response(input));}))
    .mockImplementation(async (_r, input) => response(input));
  const first = renderHook(() => useReportCriteria(context, "SYNTHETIC_REPORT", ["employee_id"], {employee_id: "1"}, state.change), {wrapper});
  await waitFor(() => expect(signal).toBeDefined());
  const second = renderHook(() => useReportCriteria(context, "SYNTHETIC_REPORT", ["employee_id"], {employee_id: "1"}, state.change), {wrapper});
  await waitFor(() => expect(second.result.current.fields.employee_id?.ready).toBe(true)); first.unmount(); expect(signal?.aborted).toBe(true);
  await act(async () => {finish!();}); expect(second.result.current.canRunNow()).toBe(true); expect(client.getQueryCache().getAll()).toHaveLength(1);
  act(() => second.result.current.fields.employee_id!.select(null)); expect(state.change).toHaveBeenCalledExactlyOnceWith("employee_id", "");
});
it.each([401, 403, "restricted"] as const)("one instance's %s response preserves its sibling's tracked authorization and refresh", async mode => {
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}}); clients.push(client);
  const wrapper = ({children}: React.PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const useChoices = () => useReportCriteria(context, "SYNTHETIC_REPORT", ["employee_id"], {employee_id: "1"}, state.change);
  state.read.mockImplementation(async (_r, input) => response(input));
  const first = renderHook(useChoices, {wrapper}); await waitFor(() => expect(first.result.current.fields.employee_id?.ready).toBe(true));
  const firstKey = client.getQueryCache().getAll()[0].queryKey;
  const second = renderHook(useChoices, {wrapper}); await waitFor(() => expect(second.result.current.fields.employee_id?.ready).toBe(true));
  const secondKey = client.getQueryCache().getAll().find(query => query.queryKey !== firstKey)!.queryKey;
  // Settle both initial debounce effects so a later incidental render cannot
  // reconnect a detached sibling observer and conceal the missed invalidation.
  await act(async () => {await new Promise(resolve => setTimeout(resolve, 280));});
  state.read.mockImplementationOnce(async (_r, input) => {
    if (typeof mode === "number") throw new ReadError("No access", mode);
    return {success: true, data: {criteria: reportCriteriaSchema.parse(input), availability: "restricted"}};
  });
  await act(async () => {await client.invalidateQueries({queryKey: firstKey, exact: true});});
  await waitFor(() => expect(first.result.current.fields.employee_id?.denied).toBe(true));
  expect(first.result.current.ownerDenied).toBe(typeof mode === "number"); expect(first.result.current.canRunNow()).toBe(false);
  expect(first.result.current.fields.employee_id?.options).toEqual([]); expect(client.getQueryData(firstKey)).toBeUndefined();
  expect(second.result.current.fields.employee_id?.ready).toBe(true); expect(second.result.current.canRunNow()).toBe(true);
  expect.soft(client.getQueryState(secondKey)).toBeDefined();
  state.read.mockImplementation(async (_r, input) => response(input, "Updated sibling choice")); const before = state.read.mock.calls.length;
  await act(async () => {invalidateHrEmployees(client); await new Promise(resolve => setTimeout(resolve, 0));});
  await waitFor(() => expect(second.result.current.fields.employee_id?.options[0]?.label).toBe("Updated sibling choice"));
  expect(state.read).toHaveBeenCalledTimes(before + 1); expect(second.result.current.canRunNow()).toBe(true);
  act(() => first.result.current.fields.employee_id!.select(null));
  if (mode === "restricted") expect(state.change).toHaveBeenCalledExactlyOnceWith("employee_id", "");
  else expect(state.change).not.toHaveBeenCalled();
});
