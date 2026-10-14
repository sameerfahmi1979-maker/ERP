// @vitest-environment jsdom
import React from "react";
import {afterEach, expect, it, vi} from "vitest";
import {act, cleanup, renderHook} from "@testing-library/react";
import {useComplianceReadAdmission} from "@/features/hr/employees/compliance/compliance-read-admission";

afterEach(cleanup);
function deferred() {let resolve!: () => void; const promise = new Promise<void>(done => {resolve = done;}); return {promise, resolve};}
const read = (refetch: () => Promise<unknown> = vi.fn(async () => undefined)) => ({isSuccess: true, isError: false, isFetching: false, data: [], refetch});

it("primitive committed ABA never revives an old dispatch/current/retry callback", async () => {
  const refetch = vi.fn(async () => undefined), source = read(refetch);
  const view = renderHook(({owner}) => useComplianceReadAdmission(true, [source], owner), {initialProps: {owner: "A"}});
  const firstA = view.result.current; expect(firstA.canDispatch()).toBe(true);
  view.rerender({owner: "B"}); const b = view.result.current; view.rerender({owner: "A"});
  expect(firstA.isCurrent()).toBe(false); expect(firstA.canDispatch()).toBe(false); expect(b.isCurrent()).toBe(false);
  await act(async () => {await firstA.retry(); await b.retry();}); expect(refetch).not.toHaveBeenCalled();
  expect(view.result.current.canDispatch()).toBe(true); await act(async () => {await view.result.current.retry();}); expect(refetch).toHaveBeenCalledTimes(1);
});
it("a retained child cannot borrow a replacement parent generation with the same local owner", async () => {
  const source = read(), view = renderHook(({owner}) => {
    const parent = useComplianceReadAdmission(true, [source], owner);
    return useComplianceReadAdmission(true, [], "employee-7", parent);
  }, {initialProps: {owner: "A"}});
  const old = view.result.current; view.rerender({owner: "B"});
  expect(old.isCurrent()).toBe(false); expect(old.canDispatch()).toBe(false);
  view.rerender({owner: "A"}); await act(async () => {await old.retry();}); expect(source.refetch).not.toHaveBeenCalled();
  expect(view.result.current.canDispatch()).toBe(true);
});
it("same-generation readiness pauses dispatch, not an already dispatched completion", async () => {
  const view = renderHook(({ready}) => useComplianceReadAdmission(ready, [], "A"), {initialProps: {ready: true}}), old = view.result.current;
  view.rerender({ready: false}); expect(old.canDispatch()).toBe(false); expect(old.isCurrent()).toBe(true);
  view.rerender({ready: true}); expect(old.canDispatch()).toBe(true); expect(old.isCurrent()).toBe(true);
});
it("an old retry completion cannot release a replacement generation's retry flight", async () => {
  const a = deferred(), b = deferred(), retryA = vi.fn(() => a.promise), retryB = vi.fn(() => b.promise);
  const view = renderHook(({owner}) => useComplianceReadAdmission(true, [read(owner === "A" ? retryA : retryB)], owner), {initialProps: {owner: "A"}});
  let taskA!: Promise<void>, taskB!: Promise<void>;
  act(() => {taskA = view.result.current.retry();}); view.rerender({owner: "B"}); act(() => {taskB = view.result.current.retry();});
  expect(retryA).toHaveBeenCalledTimes(1); expect(retryB).toHaveBeenCalledTimes(1);
  await act(async () => {a.resolve(); await taskA;}); expect(view.result.current.retrying).toBe(true);
  await act(async () => {await view.result.current.retry();}); expect(retryB).toHaveBeenCalledTimes(1);
  await act(async () => {b.resolve(); await taskB;}); expect(view.result.current.retrying).toBe(false); expect(view.result.current.canDispatch()).toBe(true);
});
it("a StrictMode live generation remains usable and unmount retires nested callbacks", async () => {
  const source = read(), wrapper = ({children}: {children: React.ReactNode}) => <React.StrictMode>{children}</React.StrictMode>;
  const view = renderHook(() => {const parent = useComplianceReadAdmission(true, [source], "A"); return useComplianceReadAdmission(true, [], "child", parent);}, {wrapper});
  const retained = view.result.current; expect(retained.canDispatch()).toBe(true); view.unmount();
  expect(retained.isCurrent()).toBe(false); await retained.retry(); expect(source.refetch).not.toHaveBeenCalled();
});
