// @vitest-environment jsdom
import {act, cleanup, renderHook} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
import type {WorkspaceDraftStoreApi} from '@/lib/workspace/workspace-draft-types';
import {saveRetirementKey} from '@/lib/workspace/save-retirement';

const fixture = vi.hoisted(() => ({store: null as unknown, owner: 'workflow-owner'}));
vi.mock('@/components/workspace/workspace-draft-provider', () => ({useWorkspaceDraftStoreContext: () => fixture.store}));
vi.mock('@/hooks/use-workspace-form-owner', () => ({useWorkspaceFormOwner: () => ({id: fixture.owner})}));
import {useWorkspaceSaveSession} from '@/hooks/use-workspace-save-session';

const stateKey = 'draft:tab:workflow-owner:integrated-form:save';
const scope = 'integrated-synthetic-record:41';
const options = {retirementScope: scope};
const store = () => fixture.store as WorkspaceDraftStoreApi;
const mount = () => renderHook(() => useWorkspaceSaveSession('integrated-form', 41, 3, options));
beforeEach(() => {fixture.store = createWorkspaceDraftStore(); fixture.owner = 'workflow-owner';});
afterEach(cleanup);

it('keeps the original operation and opening revision after validated recovery', () => {
  const first = mount();
  let contract!: ReturnType<typeof first.result.current.begin>;
  act(() => {contract = first.result.current.begin({note: 'Synthetic draft'});});
  first.unmount();
  const second = mount();
  expect(second.result.current.recoveryError).toBeNull();
  expect(second.result.current.begin({note: 'Synthetic draft'})).toEqual(contract);
  expect(contract.revision).toBe('3');
  expect(() => second.result.current.begin({note: 'Changed draft'})).toThrow('previous save is unconfirmed');
});

it.each(['{malformed', JSON.stringify({id: 41, revision: '3', pending: {fingerprint: 'Synthetic private draft', contract: {operationId: 'invalid', revision: '3'}}})])(
  'never turns unverified saved state into a fresh operation', raw => {
    store().setViewState(stateKey, raw);
    const session = mount();
    expect(session.result.current.recoveryError).toContain('could not be verified');
    expect(() => session.result.current.begin({note: 'replacement'})).toThrow('could not be verified');
    expect(() => session.result.current.accept({id: 41, revision: '4', replayed: false})).toThrow('could not be verified');
    expect(store().getViewState(stateKey)).toBe(raw);
  },
);

it('retires validated pending data without weakening receipt reconciliation', () => {
  const session = mount();
  const contract = session.result.current.begin({note: 'Synthetic private draft'});
  act(() => session.result.current.retireForAccessLoss());
  expect(store().getViewState(stateKey)).not.toContain('Synthetic private draft');
  expect(session.result.current.requiresReconciliation).toBe(true);
  expect(() => session.result.current.begin({note: 'new'})).toThrow('blocked after an access change');
  expect(session.result.current.settleRetired(crypto.randomUUID(), {rolledBack: true})).toBe(false);
  expect(session.result.current.settleRetired(contract.operationId, {receipt: {id: 42, revision: '4', replayed: true}})).toBe(false);
  expect(session.result.current.settleRetired(contract.operationId, {receipt: {id: 41, revision: '4', replayed: true}})).toBe(true);
  expect(store().getViewState(saveRetirementKey(scope))).toBe('');
  // Resolving the receipt must not resurrect the retired editor.
  expect(() => session.result.current.begin({note: 'new'})).toThrow('blocked after an access change');
});

it('removes malformed private state on access loss while keeping a fail-closed marker', () => {
  store().setViewState(stateKey, JSON.stringify({unexpected: 'Synthetic private draft'}));
  const first = mount();
  act(() => first.result.current.retireForAccessLoss());
  expect(store().getViewState(stateKey)).not.toContain('Synthetic private draft');
  expect(store().getViewState(saveRetirementKey(scope))).toBe('unverified-request-state');
  first.unmount();
  const next = mount();
  expect(next.result.current.isRetired).toBe(true);
  expect(next.result.current.requiresReconciliation).toBe(true);
  expect(() => next.result.current.begin({note: 'replacement'})).toThrow('blocked after an access change');
  expect(next.result.current.settleRetired(crypto.randomUUID(), {rolledBack: true})).toBe(false);
});
