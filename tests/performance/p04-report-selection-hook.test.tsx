// @vitest-environment jsdom
import React from "react";
import {afterEach, expect, it, vi} from "vitest";
import {act, cleanup, renderHook, waitFor} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
const state = vi.hoisted(() => ({read: vi.fn()}));
vi.mock("@/lib/reads/client", async () => ({...await vi.importActual("@/lib/reads/client"), readJson: state.read}));
import {ReadError} from "@/lib/reads/client";
import {useReportSavedFilters} from "@/hooks/use-report-saved-filters";
import {useReportTemplateSelection} from "@/hooks/use-report-template-selection";
import {reportSavedFiltersListSchema, reportSavedFilterDetailCriteriaSchema} from "@/lib/reads/report-saved-filters-schema";
import {reportTemplateSelectionCriteriaSchema} from "@/lib/reads/report-template-selection-schema";
const auth = {profile: {id: 11, auth_user_id: "one"}, isAccountActive: true, accountStatus: "active", roleCodes: [], roleAssignments: [], permissionCodes: ["reports.run", "reports.view"]} as unknown as AuthContext;
const nextAuth = {...auth, profile: {...auth.profile!, id: 12, auth_user_id: "two"}};
const row = {id: 1, report_id: 5, user_profile_id: 11, filter_name: "Synthetic saved filter", is_default: false, is_shared: false, created_at: "2026-10-05T00:00:00Z", updated_at: "2026-10-05T00:00:00Z"};
const template = {id: 1, template_name: "Synthetic template", template_code: "SYN", template_type: "report", is_default: false, governance_status: "approved", visual_editor_engine: null,
  branding_profile_id: 3, branding_profile_name: "Branding", branding_profile_type: "company", company_name: "Synthetic", logo_url: null, owner_company_id: 1, selectable: true};
const response = (resource: string, input: unknown) => {
  if (resource === "report-saved-filters") {
    if ((input as {mode: string}).mode === "detail") {const criteria = reportSavedFilterDetailCriteriaSchema.parse(input); return {success: true, data: {criteria, record: {...row, id: criteria.id, filters_json: {employee_id: "7"}}}};}
    const criteria = reportSavedFiltersListSchema.parse(input), start = (criteria.page - 1) * criteria.pageSize;
    return {success: true, data: {criteria, rows: Array.from({length: Math.min(25, Math.max(0, 30 - start))}, (_, i) => ({...row, id: start + i + 1})), totalCount: 30}};
  }
  const criteria = reportTemplateSelectionCriteriaSchema.parse(input), start = (criteria.page - 1) * criteria.pageSize;
  return {success: true, data: {criteria, rows: Array.from({length: Math.min(25, Math.max(0, 30 - start))}, (_, i) => ({...template, id: start + i + 1})), totalCount: 30,
    selected: criteria.selectedId ? {...template, id: criteria.selectedId} : null}};
};
const clients: QueryClient[] = [];
function wrapper() {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(client);
  return {client, wrapper: ({children}: React.PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>};
}
function mountSaved() {
  const w = wrapper();
  return {...renderHook(({ctx, report, enabled, generation}) => useReportSavedFilters(ctx, report, {enabled, generation}),
    {wrapper: w.wrapper, initialProps: {ctx: auth, report: "SYNTHETIC", enabled: true, generation: "one"}}), client: w.client};
}
function mountTemplate() {
  const w = wrapper();
  return {...renderHook(({ctx, selectedId, enabled, companies}) => useReportTemplateSelection(ctx, {selectedId, enabled, ownerCompanyIds: companies}),
    {wrapper: w.wrapper, initialProps: {ctx: auth, selectedId: 1, enabled: true, companies: [1]}}), client: w.client};
}
afterEach(() => {cleanup(); clients.splice(0).forEach(client => client.clear()); state.read.mockReset();});
it("saved-filter list/detail are separate request-bound reads and no detail remains cached", async () => {
  state.read.mockImplementation(async (r, p) => response(r, p)); const h = mountSaved(); await waitFor(() => expect(h.result.current.ready).toBe(true));
  expect(h.result.current.rows).toHaveLength(25); expect(h.result.current.totalCount).toBe(30); expect(state.read).toHaveBeenCalledTimes(1);
  let result: unknown; await act(async () => {result = await h.result.current.loadFilter(2);});
  expect(result).toMatchObject({success: true, data: {id: 2, filters_json: {employee_id: "7"}}});
  expect(h.client.getQueryCache().getAll().some(q => q.queryKey.includes("detail"))).toBe(false);
  act(() => h.result.current.move(2)); await waitFor(() => expect(h.result.current.rows[0]?.id).toBe(26)); expect(h.result.current.totalCount).toBe(30);
});
it.each(["saved", "template"])("%s invalid→valid debounce and stale/manual retry never dispatch invalid criteria", async kind => {
  state.read.mockRejectedValue(new ReadError("Unavailable", 503)); const h = kind === "saved" ? mountSaved() : mountTemplate();
  await waitFor(() => expect(h.result.current.error).toBeTruthy()); const prior = h.result.current, before = state.read.mock.calls.length;
  act(() => prior.setSearch("x".repeat(201))); act(() => {prior.retry(); h.result.current.retry();});
  await act(async () => {await new Promise(resolve => setTimeout(resolve, 280));}); expect(state.read).toHaveBeenCalledTimes(before);
  state.read.mockImplementation(async (r, p) => response(r, p)); act(() => h.result.current.setSearch(" corrected "));
  act(() => {prior.retry(); h.result.current.retry();}); await waitFor(() => expect(h.result.current.ready).toBe(true));
  expect(state.read.mock.calls.slice(before).every(([, p]) => p.search === " corrected ")).toBe(true);
});
it.each(["saved", "template"])("%s valid manual retry coalesces while fetching", async kind => {
  state.read.mockRejectedValue(new ReadError("Unavailable", 503)); const h = kind === "saved" ? mountSaved() : mountTemplate();
  await waitFor(() => expect(h.result.current.error).toBeTruthy()); const count = state.read.mock.calls.length;
  state.read.mockImplementation(() => new Promise(() => {}));
  act(() => {h.result.current.retry(); h.result.current.retry(); h.result.current.retry();}); await waitFor(() => expect(state.read).toHaveBeenCalledTimes(count + 1));
});
it("saved detail from an old account aborts and cannot return usable data or modify the new owner", async () => {
  let resolveDetail: ((value: unknown) => void) | undefined, detailSignal: AbortSignal | undefined;
  state.read.mockImplementation((r, p, signal) => p.mode === "detail" ? new Promise(resolve => {resolveDetail = resolve; detailSignal = signal;}) : Promise.resolve(response(r, p)));
  const h = mountSaved(); await waitFor(() => expect(h.result.current.ready).toBe(true)); const old = h.result.current;
  let pending: ReturnType<typeof old.loadFilter>; act(() => {pending = old.loadFilter(1);}); await waitFor(() => expect(resolveDetail).toBeDefined());
  h.rerender({ctx: nextAuth, report: "SYNTHETIC", enabled: true, generation: "one"}); await waitFor(() => expect(h.result.current.ready).toBe(true));
  expect(detailSignal?.aborted).toBe(true); await act(async () => {resolveDetail!(response("report-saved-filters", {mode: "detail", reportCode: "SYNTHETIC", id: 1})); expect(await pending!).toEqual({success: false, kind: "retired"});});
  act(() => {old.setSearch("old"); old.move(2); old.retry();}); expect(h.result.current.search).toBe(""); expect(h.result.current.page).toBe(1);
  expect(h.client.getQueryCache().getAll().some(q => q.queryKey.includes(old.owner))).toBe(false);
});
it("saved detail denied by server retires the entire owner; late warm filters do not reappear", async () => {
  state.read.mockImplementation(async (r, p) => {if (p.mode === "detail") throw new ReadError("No access", 403); return response(r, p);});
  const h = mountSaved(); await waitFor(() => expect(h.result.current.ready).toBe(true));
  await act(async () => expect(await h.result.current.loadFilter(1)).toEqual({success: false, kind: "forbidden"}));
  await waitFor(() => expect(h.result.current.denied).toBe(true)); expect(h.result.current.rows).toEqual([]); expect(h.result.current.totalCount).toBeNull();
  const count = state.read.mock.calls.length; act(() => h.result.current.retry()); expect(state.read).toHaveBeenCalledTimes(count); expect(h.client.getQueryCache().getAll()).toHaveLength(0);
});
it("saved detail missing and failing are explicit distinct results without false success", async () => {
  state.read.mockImplementation(async (r, p) => p.mode === "detail" ? {...response(r, p), data: {...response(r, p).data, record: null}} : response(r, p));
  const h = mountSaved(); await waitFor(() => expect(h.result.current.ready).toBe(true));
  await act(async () => expect(await h.result.current.loadFilter(99)).toEqual({success: false, kind: "unavailable"}));
  state.read.mockRejectedValue(new ReadError("Unavailable", 503)); await act(async () => expect(await h.result.current.loadFilter(99)).toEqual({success: false, kind: "failed"}));
  expect(h.result.current.rows).toHaveLength(25);
});
it("saved-filter refresh is read-only and a retired generation cannot refresh current reads", async () => {
  state.read.mockImplementation(async (r, p) => response(r, p)); const h = mountSaved(); await waitFor(() => expect(h.result.current.ready).toBe(true));
  const old = h.result.current; await act(async () => h.result.current.refresh()); expect(state.read).toHaveBeenCalledTimes(2);
  h.rerender({ctx: auth, report: "SYNTHETIC", enabled: true, generation: "two"}); await waitFor(() => expect(h.result.current.ready).toBe(true));
  const count = state.read.mock.calls.length; await act(async () => old.refresh()); expect(state.read).toHaveBeenCalledTimes(count);
});
it("saved parent denial aborts pending detail and leaves parent draft untouched by any callback", async () => {
  let signal: AbortSignal | undefined;
  state.read.mockImplementation((r, p, s) => p.mode === "detail" ? new Promise(() => {signal = s;}) : Promise.resolve(response(r, p)));
  const h = mountSaved(); await waitFor(() => expect(h.result.current.ready).toBe(true)); let result: unknown;
  act(() => {void h.result.current.loadFilter(1).then(value => {result = value;});}); await waitFor(() => expect(signal).toBeDefined());
  h.rerender({ctx: auth, report: "SYNTHETIC", enabled: false, generation: "one"}); await waitFor(() => expect(signal?.aborted).toBe(true));
  await waitFor(() => expect(result).toEqual({success: false, kind: "retired"})); expect(h.result.current.rows).toEqual([]); expect(h.result.current.totalCount).toBeNull();
});
it("template selection remains verified and inactive historical metadata is never selectable", async () => {
  state.read.mockImplementation(async (r, p) => {const result = response(r, p); return {...result, data: {...result.data, selected: {...template, id: 900, selectable: false}}};});
  const h = mountTemplate(); h.rerender({ctx: auth, selectedId: 900, enabled: true, companies: [1]});
  await waitFor(() => expect(h.result.current.ready).toBe(true)); expect(h.result.current.selected).toMatchObject({id: 900, selectable: false}); expect(h.result.current.getSelectedNow()).toBeNull();
});
it("template selected metadata stays separate when paging, without a 500/1000 cap", async () => {
  state.read.mockImplementation(async (r, p) => response(r, p)); const h = mountTemplate(); await waitFor(() => expect(h.result.current.ready).toBe(true));
  expect(h.result.current.getSelectedNow()?.id).toBe(1); act(() => h.result.current.move(2));
  await waitFor(() => expect(h.result.current.rows[0]?.id).toBe(26)); expect(h.result.current.getSelectedNow()?.id).toBe(1);
});
it("old template selection/controls are inert after an account or company change", async () => {
  state.read.mockImplementation(async (r, p) => response(r, p)); const h = mountTemplate(); await waitFor(() => expect(h.result.current.ready).toBe(true)); const old = h.result.current;
  h.rerender({ctx: nextAuth, selectedId: 1, enabled: true, companies: [2]}); await waitFor(() => expect(h.result.current.ready).toBe(true));
  expect(old.getSelectedNow()).toBeNull(); act(() => {old.setSearch("old"); old.move(2); old.retry();});
  expect(h.result.current.search).toBe(""); expect(h.result.current.page).toBe(1); expect(h.client.getQueryCache().getAll().some(q => q.queryKey.includes(old.owner))).toBe(false);
});
it("template denial cancels/removes all payload and cannot be undone with Retry", async () => {
  state.read.mockRejectedValue(new ReadError("No access", 403)); const h = mountTemplate(); await waitFor(() => expect(h.result.current.denied).toBe(true));
  expect(h.result.current.rows).toEqual([]); expect(h.result.current.selected).toBeNull(); expect(h.result.current.totalCount).toBeNull(); expect(h.result.current.getSelectedNow()).toBeNull();
  const count = state.read.mock.calls.length; act(() => h.result.current.retry()); expect(state.read).toHaveBeenCalledTimes(count); expect(h.client.getQueryCache().getAll()).toHaveLength(0);
});
it.each(["saved", "template"])("%s response criteria mismatch is error, never successful empty list", async kind => {
  state.read.mockImplementation(async (r, p) => response(r, {...p, search: "wrong"})); const h = kind === "saved" ? mountSaved() : mountTemplate();
  await waitFor(() => expect(h.result.current.error).toBeTruthy()); expect(h.result.current.ready).toBe(false); expect(h.result.current.totalCount).toBeNull();
});
it.each(["saved", "template"])("%s unmount cancels pending request and retires cached reads", async kind => {
  let signal: AbortSignal | undefined;
  state.read.mockImplementation((_r, _p, s) => {signal = s; return new Promise(() => {});}); const h = kind === "saved" ? mountSaved() : mountTemplate();
  await waitFor(() => expect(signal).toBeDefined()); h.unmount(); expect(signal?.aborted).toBe(true); expect(h.client.getQueryCache().getAll()).toHaveLength(0);
});
it.each(["account-return", "enable-return"])("saved-filter %s does not re-admit old callbacks or pending detail", async transition => {
  let resolveDetail: ((value: unknown) => void) | undefined;
  state.read.mockImplementation((r, p) => p.mode === "detail" ? new Promise(resolve => {resolveDetail = resolve;}) : Promise.resolve(response(r, p)));
  const h = mountSaved(); await waitFor(() => expect(h.result.current.ready).toBe(true)); const old = h.result.current;
  let pending: ReturnType<typeof old.loadFilter>; act(() => {pending = old.loadFilter(1);}); await waitFor(() => expect(resolveDetail).toBeDefined());
  h.rerender({ctx: transition === "account-return" ? nextAuth : auth, report: "SYNTHETIC", enabled: transition !== "enable-return", generation: "one"});
  h.rerender({ctx: auth, report: "SYNTHETIC", enabled: true, generation: "one"}); await waitFor(() => expect(h.result.current.ready).toBe(true));
  expect(h.result.current.owner).not.toBe(old.owner); const before = state.read.mock.calls.length;
  act(() => {old.setSearch("old"); old.move(2); old.retry();}); await act(async () => {await old.refresh(); expect(await old.loadFilter(1)).toEqual({success: false, kind: "retired"});});
  await act(async () => {resolveDetail!(response("report-saved-filters", {mode: "detail", reportCode: "SYNTHETIC", id: 1})); expect(await pending!).toEqual({success: false, kind: "retired"});});
  expect(state.read).toHaveBeenCalledTimes(before); expect(h.result.current.search).toBe(""); expect(h.result.current.page).toBe(1);
});
it.each(["account-return", "enable-return"])("template %s does not re-admit a previous selection or Retry", async transition => {
  state.read.mockImplementation(async (r, p) => response(r, p)); const h = mountTemplate(); await waitFor(() => expect(h.result.current.ready).toBe(true)); const old = h.result.current;
  h.rerender({ctx: transition === "account-return" ? nextAuth : auth, selectedId: 1, enabled: transition !== "enable-return", companies: [1]});
  h.rerender({ctx: auth, selectedId: 1, enabled: true, companies: [1]}); await waitFor(() => expect(h.result.current.ready).toBe(true));
  expect(h.result.current.owner).not.toBe(old.owner); expect(old.getSelectedNow()).toBeNull(); const before = state.read.mock.calls.length;
  act(() => {old.setSearch("old"); old.move(2); old.retry();}); expect(state.read).toHaveBeenCalledTimes(before); expect(h.result.current.search).toBe("");
});
it("layout-unmount callbacks are retired before passive cleanup", async () => {
  state.read.mockImplementation(async (r, p) => response(r, p)); const w = wrapper(); let result: unknown;
  const retained: {retry?: () => void; load?: () => Promise<unknown>} = {};
  const h = renderHook(() => {
    const saved = useReportSavedFilters(auth, "SYNTHETIC");
    React.useLayoutEffect(() => () => {retained.retry?.(); void retained.load?.().then(value => {result = value;});}, []);
    return saved;
  }, {wrapper: w.wrapper});
  await waitFor(() => expect(h.result.current.ready).toBe(true)); retained.retry = h.result.current.retry; const oldLoad = h.result.current.loadFilter; retained.load = () => oldLoad(1); const count = state.read.mock.calls.length;
  h.unmount(); await waitFor(() => expect(result).toEqual({success: false, kind: "retired"})); expect(state.read).toHaveBeenCalledTimes(count);
});
