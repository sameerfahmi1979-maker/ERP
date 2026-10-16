// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { createWorkspaceDraftStore } from '@/lib/workspace/workspace-draft-store';
import type { WorkspaceDraftStoreApi } from '@/lib/workspace/workspace-draft-types';
const m = vi.hoisted(() => ({ owner: 'administration-session', store: null as unknown }));
vi.mock('@/hooks/use-workspace-form-owner', () => ({ useWorkspaceFormOwner: () => m.owner ? { id: m.owner } : null }));
vi.mock('@/components/workspace/workspace-draft-provider', () => ({ useWorkspaceDraftStoreContext: () => m.store }));
import { useAdministrationSaveSession } from '@/hooks/use-administration-save-session';
const receipt = { id: 81, revision: '5', changed: true, replayed: false };
beforeEach(() => { m.owner = 'administration-session'; m.store = createWorkspaceDraftStore(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('a refreshed row cannot replace the opening draft revision', () => {
  const hook = renderHook(({ revision }) => useAdministrationSaveSession('form', 81, revision), { initialProps: { revision: 4 } });
  hook.rerender({ revision: 9 }); expect(hook.result.current.prepare({ notes: 'Original draft' }).contract.revision).toBe('4');
});
it('the submitted payload is copied and restored exactly through a remount', () => {
  const hook = renderHook(() => useAdministrationSaveSession('form', 81, 4));
  const input = { notes: 'Submitted', options: { active: false }, address: null };
  const first = hook.result.current.prepare(input); input.notes = 'Later'; input.options.active = true;
  hook.unmount(); const restored = renderHook(() => useAdministrationSaveSession('form', 81, 9));
  expect(restored.result.current.uncertain).toBe(true);
  expect(restored.result.current.prepare({ notes: 'Different', options: {}, address: 1 })).toEqual(first);
  expect(first.payload).toEqual({ notes: 'Submitted', options: { active: false }, address: null });
});
it('a confirmed creation persists its identity for the next mount and advances its revision', () => {
  const first = renderHook(() => useAdministrationSaveSession('form', null));
  first.result.current.prepare({ company_code: 'SYNTHETIC' });
  act(() => { first.result.current.accept({ ...receipt, revision: '1' }); }); first.unmount();
  const second = renderHook(() => useAdministrationSaveSession('form', null));
  expect(second.result.current.savedId).toBe(81); expect(second.result.current.uncertain).toBe(false);
  expect(second.result.current.prepare({ notes: 'Second save' })).toMatchObject({ id: 81, contract: { revision: '1' } });
});
it.each([undefined, 0, -1, 1.5])('missing or invalid opening revision %s fails before dispatch', revision => {
  const hook = renderHook(() => useAdministrationSaveSession('form', 81, revision));
  expect(() => hook.result.current.prepare({ notes: 'Retain' })).toThrow('current revision');
  expect(hook.result.current.getPending()).toBeNull();
});
it.each([{ id: 81 }, { ...receipt, id: 82 }, { ...receipt, changed: undefined }, { ...receipt, revision: null }])('invalid receipt %# cannot resolve an operation', invalid => {
  const hook = renderHook(() => useAdministrationSaveSession('form', 81, 4)); const pending = hook.result.current.prepare({ notes: 'Pending' });
  expect(() => hook.result.current.accept(invalid)).toThrow(); expect(hook.result.current.getPending()).toEqual(pending);
});
it('a no-op resolves the operation without inventing a newer revision', () => {
  const hook = renderHook(() => useAdministrationSaveSession('form', 81, 4)); const original = hook.result.current.prepare({ notes: 'Unchanged' });
  act(() => { hook.result.current.accept({ ...receipt, revision: '4', changed: false }); });
  const next = hook.result.current.prepare({ notes: 'New' }); expect(next.contract.revision).toBe('4'); expect(next.contract.operationId).not.toBe(original.contract.operationId);
});
it('different workspace tabs do not share operation identity or pending values', () => {
  const first = renderHook(() => useAdministrationSaveSession('form', 81, 4)); const pending = first.result.current.prepare({ notes: 'First tab' });
  m.owner = 'other-tab'; const second = renderHook(() => useAdministrationSaveSession('form', 82, 7));
  expect(second.result.current.uncertain).toBe(false); expect(second.result.current.prepare({ notes: 'Other tab' }).contract.operationId).not.toBe(pending.contract.operationId);
});
it.each(['owner', 'store', 'record', 'form'])('a changed %s cannot use an earlier mounted callback', change => {
  const hook = renderHook(({ id, form }) => useAdministrationSaveSession(form, id, 4), { initialProps: { id: 81, form: 'form' } });
  const old = hook.result.current; old.prepare({ notes: 'Old owner' });
  if (change === 'owner') m.owner = 'different-tab';
  if (change === 'store') m.store = createWorkspaceDraftStore();
  hook.rerender({ id: change === 'record' ? 82 : 81, form: change === 'form' ? 'different-form' : 'form' });
  expect(() => old.getPending()).toThrow('owner changed');
  expect(() => old.prepare({ notes: 'Different' })).toThrow('owner changed');
  expect(() => old.accept(receipt)).toThrow('owner changed');
  expect(() => old.rejected()).toThrow('owner changed');
});
it('the account-keyed provider replacement creates a clean session even for the same tab id', () => {
  const first = renderHook(() => useAdministrationSaveSession('form', 81, 4));
  const old = first.result.current.prepare({ notes: 'First account' }); first.unmount();
  // ErpShell keys WorkspaceDraftProvider by principalId, so account changes create a new store.
  m.store = createWorkspaceDraftStore(); const second = renderHook(() => useAdministrationSaveSession('form', 81, 4));
  expect(second.result.current.getPending()).toBeNull();
  expect(second.result.current.prepare({ notes: 'Second account' }).contract.operationId).not.toBe(old.contract.operationId);
});
it('an unmounted session cannot accept or clear a late response in its retained draft store', () => {
  const first = renderHook(() => useAdministrationSaveSession('form', 81, 4));
  const stale = first.result.current; const pending = stale.prepare({ notes: 'Original account request' });
  const originalStore = m.store as WorkspaceDraftStoreApi;
  const before = originalStore.getViewState(`draft:tab:${m.owner}:form:administration-payload`);
  first.unmount(); m.store = createWorkspaceDraftStore();
  renderHook(() => useAdministrationSaveSession('form', 81, 4));
  expect(stale.isCurrent()).toBe(false);
  expect(() => stale.accept(receipt)).toThrow('owner changed'); expect(() => stale.rejected()).toThrow('owner changed');
  expect(() => stale.prepare({ notes: 'Replacement' })).toThrow('owner changed'); expect(() => stale.getPending()).toThrow('owner changed');
  expect(originalStore.getViewState(`draft:tab:${m.owner}:form:administration-payload`)).toBe(before);
  m.store = originalStore;
  const recovered = renderHook(() => useAdministrationSaveSession('form', 81, 9)); expect(recovered.result.current.getPending()).toEqual(pending);
});
it('remounting a different record under a reused tab cannot adopt the previous record identity', () => {
  const first = renderHook(() => useAdministrationSaveSession('form', 81, 4)); first.result.current.prepare({ notes: 'Record 81' }); first.unmount();
  const second = renderHook(() => useAdministrationSaveSession('form', 82, 7)); expect(second.result.current.recoveryError).toBeTruthy();
  expect(() => second.result.current.getPending()).toThrow('could not be verified'); expect(() => second.result.current.prepare({ notes: 'Record 82' })).toThrow('could not be verified');
});
it.each(['accepted', 'rejected'])('%s operation removes payload and pending contract from memory', outcome => {
  const hook = renderHook(() => useAdministrationSaveSession('form', 81, 4)); hook.result.current.prepare({ notes: 'Do not retain after resolution' });
  act(() => { if (outcome === 'accepted') hook.result.current.accept(receipt); else hook.result.current.rejected(); });
  const store = m.store as WorkspaceDraftStoreApi;
  expect(store.getViewState(`draft:tab:${m.owner}:form:administration-payload`)).toBe('null');
  expect(JSON.parse(store.getViewState(`draft:tab:${m.owner}:form:save`)!)).not.toHaveProperty('pending');
  hook.unmount(); const next = renderHook(() => useAdministrationSaveSession('form', 81, 4)); expect(next.result.current.uncertain).toBe(false); expect(next.result.current.getPending()).toBeNull();
});
it.each(['broken JSON', 'wrong shape', 'wrong identity', 'wrong operation', 'invalid payload'])('corrupt recovery data (%s) cannot become a new save attempt', corruption => {
  const validate = (payload: unknown) => typeof payload === 'object' && payload !== null && typeof (payload as { notes?: unknown }).notes === 'string';
  const hook = renderHook(() => useAdministrationSaveSession('form', 81, 4, validate)); const pending = hook.result.current.prepare({ notes: 'Original' }); hook.unmount();
  const tampered = corruption === 'broken JSON' ? '{' : JSON.stringify(corruption === 'wrong shape' ? [] : corruption === 'wrong identity' ? { ...pending, id: 82 } : corruption === 'wrong operation' ? { ...pending, contract: { ...pending.contract, operationId: crypto.randomUUID() } } : { ...pending, payload: { notes: 12 } });
  (m.store as WorkspaceDraftStoreApi).setViewState(`draft:tab:${m.owner}:form:administration-payload`, tampered);
  const restored = renderHook(() => useAdministrationSaveSession('form', 81, 4, validate));
  expect(restored.result.current.uncertain).toBe(true); expect(restored.result.current.recoveryError).toContain('could not be verified');
  expect(() => restored.result.current.getPending()).toThrow('could not be verified'); expect(() => restored.result.current.prepare({ notes: 'New' })).toThrow('could not be verified');
});
it('corrupt underlying F04 session JSON becomes a visible blocked F06 recovery state without replacement', () => {
  const key = `draft:tab:${m.owner}:form:save`;
  (m.store as WorkspaceDraftStoreApi).setViewState(key, '{');
  const restored = renderHook(() => useAdministrationSaveSession('form', 81, 4));
  expect(restored.result.current.recoveryError).toContain('could not be verified'); expect(restored.result.current.uncertain).toBe(true);
  expect(() => restored.result.current.prepare({ notes: 'Must not send' })).toThrow('could not be verified');
  expect((m.store as WorkspaceDraftStoreApi).getViewState(key)).toBe('{');
});

const retainedKeys = () => ({ save: `draft:tab:${m.owner}:form:save`, payload: `draft:tab:${m.owner}:form:administration-payload` });
it.each(['missing payload', 'null payload', 'orphan payload'])('W21: %s blocks before allocating or changing the retained pair', kind => {
  const store = m.store as WorkspaceDraftStoreApi, keys = retainedKeys();
  const first = renderHook(() => useAdministrationSaveSession('form', 81, 4)); first.result.current.prepare({ notes: 'Original' }); first.unmount();
  const saved = store.getViewState(keys.save)!, payload = store.getViewState(keys.payload)!;
  store.clearDraftsForTab(m.owner);
  if (kind === 'orphan payload') { store.setViewState(keys.save, JSON.stringify({ id: 81, revision: '4' })); store.setViewState(keys.payload, payload); }
  else { store.setViewState(keys.save, saved); if (kind === 'null payload') store.setViewState(keys.payload, 'null'); }
  const before = [store.getViewState(keys.save), store.getViewState(keys.payload)], uuid = vi.spyOn(crypto, 'randomUUID');
  const next = renderHook(() => useAdministrationSaveSession('form', 81, 9));
  expect(next.result.current.recoveryError).toBeTruthy(); expect(() => next.result.current.prepare({ notes: 'Replacement' })).toThrow();
  expect(uuid).not.toHaveBeenCalled(); expect([store.getViewState(keys.save), store.getViewState(keys.payload)]).toEqual(before); uuid.mockRestore();
});
it.each(['save', 'payload'] as const)('W21: external %s replacement is never adopted or overwritten by any method', part => {
  const store = m.store as WorkspaceDraftStoreApi, keys = retainedKeys();
  const hook = renderHook(() => useAdministrationSaveSession('form', 81, 4)); hook.result.current.prepare({ notes: 'Original' });
  const raw = store.getViewState(keys[part])!;
  const replacement = part === 'save' ? JSON.stringify({ id: 81, revision: '9' }) : raw.replace('Original', 'Substitute');
  store.setViewState(keys[part], replacement);
  for (const invoke of [() => hook.result.current.getPending(), () => hook.result.current.prepare({ notes: 'New' }), () => hook.result.current.rejected(), () => hook.result.current.accept(receipt)]) expect(invoke).toThrow();
  expect(store.getViewState(keys[part])).toBe(replacement); expect(hook.result.current.isCurrent()).toBe(true);
});
it('W21: clearing the tab cannot recreate either envelope through an old session', () => {
  const store = m.store as WorkspaceDraftStoreApi, keys = retainedKeys();
  const hook = renderHook(() => useAdministrationSaveSession('form', 81, 4)); hook.result.current.prepare({ notes: 'Old' }); store.clearDraftsForTab(m.owner);
  expect(() => hook.result.current.prepare({ notes: 'New' })).toThrow(); expect(() => hook.result.current.rejected()).toThrow();
  expect(store.getViewState(keys.save)).toBeUndefined(); expect(store.getViewState(keys.payload)).toBeUndefined();
});
it('W21: callers cannot mutate the retained payload or contract through a returned request', () => {
  const hook = renderHook(() => useAdministrationSaveSession<{ notes: string; nested: { value: number } }>('form', 81, 4));
  const request = hook.result.current.prepare({ notes: 'Original', nested: { value: 0 } }), original = JSON.parse(JSON.stringify(request));
  request.payload.nested.value = 99; request.contract.revision = '99';
  expect(hook.result.current.getPending()).toEqual(original);
  const again = hook.result.current.getPending()!; again.payload.notes = 'Changed';
  expect(hook.result.current.prepare({ notes: 'Different', nested: { value: 1 } })).toEqual(original);
});
it.each(['owner', 'store', 'record', 'form'])('W21: %s A-B-A permanently retires earlier callbacks', kind => {
  const originalStore = m.store, originalOwner = m.owner;
  const hook = renderHook(({ id, form }) => useAdministrationSaveSession(form, id, 4), { initialProps: { id: 81, form: 'form' } });
  const old = hook.result.current; old.prepare({ notes: 'Retained' });
  if (kind === 'owner') m.owner = 'B'; if (kind === 'store') m.store = createWorkspaceDraftStore();
  hook.rerender({ id: kind === 'record' ? 82 : 81, form: kind === 'form' ? 'B' : 'form' });
  m.owner = originalOwner; m.store = originalStore; hook.rerender({ id: 81, form: 'form' });
  expect(old.isCurrent()).toBe(false); expect(() => old.accept(receipt)).toThrow(); expect(() => old.rejected()).toThrow();
});
it('W21: StrictMode fresh lifecycle and no-owner memory-only sessions remain usable', () => {
  const strict = renderHook(() => useAdministrationSaveSession('form', 81, 4), { wrapper: StrictMode });
  expect(strict.result.current.isCurrent()).toBe(true); strict.result.current.prepare({ notes: 'Strict' }); act(() => { strict.result.current.accept(receipt); }); strict.unmount();
  m.owner = ''; m.store = null;
  const standalone = renderHook(() => useAdministrationSaveSession('standalone', null)); standalone.result.current.prepare({ notes: 'Local' });
  act(() => { standalone.result.current.accept({ ...receipt, revision: '1' }); });
  expect(standalone.result.current.prepare({ notes: 'Edit' })).toMatchObject({ id: 81, contract: { revision: '1' } });
});
for (const part of ['save', 'payload'] as const) for (const afterWrite of [false, true]) {
  it(`W21: prepare ${part} failure afterWrite=${afterWrite} blocks the mutated closure`, () => {
    const store = m.store as WorkspaceDraftStoreApi, keys = retainedKeys();
    const hook = renderHook(() => useAdministrationSaveSession('form', 81, 4)); const write = store.setViewState.bind(store);
    const spy = vi.spyOn(store, 'setViewState').mockImplementation((key, value) => { if (key !== keys[part] || afterWrite) write(key, value); if (key === keys[part]) throw Error('PRIVATE'); });
    expect(() => hook.result.current.prepare({ notes: 'Retain' })).toThrow(); spy.mockRestore();
    const before = [store.getViewState(keys.save), store.getViewState(keys.payload)];
    expect(() => hook.result.current.prepare({ notes: 'Retain' })).toThrow(); expect(() => hook.result.current.prepare({ notes: 'Replacement' })).toThrow(); expect([store.getViewState(keys.save), store.getViewState(keys.payload)]).toEqual(before);
  });
  it(`W21: confirmed ${part} acknowledgement failure afterWrite=${afterWrite} stops mutation but permits companion read recovery`, () => {
    const store = m.store as WorkspaceDraftStoreApi, keys = retainedKeys();
    const hook = renderHook(() => useAdministrationSaveSession('form', 81, 4)); hook.result.current.prepare({ notes: 'Confirmed' });
    const write = store.setViewState.bind(store), spy = vi.spyOn(store, 'setViewState').mockImplementation((key, value) => { if (key !== keys[part] || afterWrite) write(key, value); if (key === keys[part]) throw Error('PRIVATE'); });
    act(() => { expect(() => hook.result.current.accept(receipt)).toThrow(); }); spy.mockRestore();
    expect(hook.result.current.isCurrent()).toBe(true); expect(hook.result.current.recoveryError).toBeNull(); expect(hook.result.current.uncertain).toBe(false);
    const before = [store.getViewState(keys.save), store.getViewState(keys.payload)];
    for (const invoke of [() => hook.result.current.prepare({ notes: 'Again' }), () => hook.result.current.getPending(), () => hook.result.current.rejected()]) {
      expect(invoke).toThrow(); hook.rerender();
      expect(hook.result.current.recoveryError).toBeNull(); expect(hook.result.current.isCurrent()).toBe(true); expect(hook.result.current.uncertain).toBe(false);
    }
    expect([store.getViewState(keys.save), store.getViewState(keys.payload)]).toEqual(before);
  });
}
