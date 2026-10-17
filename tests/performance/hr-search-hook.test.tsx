// @vitest-environment jsdom
import React from "react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {act, cleanup, renderHook, waitFor} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
import {useHrSearchResults, useHrSearchSuggestions} from "@/hooks/use-hr-search-read";
import {ReadError} from "@/lib/reads/client";
const m = vi.hoisted(() => ({read: vi.fn()}));
vi.mock("@/lib/reads/client", async original => ({...await original<typeof import("@/lib/reads/client")>(), readJson: m.read}));
const auth = (id = 1, codes = ["hr.employees.view"]): AuthContext => ({profile: {
  id, auth_user_id: `synthetic-${id}`, must_change_password: false, avatar_url: null, branch_id: null, created_at: "2026-10-05T00:00:00Z",
  department: null, display_name: null, email_confirmed_by_admin_at: null, email_confirmed_by_admin_id: null, employee_reference: null,
  full_name: null, job_title: null, last_admin_updated_at: null, last_password_security_action: null, last_password_security_action_at: null,
  last_password_security_action_by: null, manager_user_profile_id: null, must_change_password_reason: null, notes: null, owner_company_id: null,
  password_changed_at: null, password_reset_sent_at: null, password_set_by_admin_at: null, phone: null, preferred_language: null, status: "active",
  timezone: null, updated_at: "2026-10-05T00:00:00Z", user_code: null,
}, email: null, isAccountActive: true, accountStatus: "active", roleCodes: [], permissionCodes: codes, globalPermissionCodes: codes});
const a = auth(), b = auth(2);
function setup() {const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); return {client, wrapper: ({children}: React.PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>};}
function empty(criteria: Record<string, unknown>) {return {success: true, data: criteria.mode === "results"
  ? {criteria, results: [], totalCount: 0, groupCounts: {}, hasMore: false, ordering: "category-entity-id-v1", countScope: "authorized-matches"}
  : {criteria, rows: [], kind: "quick-suggestions", complete: false, limit: 8}};}
function deferred<T>() {let resolve!: (v: T) => void; const promise = new Promise<T>(r => {resolve = r;}); return {promise, resolve};}
beforeEach(() => {vi.clearAllMocks(); m.read.mockImplementation(async (_resource, criteria) => empty(criteria));});
afterEach(cleanup);
it("full results stay lazy until explicit criteria are committed; denied accounts never dispatch", async () => {
  const {wrapper} = setup(); const none = renderHook(() => useHrSearchResults(a, null), {wrapper}); const denied = renderHook(() => useHrSearchResults(auth(1, []), {query: "name"}), {wrapper});
  act(() => {none.result.current.retry(); denied.result.current.retry();}); expect(m.read).not.toHaveBeenCalled(); expect(denied.result.current.denied).toBe(true);
});
it("only matching successful complete criteria become ready; full search has no per-keypress dispatch", async () => {
  const {wrapper} = setup(); const {result, rerender} = renderHook(({query}) => useHrSearchResults(a, {query}), {initialProps: {query: " a "}, wrapper});
  await waitFor(() => expect(result.current.ready).toBe(true)); expect(m.read).toHaveBeenCalledTimes(1); expect(m.read.mock.calls[0][1].query).toBe(" a ");
  rerender({query: " a "}); expect(m.read).toHaveBeenCalledTimes(1);
});
it("suggestions debounce first open and every changed literal query without leaking prior rows", async () => {
  const {wrapper} = setup(); const {result, rerender} = renderHook(({query}) => useHrSearchSuggestions(a, query, true), {initialProps: {query: " a "}, wrapper});
  expect(m.read).not.toHaveBeenCalled(); await waitFor(() => expect(result.current.ready).toBe(true)); m.read.mockClear();
  rerender({query: " x"}); rerender({query: " x "}); expect(result.current.data).toBeUndefined(); expect(m.read).not.toHaveBeenCalled();
  await waitFor(() => expect(result.current.ready).toBe(true)); expect(m.read).toHaveBeenCalledTimes(1); expect(m.read.mock.calls[0][1].query).toBe(" x ");
});
it("invalid immediate and settled suggestions never dispatch through automatic or retained manual retry", async () => {
  const {wrapper} = setup(); const {result, rerender} = renderHook(({query}) => useHrSearchSuggestions(a, query, true), {initialProps: {query: "valid"}, wrapper});
  await waitFor(() => expect(result.current.ready).toBe(true)); const old = result.current;
  rerender({query: "x".repeat(201)}); await act(async () => {await new Promise(r => setTimeout(r, 300));}); m.read.mockClear(); act(() => {old.retry(); result.current.retry();}); expect(m.read).not.toHaveBeenCalled();
  rerender({query: "valid again"}); act(() => result.current.retry()); expect(m.read).not.toHaveBeenCalled();
  await waitFor(() => expect(result.current.ready).toBe(true)); expect(m.read).toHaveBeenCalledTimes(1); expect(m.read.mock.calls[0][1].query).toBe("valid again");
});
it("unsupported filters fail before transport, and valid correction permits a new read", async () => {
  const {wrapper} = setup(); const {result, rerender} = renderHook(({workSiteId}) => useHrSearchResults(a, {query: "name", workSiteId}), {initialProps: {workSiteId: 4 as number | undefined}, wrapper});
  expect(result.current.issue).toContain("Work-site"); act(() => result.current.retry()); expect(m.read).not.toHaveBeenCalled();
  rerender({workSiteId: undefined}); await waitFor(() => expect(result.current.ready).toBe(true)); expect(m.read).toHaveBeenCalledTimes(1);
});
it.each(["identity", "enabled", "criteria"])("a retired %s callback never revives through A→B→A", async kind => {
  const {wrapper} = setup(); const {result, rerender} = renderHook(({actor, enabled, query}) => useHrSearchResults(actor, enabled ? {query} : null),
    {initialProps: {actor: a, enabled: true, query: "first"}, wrapper});
  await waitFor(() => expect(result.current.ready).toBe(true)); const old = result.current;
  rerender({actor: kind === "identity" ? b : a, enabled: kind !== "enabled", query: kind === "criteria" ? "second" : "first"});
  if (kind !== "enabled") await waitFor(() => expect(result.current.ready).toBe(true));
  rerender({actor: a, enabled: true, query: "first"}); await waitFor(() => expect(result.current.ready).toBe(true)); m.read.mockClear();
  act(() => old.retry()); expect(old.isCurrent()).toBe(false); expect(m.read).not.toHaveBeenCalled();
  act(() => result.current.retry()); await waitFor(() => expect(m.read).toHaveBeenCalledTimes(1));
});
it("closing and reopening suggestions retires the old generation and delayed open work", async () => {
  const {wrapper} = setup(); const {result, rerender} = renderHook(({enabled}) => useHrSearchSuggestions(a, "name", enabled), {initialProps: {enabled: true}, wrapper});
  await waitFor(() => expect(result.current.ready).toBe(true)); const old = result.current;
  rerender({enabled: false}); rerender({enabled: true}); act(() => old.retry()); await waitFor(() => expect(result.current.ready).toBe(true)); m.read.mockClear();
  act(() => old.retry()); expect(old.isCurrent()).toBe(false); expect(m.read).not.toHaveBeenCalled();
});
it("an account or scope change aborts the old read and its late response cannot repopulate cache", async () => {
  const pending = deferred<unknown>(); let originalCriteria: Record<string, unknown> = {};
  m.read.mockImplementationOnce((_resource, criteria) => {originalCriteria = criteria; return pending.promise;});
  const {wrapper, client} = setup(); const {result, rerender} = renderHook(({actor}) => useHrSearchResults(actor, {query: "name"}), {initialProps: {actor: a}, wrapper});
  await waitFor(() => expect(m.read).toHaveBeenCalledTimes(1)); const signal = m.read.mock.calls[0][2] as AbortSignal;
  rerender({actor: {...a, roleAssignments: [{roleId: 7, roleCode: "test", ownerCompanyId: 2, branchId: 3, permissionCodes: ["hr.employees.view"]}]}});
  await waitFor(() => expect(result.current.ready).toBe(true)); expect(signal.aborted).toBe(true); const owner = result.current.owner;
  await act(async () => pending.resolve(empty(originalCriteria))); expect(result.current.owner).toBe(owner); expect(client.getQueryCache().getAll()).toHaveLength(1);
});
it("layout unmount retires old callbacks before consuming component cleanup and clears private cache", async () => {
  const {wrapper, client} = setup(); const retained: {current?: () => boolean; retry?: () => void} = {}; let seen: boolean | undefined;
  const h = renderHook(() => {const read = useHrSearchResults(a, {query: "name"}); React.useLayoutEffect(() => () => {seen = retained.current?.(); retained.retry?.();}, []); return read;}, {wrapper});
  await waitFor(() => expect(h.result.current.ready).toBe(true)); retained.current = h.result.current.isCurrent; retained.retry = h.result.current.retry; m.read.mockClear(); h.unmount();
  expect(seen).toBe(false); expect(m.read).not.toHaveBeenCalled(); expect(client.getQueryCache().getAll()).toHaveLength(0);
});
it("permission denial is terminal for that lifetime, removes data and blocks manual retry", async () => {
  m.read.mockRejectedValue(new ReadError("PRIVATE", 403)); const {wrapper, client} = setup(); const {result} = renderHook(() => useHrSearchResults(a, {query: "name"}), {wrapper});
  await waitFor(() => expect(result.current.denied).toBe(true)); expect(result.current.data).toBeUndefined(); expect(result.current.ready).toBe(false); const count = m.read.mock.calls.length;
  act(() => result.current.retry()); expect(m.read).toHaveBeenCalledTimes(count); expect(client.getQueryCache().getAll().every(q => q.state.data === undefined)).toBe(true);
});
it("valid manual retry is single-flight and can recover without a false zero result", async () => {
  m.read.mockRejectedValueOnce(new ReadError("unavailable", 400)); const {wrapper} = setup(); const {result} = renderHook(() => useHrSearchResults(a, {query: "name"}), {wrapper});
  await waitFor(() => expect(result.current.error).toBeTruthy()); expect(result.current.data).toBeUndefined(); const pending = deferred<unknown>(); let criteria: Record<string, unknown> = {};
  m.read.mockImplementationOnce((_resource, p) => {criteria = p; return pending.promise;}); act(() => {result.current.retry(); result.current.retry();});
  expect(m.read).toHaveBeenCalledTimes(2); await act(async () => pending.resolve(empty(criteria))); await waitFor(() => expect(result.current.ready).toBe(true));
});
it("mismatched response criteria and fabricated incomplete result counts never become successful data", async () => {
  m.read.mockImplementation(async (_resource, criteria) => empty({...criteria, query: "wrong"})); const {wrapper} = setup(); const {result} = renderHook(() => useHrSearchResults(a, {query: "name"}), {wrapper});
  await waitFor(() => expect(result.current.error).toBeTruthy()); expect(result.current.data).toBeUndefined(); expect(result.current.ready).toBe(false);
});
