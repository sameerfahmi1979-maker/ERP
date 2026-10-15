// @vitest-environment jsdom
import React from "react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {act, cleanup, renderHook, waitFor} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
import {syntheticAuthContext} from "./fixtures/auth-context";
import {useDmsApprovalQueue, useDmsApprovalHistory} from "@/hooks/use-dms-approvals";
import {ReadError} from "@/lib/reads/client";
const mocks = vi.hoisted(() => ({read: vi.fn()}));
vi.mock("@/lib/reads/client", async original => ({...await original<typeof import("@/lib/reads/client")>(), readJson: mocks.read}));
function auth(id = 1, allowed = true): AuthContext {return syntheticAuthContext(allowed ? ["dms.approvals.view"] : [], {id, auth_user_id: `synthetic-${id}`});}
const a = auth(), b = auth(2);
function wrapper() {const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); return {client, wrap: ({children}: React.PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>};}
function deferred<T>() {let resolve!: (v: T) => void; const promise = new Promise<T>(r => {resolve = r;}); return {promise, resolve};}
const empty = (criteria: unknown) => ({success: true, data: {criteria, rows: [], totalCount: 0}});
beforeEach(() => {vi.clearAllMocks(); mocks.read.mockImplementation(async (_path, criteria) => empty(criteria));});
afterEach(cleanup);
it("reuses only one mounted owner and coalesces literal criteria", async () => {
  const {wrap} = wrapper(); const {result, rerender} = renderHook(({search}) => useDmsApprovalQueue(a, {search}), {initialProps: {search: ""}, wrapper: wrap});
  await waitFor(() => expect(result.current.ready).toBe(true)); mocks.read.mockClear();
  rerender({search: " a"}); rerender({search: " a "}); expect(result.current.data).toBeUndefined(); expect(mocks.read).not.toHaveBeenCalled();
  await waitFor(() => expect(result.current.ready).toBe(true)); expect(mocks.read).toHaveBeenCalledTimes(1); expect(mocks.read.mock.calls[0][1].search).toBe(" a ");
});
it("rejects immediate invalid search and stale settled invalid search, including retained/manual retries", async () => {
  const {wrap} = wrapper(); const {result, rerender} = renderHook(({search}) => useDmsApprovalQueue(a, {search}), {initialProps: {search: ""}, wrapper: wrap});
  await waitFor(() => expect(result.current.ready).toBe(true)); const old = result.current;
  rerender({search: "x".repeat(201)}); await act(async () => {await new Promise(r => setTimeout(r, 300));}); mocks.read.mockClear();
  act(() => {old.retry(); result.current.retry();}); expect(mocks.read).not.toHaveBeenCalled();
  rerender({search: "valid"}); act(() => result.current.retry()); expect(mocks.read).not.toHaveBeenCalled();
  await waitFor(() => expect(result.current.ready).toBe(true)); expect(mocks.read).toHaveBeenCalledTimes(1); expect(mocks.read.mock.calls[0][1].search).toBe("valid");
});
it("retired queue callbacks do not regain authority through A→B→A", async () => {
  const {wrap} = wrapper(); const {result, rerender} = renderHook(({actor}) => useDmsApprovalQueue(actor, {}), {initialProps: {actor: a}, wrapper: wrap});
  await waitFor(() => expect(result.current.ready).toBe(true)); const old = result.current;
  rerender({actor: b}); await waitFor(() => expect(result.current.ready).toBe(true));
  rerender({actor: a}); await waitFor(() => expect(result.current.ready).toBe(true)); mocks.read.mockClear();
  await act(async () => {old.retry(); await old.refresh();}); expect(old.isCurrent()).toBe(false); expect(mocks.read).not.toHaveBeenCalled();
  act(() => result.current.retry()); await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1));
});
it("retired history callbacks do not revive through open→closed→open", async () => {
  const {wrap} = wrapper(); const {result, rerender} = renderHook(({enabled}) => useDmsApprovalHistory(a, 1, 1, enabled), {initialProps: {enabled: true}, wrapper: wrap});
  await waitFor(() => expect(result.current.ready).toBe(true)); const old = result.current;
  rerender({enabled: false}); expect(result.current.data).toBeUndefined(); rerender({enabled: true}); await waitFor(() => expect(result.current.ready).toBe(true)); mocks.read.mockClear();
  await act(async () => {old.retry(); await old.refresh();}); expect(old.isCurrent()).toBe(false); expect(mocks.read).not.toHaveBeenCalled();
});
it("retires a selected document history and ignores its late aborted response", async () => {
  const pending = deferred<unknown>(); let oldCriteria: unknown;
  mocks.read.mockImplementationOnce((_path, criteria) => {oldCriteria = criteria; return pending.promise;});
  const {wrap, client} = wrapper(); const {result, rerender} = renderHook(({id}) => useDmsApprovalHistory(a, id, 1, true), {initialProps: {id: 1}, wrapper: wrap});
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1)); const signal = mocks.read.mock.calls[0][2] as AbortSignal;
  rerender({id: 2}); await waitFor(() => expect(result.current.ready).toBe(true));
  expect(signal.aborted).toBe(true); await act(async () => pending.resolve(empty(oldCriteria)));
  expect(result.current.data?.criteria.documentId).toBe(2); expect(client.getQueryCache().findAll({queryKey: ["dms", "approval-history", 1]})).toHaveLength(0);
});
it("unmount retires callbacks synchronously and removes private cached data", async () => {
  const {wrap, client} = wrapper(); const {result, unmount} = renderHook(() => useDmsApprovalQueue(a, {}), {wrapper: wrap});
  await waitFor(() => expect(result.current.ready).toBe(true)); const old = result.current; unmount(); mocks.read.mockClear();
  await act(async () => {old.retry(); await old.refresh();}); expect(old.isCurrent()).toBe(false); expect(mocks.read).not.toHaveBeenCalled();
  expect(client.getQueryCache().getAll()).toHaveLength(0);
});
it("a confirmed mutation refreshes the new criteria in its same lifetime, but an old retry cannot", async () => {
  const {wrap} = wrapper(); const {result, rerender} = renderHook(({search}) => useDmsApprovalQueue(a, {search}), {initialProps: {search: "old"}, wrapper: wrap});
  await waitFor(() => expect(result.current.ready).toBe(true)); const old = result.current;
  rerender({search: "new"}); await waitFor(() => expect(result.current.ready).toBe(true)); mocks.read.mockClear();
  act(() => old.retry()); expect(mocks.read).not.toHaveBeenCalled(); await act(async () => old.refresh());
  expect(mocks.read).toHaveBeenCalledTimes(1); expect(mocks.read.mock.calls[0][1].search).toBe("new");
});
it("forbidden reads retire a lifetime, suppress manual retry and do not show empty success", async () => {
  mocks.read.mockRejectedValue(new ReadError("Denied", 403)); const {wrap, client} = wrapper(); const {result} = renderHook(() => useDmsApprovalQueue(a, {}), {wrapper: wrap});
  await waitFor(() => expect(result.current.denied).toBe(true)); expect(result.current.data).toBeUndefined(); expect(result.current.ready).toBe(false);
  const count = mocks.read.mock.calls.length; await act(async () => {result.current.retry(); await result.current.refresh();}); expect(mocks.read).toHaveBeenCalledTimes(count);
  expect(client.getQueryCache().getAll().every(q => q.state.data === undefined)).toBe(true);
});
it("valid manual retry recovers a failed read without disclosing a stale success", async () => {
  mocks.read.mockRejectedValueOnce(new ReadError("Invalid saved state", 400)); const {wrap} = wrapper(); const {result} = renderHook(() => useDmsApprovalQueue(a, {}), {wrapper: wrap});
  await waitFor(() => expect(result.current.error).toBeTruthy()); expect(result.current.data).toBeUndefined(); expect(result.current.ready).toBe(false);
  act(() => result.current.retry()); await waitFor(() => expect(result.current.ready).toBe(true)); expect(mocks.read).toHaveBeenCalledTimes(2);
});
it("history remains completely lazy and account denial never issues a queue read", async () => {
  const {wrap} = wrapper(); const history = renderHook(() => useDmsApprovalHistory(a, 1, 1, false), {wrapper: wrap});
  const queue = renderHook(() => useDmsApprovalQueue(auth(1, false), {}), {wrapper: wrap});
  act(() => {history.result.current.retry(); queue.result.current.retry();}); expect(mocks.read).not.toHaveBeenCalled();
  expect(history.result.current.ready).toBe(false); expect(queue.result.current.denied).toBe(true);
});
it("changing assignment scope creates a new read owner even with the same user ID", async () => {
  const {wrap, client} = wrapper(); const {result, rerender} = renderHook(({actor}) => useDmsApprovalQueue(actor, {}), {initialProps: {actor: a}, wrapper: wrap});
  await waitFor(() => expect(result.current.ready).toBe(true)); const old = result.current;
  rerender({actor: {...a, roleAssignments: [{roleId: 4, roleCode: "test", ownerCompanyId: 2, branchId: 3, permissionCodes: ["dms.approvals.view"]}]}});
  await waitFor(() => expect(result.current.ready).toBe(true)); expect(result.current.owner).not.toBe(old.owner); expect(old.isCurrent()).toBe(false);
  expect(client.getQueryCache().getAll()).toHaveLength(1);
});
it("mismatched response criteria remain an error, not a successful empty page", async () => {
  mocks.read.mockImplementation(async (_path, criteria) => empty({...criteria, search: "wrong owner request"}));
  const {wrap} = wrapper(); const {result} = renderHook(() => useDmsApprovalQueue(a, {}), {wrapper: wrap});
  await waitFor(() => expect(result.current.error).toBeTruthy()); expect(result.current.ready).toBe(false); expect(result.current.data).toBeUndefined();
});
it("layout-unmount consumers cannot dispatch before passive cleanup", async () => {
  const {wrap} = wrapper(); const retained: {retry?: () => void; refresh?: () => Promise<void>; current?: () => boolean} = {};
  let wasCurrent: boolean | undefined;
  const h = renderHook(() => {const read = useDmsApprovalQueue(a, {});
    React.useLayoutEffect(() => () => {wasCurrent = retained.current?.(); retained.retry?.(); void retained.refresh?.();}, []); return read;
  }, {wrapper: wrap});
  await waitFor(() => expect(h.result.current.ready).toBe(true)); retained.retry = h.result.current.retry; retained.refresh = h.result.current.refresh; retained.current = h.result.current.isCurrent;
  mocks.read.mockClear(); h.unmount(); expect(wasCurrent).toBe(false); expect(mocks.read).not.toHaveBeenCalled();
});
