// @vitest-environment jsdom
import {act, cleanup, renderHook} from "@testing-library/react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {createWorkspaceDraftStore} from "@/lib/workspace/workspace-draft-store";
import {useWorkspaceControlledDraft, type WorkspaceDraftCodec} from "@/hooks/use-workspace-controlled-draft";
const state = vi.hoisted(() => ({store: null as ReturnType<typeof createWorkspaceDraftStore> | null, dispatch: vi.fn()}));
vi.mock("next/navigation", () => ({usePathname: () => "/candidate/42"}));
vi.mock("@/components/workspace/workspace-provider", () => ({useWorkspaceContext: () => ({state: {activeTabId: "owner", tabs: [{id: "owner", route: "/candidate/42"}]}, dispatch: state.dispatch})}));
vi.mock("@/components/workspace/workspace-draft-provider", () => ({useWorkspaceDraftStoreContext: () => state.store}));
const initial = {notes: "original", expected_salary: "54321"};
const codec: WorkspaceDraftCodec<typeof initial> = {encode: value => value, restore: (value, read) => ({notes: read("notes", value.notes), expected_salary: read("expected_salary", value.expected_salary)})};
const useDraft = () => useWorkspaceControlledDraft({formId: "candidate", initialValue: initial, codec, enabled: true});
const key = "draft:tab:owner:candidate";
beforeEach(() => {state.store = createWorkspaceDraftStore();}); afterEach(cleanup);
it("salary redaction preserves allowed edits and dirty baseline while scrubbing stored salary", () => {
  const hook = renderHook(useDraft); act(() => hook.result.current.setValue({...initial, notes: "allowed newer note"}));
  act(() => hook.result.current.redact({expected_salary: ""}));
  expect(hook.result.current.value).toEqual({notes: "allowed newer note", expected_salary: ""});
  expect(hook.result.current.isDirty).toBe(true); expect(state.store!.getDraft(key)).toEqual({notes: "allowed newer note", expected_salary: ""});
});
it("a late pre-redaction setter and accepted payload cannot restore salary", () => {
  const hook = renderHook(useDraft); const lateSet = hook.result.current.setValue, lateAccept = hook.result.current.acceptSaved;
  act(() => hook.result.current.redact({expected_salary: ""}));
  act(() => lateSet({...initial, notes: "allowed note"})); act(() => lateAccept(initial));
  expect(hook.result.current.value.expected_salary).toBe(""); expect(state.store!.getDraft(key)?.expected_salary).toBe("");
  expect(hook.result.current.isDirty).toBe(true);
});
it("subject retirement clears only its draft and bars late repopulation and acceptSaved", () => {
  state.store!.writeField("draft:tab:other:unrelated", "notes", "unrelated retained");
  const hook = renderHook(useDraft); act(() => hook.result.current.setValue({...initial, notes: "private draft"}));
  const lateSet = hook.result.current.setValue, lateAccept = hook.result.current.acceptSaved;
  act(() => hook.result.current.retire({notes: "", expected_salary: ""}));
  act(() => {lateSet(initial); expect(lateAccept(initial)).toBe(false);});
  expect(hook.result.current.value).toEqual({notes: "", expected_salary: ""}); expect(hook.result.current.isDirty).toBe(false);
  expect(state.store!.hasDraft(key)).toBe(false); expect(state.store!.getDraft("draft:tab:other:unrelated")?.notes).toBe("unrelated retained");
});
