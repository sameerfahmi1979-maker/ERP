// @vitest-environment jsdom
import {act, cleanup, renderHook} from "@testing-library/react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {createWorkspaceDraftStore} from "@/lib/workspace/workspace-draft-store";
import {parseSaveRetirements, saveRetirementKey} from "@/lib/workspace/save-retirement";
import {useWorkspaceSaveSession} from "@/hooks/use-workspace-save-session";
const state = vi.hoisted(() => ({owner: "first", store: null as ReturnType<typeof createWorkspaceDraftStore> | null}));
vi.mock("@/hooks/use-workspace-form-owner", () => ({useWorkspaceFormOwner: () => ({id: state.owner})}));
vi.mock("@/components/workspace/workspace-draft-provider", () => ({useWorkspaceDraftStoreContext: () => state.store}));
const options = {retirementScope: "hr_candidates:record:42", recordScope: (id: number) => `hr_candidates:record:${id}`};
const markerKey = saveRetirementKey(options.retirementScope);
beforeEach(() => {state.owner = "first"; state.store = createWorkspaceDraftStore();}); afterEach(cleanup);
it("redacts a private fingerprint while retaining opaque operation and opening revision", () => {
  const hook = renderHook(() => useWorkspaceSaveSession("candidate", 42, 7, options));
  const operation = hook.result.current.begin({notes: "PRIVATE CANDIDATE TEXT", expected_salary: 54321});
  act(() => hook.result.current.retireForAccessLoss());
  expect(state.store?.getViewState("draft:tab:first:candidate:save")).toBe('{"id":42,"revision":"7"}');
  const raw = state.store!.getViewState(markerKey)!;
  expect(raw).not.toContain("PRIVATE"); expect(raw).not.toContain("54321"); expect(raw).not.toContain("fingerprint");
  expect(parseSaveRetirements(raw, options.retirementScope)).toEqual([{version: 1, scope: options.retirementScope, id: 42, revision: "7", operationId: operation.operationId}]);
  expect(() => hook.result.current.begin({notes: "PRIVATE CANDIDATE TEXT", expected_salary: 54321})).toThrow("blocked");
});
it("tab discard, remount and a second tab cannot forget unresolved subject saves", () => {
  const first = renderHook(() => useWorkspaceSaveSession("candidate", 42, 7, options));
  first.result.current.begin({name: "private"}); first.result.current.retireForAccessLoss(); first.unmount();
  state.store!.clearDraftsForTab("first"); state.owner = "second";
  const second = renderHook(() => useWorkspaceSaveSession("candidate", 42, 19, options));
  expect(second.result.current.requiresReconciliation).toBe(true); expect(() => second.result.current.begin({name: "replacement"})).toThrow("blocked");
  const unrelated = renderHook(() => useWorkspaceSaveSession("other", 43, 1, {...options, retirementScope: "hr_candidates:record:43"}));
  expect(unrelated.result.current.begin({name: "permitted different record"}).revision).toBe("1");
});
it("late definitive receipt resolves only matching opaque marker and never reactivates retired controller", () => {
  const hook = renderHook(() => useWorkspaceSaveSession("candidate", 42, 7, options));
  const operation = hook.result.current.begin({notes: "private"}); hook.result.current.retireForAccessLoss();
  expect(hook.result.current.settleRetired(crypto.randomUUID(), {receipt: {id: 42, revision: "8", replayed: false}})).toBe(false);
  expect(hook.result.current.settleRetired(operation.operationId, {receipt: {id: 43, revision: "8", replayed: false}})).toBe(false);
  expect(hook.result.current.settleRetired(operation.operationId, {receipt: {id: 42, revision: "0", replayed: false}})).toBe(false);
  expect(hook.result.current.settleRetired(operation.operationId, {receipt: {id: 42, revision: "8", replayed: false}})).toBe(true);
  expect(hook.result.current.requiresReconciliation).toBe(false); expect(hook.result.current.isRetired).toBe(true);
  expect(() => hook.result.current.begin({notes: "private"})).toThrow("blocked");
  hook.unmount(); const reopened = renderHook(() => useWorkspaceSaveSession("candidate", 42, 10, options));
  expect(reopened.result.current.begin({notes: "fresh authorization"}).revision).toBe("8");
});
it("one older result cannot clear a second unresolved operation for the same record", () => {
  const a = renderHook(() => useWorkspaceSaveSession("candidate", 42, 7, options)); const first = a.result.current.begin({notes: "one"});
  state.owner = "second"; const b = renderHook(() => useWorkspaceSaveSession("candidate", 42, 7, options)); const second = b.result.current.begin({notes: "two"});
  a.result.current.retireForAccessLoss(); b.result.current.retireForAccessLoss();
  expect(parseSaveRetirements(state.store!.getViewState(markerKey)!, options.retirementScope)).toHaveLength(2);
  a.result.current.settleRetired(first.operationId, {rolledBack: true});
  expect(a.result.current.requiresReconciliation).toBe(true);
  expect(a.result.current.settleRetired(first.operationId, {rolledBack: true})).toBe(false);
  expect(parseSaveRetirements(state.store!.getViewState(markerKey)!, options.retirementScope)?.[0].operationId).toBe(second.operationId);
  b.result.current.settleRetired(second.operationId, {rolledBack: true}); expect(b.result.current.requiresReconciliation).toBe(false);
});
it("malformed retirement metadata fails closed instead of fabricating a confirmed outcome", () => {
  state.store!.setViewState(markerKey, '{"notes":"unexpected"}');
  const hook = renderHook(() => useWorkspaceSaveSession("candidate", 42, 7, options));
  expect(() => hook.result.current.begin({notes: "new"})).toThrow("blocked");
  expect(hook.result.current.settleRetired(crypto.randomUUID(), {rolledBack: true})).toBe(false);
});
it("remount preserves its own prior uncertain operation when a different tab already retired the subject", () => {
  const a = renderHook(() => useWorkspaceSaveSession("candidate", 42, 7, options)); const first = a.result.current.begin({notes: "first private"}); a.unmount();
  state.owner = "second"; const b = renderHook(() => useWorkspaceSaveSession("candidate", 42, 7, options)); const second = b.result.current.begin({notes: "second private"}); b.result.current.retireForAccessLoss();
  state.owner = "first"; renderHook(() => useWorkspaceSaveSession("candidate", 42, 9, options));
  expect(parseSaveRetirements(state.store!.getViewState(markerKey)!, options.retirementScope)?.map(marker => marker.operationId).sort()).toEqual([first.operationId, second.operationId].sort());
  expect(state.store!.getViewState("draft:tab:first:candidate:save")).not.toContain("private");
});
it("uncertain create blocks another create, but a confirmed create adopts record-scoped retirement", () => {
  const createOptions = {...options, retirementScope: "hr_candidates:create"};
  const hook = renderHook(() => useWorkspaceSaveSession("candidate", null, undefined, createOptions));
  hook.result.current.begin({notes: "new"}); hook.result.current.accept({id: 42, revision: "1", replayed: false});
  hook.result.current.begin({notes: "second edit"}); hook.result.current.retireForAccessLoss();
  expect(state.store!.getViewState(markerKey)).toBeTruthy(); expect(state.store!.getViewState(saveRetirementKey("hr_candidates:create"))).toBeUndefined();
});
it("retired uncertain create survives tab discard and blocks a new create controller", () => {
  const createOptions = {...options, retirementScope: "hr_candidates:create"};
  const first = renderHook(() => useWorkspaceSaveSession("candidate", null, undefined, createOptions));
  const contract = first.result.current.begin({name: "new private candidate"}); first.result.current.retireForAccessLoss(); first.unmount();
  state.store!.clearDraftsForTab("first"); state.owner = "new-tab";
  const next = renderHook(() => useWorkspaceSaveSession("candidate", null, undefined, createOptions));
  expect(next.result.current.requiresReconciliation).toBe(true); expect(() => next.result.current.begin({name: "replacement"})).toThrow("blocked");
  expect(state.store!.getViewState(saveRetirementKey("hr_candidates:create"))).toContain(contract.operationId);
});
it("retirement remains opt-in: legacy unresolved retry and discard behavior is unchanged", () => {
  const hook = renderHook(() => useWorkspaceSaveSession("legacy", 42, 7)); const op = hook.result.current.begin({notes: "kept"});
  hook.result.current.retireForAccessLoss(); expect(hook.result.current.begin({notes: "kept"})).toEqual(op);
  expect(state.store!.getViewState(markerKey)).toBeUndefined();
});
