// @vitest-environment jsdom
// Real table actions and save hooks; only transport, shell ownership, and widgets are doubled.
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { AuthContext } from '@/lib/rbac/check';
import type { BranchWithCompany, OwnerCompanyWithGeography } from '@/types/domain';
import { createWorkspaceDraftStore } from '@/lib/workspace/workspace-draft-store';

const m = vi.hoisted(() => ({ status: vi.fn(), retire: vi.fn(), refresh: vi.fn(), success: vi.fn(), store: null as unknown, owner: 'lifecycle-test' }));
vi.mock('@/hooks/use-workspace-form-owner', () => ({ useWorkspaceFormOwner: () => ({ id: m.owner }) }));
vi.mock('@/components/workspace/workspace-draft-provider', () => ({ useWorkspaceDraftStoreContext: () => m.store }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh, push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: m.success } }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/server/actions/branches', () => ({ updateBranchStatus: m.status, deleteBranch: m.retire }));
vi.mock('@/server/actions/organizations', () => ({ updateOrganizationStatus: m.status, deleteOrganization: m.retire }));
vi.mock('@/components/ui/button', () => ({ Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => <button type={props.type} onClick={props.onClick} disabled={props.disabled}>{props.children}</button> }));
vi.mock('@/components/ui/badge', () => ({ Badge: ({ children }: { children: ReactNode }) => <span>{children}</span> }));
vi.mock('@/components/ui/dropdown-menu', () => {
  const Group = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  const Item = (props: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />;
  return { DropdownMenu: Group, DropdownMenuContent: Group, DropdownMenuGroup: Group, DropdownMenuItem: Item, DropdownMenuLabel: Group, DropdownMenuSeparator: () => null, DropdownMenuTrigger: Item };
});
vi.mock('@/components/erp/table/erp-data-table', () => ({ ERPDataTable: ({ data, columns }: {
  data: { id: number }[]; columns: { id?: string; cell?: (props: { row: { original: object } }) => ReactNode }[];
}) => <div>{data.map(row => <div key={row.id}>{columns.find(column => column.id === 'actions')?.cell?.({ row: { original: row } })}</div>)}</div> }));

import { BranchesTable } from '@/features/branches/branches-table';
import { OrganizationsTable } from '@/features/organizations/organizations-table';
import { useAdministrationLifecycleSession, type AdministrationLifecyclePayload } from '@/hooks/use-administration-lifecycle-session';
import { useAdministrationSaveSession } from '@/hooks/use-administration-save-session';
import type { WorkspaceDraftStoreApi } from '@/lib/workspace/workspace-draft-types';

const auth = { profile: { id: 1 }, permissionCodes: [], globalPermissionCodes: [], roleAssignments: [{ roleId: 1, roleCode: 'system_admin', ownerCompanyId: null, branchId: null, permissionCodes: [] }], roleCodes: ['system_admin'], isAccountActive: true } as unknown as AuthContext;
type Kind = 'branch' | 'organization';
const ui = (kind: Kind, revision = 4, status = 'active') => {
  const row = { id: 81, workspace_revision: revision, owner_company_id: 1, status, company_code: 'SYNTHETIC', legal_name_en: 'Synthetic company', branch_code: 'SYNTHETIC', branch_name_en: 'Synthetic branch' };
  return kind === 'branch' ? <BranchesTable authContext={auth} data={[row as unknown as BranchWithCompany]} /> : <OrganizationsTable authContext={auth} data={[row as unknown as OwnerCompanyWithGeography]} />;
};
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name, exact: true }));
const receipt = (revision: string) => ({ success: true, data: { id: 81, revision, changed: true, replayed: false } });

beforeEach(() => {
  vi.clearAllMocks(); m.store = createWorkspaceDraftStore(); m.owner = 'lifecycle-test';
  m.status.mockImplementation((_id: number, _status: string, contract: { revision: string }) => Promise.resolve(receipt(String(BigInt(contract.revision) + 1n))));
  m.retire.mockImplementation((_id: number, contract: { revision: string }) => Promise.resolve(receipt(String(BigInt(contract.revision) + 1n))));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

for (const kind of ['branch', 'organization'] as const) {
  it(`${kind}: known conflict then refreshed row uses a new operation and current revision`, async () => {
    m.status.mockResolvedValueOnce({ success: false, error: 'A newer revision exists.' });
    const view = render(ui(kind)); click('Deactivate'); await screen.findByRole('alert');
    const original = m.status.mock.calls[0][2]; view.rerender(ui(kind, 8));
    m.status.mockResolvedValueOnce(receipt('9')); click('Deactivate');
    await waitFor(() => expect(m.success).toHaveBeenCalledOnce());
    expect(m.status.mock.calls[1]).toEqual([81, 'inactive', { operationId: expect.any(String), revision: '8' }]);
    expect(m.status.mock.calls[1][2].operationId).not.toBe(original.operationId);
  });
  it(`${kind}: rejected state does not restore an obsolete revision after remount`, async () => {
    m.status.mockResolvedValueOnce({ success: false, error: 'A newer revision exists.' });
    const view = render(ui(kind)); click('Deactivate'); await screen.findByRole('alert'); view.unmount();
    render(ui(kind, 8)); click('Deactivate'); await waitFor(() => expect(m.status).toHaveBeenCalledTimes(2));
    expect(m.status.mock.calls[1][2].revision).toBe('8');
  });
  it(`${kind}: idle row refresh advances the next lifecycle contract`, async () => {
    const view = render(ui(kind)); view.rerender(ui(kind, 8)); click('Deactivate');
    await waitFor(() => expect(m.status).toHaveBeenCalledOnce()); expect(m.status.mock.calls[0][2].revision).toBe('8');
  });
  it(`${kind}: uncertain retirement ignores refreshed row values and revision`, async () => {
    m.retire.mockResolvedValueOnce({ success: false, uncertain: true, error: 'Unconfirmed' });
    const view = render(ui(kind)); click('Retire'); await screen.findByRole('button', { name: 'Retry same change' });
    view.rerender(ui(kind, 8, 'suspended')); click('Retry same change');
    await waitFor(() => expect(m.retire).toHaveBeenCalledTimes(2));
    expect(m.retire.mock.calls[1]).toEqual(m.retire.mock.calls[0]); expect(m.retire.mock.calls[1][1].revision).toBe('4');
    expect(m.status).not.toHaveBeenCalled();
  });
  it(`${kind}: uncertain request restores unchanged across remount despite a newer row`, async () => {
    m.status.mockRejectedValueOnce(Error('transport')); const view = render(ui(kind)); click('Deactivate');
    await screen.findByRole('button', { name: 'Retry same change' }); view.unmount(); render(ui(kind, 8, 'suspended'));
    click('Retry same change'); await waitFor(() => expect(m.status).toHaveBeenCalledTimes(2));
    expect(m.status.mock.calls[1]).toEqual(m.status.mock.calls[0]);
  });
  it(`${kind}: row advance during a request is used only after an authoritative rejection`, async () => {
    let finish!: (value: unknown) => void;
    m.status.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = render(ui(kind)); click('Deactivate'); await waitFor(() => expect(m.status).toHaveBeenCalledOnce());
    view.rerender(ui(kind, 8));
    await act(async () => finish({ success: false, error: 'A newer revision exists.' }));
    click('Deactivate'); await waitFor(() => expect(m.status).toHaveBeenCalledTimes(2));
    expect(m.status.mock.calls[1][2].revision).toBe('8');
  });
  it(`${kind}: a confirmed receipt stays ahead of stale rows, including remount`, async () => {
    const view = render(ui(kind)); click('Deactivate'); await waitFor(() => expect(m.success).toHaveBeenCalledOnce());
    view.unmount(); render(ui(kind)); click('Activate');
    await waitFor(() => expect(m.status).toHaveBeenCalledTimes(2)); expect(m.status.mock.calls[1][2].revision).toBe('5');
  });
  it(`${kind}: later row advance supersedes an older confirmed receipt`, async () => {
    const view = render(ui(kind)); click('Deactivate'); await waitFor(() => expect(m.success).toHaveBeenCalledOnce());
    view.rerender(ui(kind, 8, 'inactive')); click('Activate');
    await waitFor(() => expect(m.status).toHaveBeenCalledTimes(2)); expect(m.status.mock.calls[1][2].revision).toBe('8');
  });
  it(`${kind}: old-account completion does not toast or refresh the replacement account`, async () => {
    let finish!: (value: unknown) => void;
    m.status.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = render(ui(kind)); click('Deactivate'); await waitFor(() => expect(m.status).toHaveBeenCalledOnce());
    view.unmount(); m.store = createWorkspaceDraftStore(); render(ui(kind));
    await act(async () => finish(receipt('5')));
    expect(m.success).not.toHaveBeenCalled(); expect(m.refresh).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Retry same change' })).toBeNull();
    click('Deactivate'); await waitFor(() => expect(m.status).toHaveBeenCalledTimes(2));
    expect(m.status.mock.calls[1][2].operationId).not.toBe(m.status.mock.calls[0][2].operationId);
  });
}

const payload = { status: 'inactive', retire: false } as const;
const storageKey = 'draft:tab:lifecycle-test:direct-lifecycle:administration-lifecycle';
const direct = (revision = 4) => renderHook(({ current }) => useAdministrationLifecycleSession('direct-lifecycle', 81, current), { initialProps: { current: revision } });

it('direct lifecycle: returned request is immutable and pending refresh never changes its contract', () => {
  const hook = direct(); const mutable: AdministrationLifecyclePayload = { ...payload }; const pending = hook.result.current.prepare(mutable);
  mutable.status = 'active'; expect(pending.payload.status).toBe('inactive');
  expect(Object.isFrozen(pending)).toBe(true); expect(Object.isFrozen(pending.payload)).toBe(true); expect(Object.isFrozen(pending.contract)).toBe(true);
  hook.rerender({ current: 8 });
  expect(hook.result.current.prepare({ status: 'active', retire: false })).toBe(pending);
  expect(pending.contract.revision).toBe('4');
});
it.each([null, { id: 82, revision: '5', changed: true, replayed: false }, { id: 81, revision: '3', changed: true, replayed: false }, { id: 81, revision: '5' }])('direct lifecycle: malformed or mismatched receipt keeps exact pending request (%j)', invalid => {
  const hook = direct(); const pending = hook.result.current.prepare(payload);
  expect(() => hook.result.current.accept(invalid)).toThrow(); expect(hook.result.current.getPending()).toBe(pending);
});
it.each([{ revision: '4', changed: false, replayed: false }, { revision: '5', changed: true, replayed: true }])('direct lifecycle: accepts authoritative no-op or replay %j', data => {
  const hook = direct(); const pending = hook.result.current.prepare(payload);
  act(() => { hook.result.current.accept({ id: 81, ...data }); });
  expect(hook.result.current.getPending()).toBeNull(); expect(hook.result.current.uncertain).toBe(false);
  const next = hook.result.current.prepare({ status: 'active', retire: false });
  expect(next.contract.revision).toBe(data.revision); expect(next.contract.operationId).not.toBe(pending.contract.operationId);
});
it.each([undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('direct lifecycle: missing/unsafe row revision cannot create a request (%s)', current => {
  const hook = renderHook(() => useAdministrationLifecycleSession('direct-lifecycle', 81, current));
  expect(() => hook.result.current.prepare(payload)).toThrow(); expect(hook.result.current.getPending()).toBeNull();
});
it('direct lifecycle: arbitrary-precision committed revision cannot regress to a numeric row revision', () => {
  const hook = direct(); hook.result.current.prepare(payload);
  act(() => { hook.result.current.accept({ id: 81, revision: '9007199254740993', changed: true, replayed: false }); });
  hook.rerender({ current: 8 }); expect(hook.result.current.prepare(payload).contract.revision).toBe('9007199254740993');
});
it('direct lifecycle: different tabs and a replacement account get independent requests', () => {
  const first = direct(); const pending = first.result.current.prepare(payload);
  m.owner = 'other-tab'; const other = direct(); expect(other.result.current.getPending()).toBeNull();
  expect(other.result.current.prepare(payload).contract.operationId).not.toBe(pending.contract.operationId);
  m.owner = 'lifecycle-test'; m.store = createWorkspaceDraftStore(); const account = direct(); expect(account.result.current.getPending()).toBeNull();
});
it.each(['form', 'record', 'owner', 'store'] as const)('direct lifecycle: changed %s invalidates old callbacks without mutating the pending record', part => {
  const hook = renderHook(({ form, id }) => useAdministrationLifecycleSession(form, id, 4), { initialProps: { form: 'direct-lifecycle', id: 81 } });
  const old = hook.result.current; old.prepare(payload); const store = m.store as WorkspaceDraftStoreApi; const before = store.getViewState(storageKey);
  if (part === 'owner') m.owner = 'changed'; if (part === 'store') m.store = createWorkspaceDraftStore();
  hook.rerender({ form: part === 'form' ? 'changed' : 'direct-lifecycle', id: part === 'record' ? 82 : 81 });
  expect(old.isCurrent()).toBe(false); expect(() => old.accept(receipt('5').data)).toThrow(); expect(() => old.rejected()).toThrow(); expect(() => old.setUncertain()).toThrow();
  expect(store.getViewState(storageKey)).toBe(before);
});
it('direct lifecycle: unmount invalidates old callbacks but leaves the request recoverable', () => {
  const hook = direct(); const old = hook.result.current; const pending = old.prepare(payload); hook.unmount();
  expect(old.isCurrent()).toBe(false); expect(() => old.accept(receipt('5').data)).toThrow(); expect(() => old.rejected()).toThrow();
  const restored = direct(8); expect(restored.result.current.uncertain).toBe(true); expect(restored.result.current.getPending()).toEqual(pending);
  expect(Object.isFrozen(restored.result.current.getPending()?.payload)).toBe(true);
});
it('direct lifecycle: restores an existing two-part form session without changing the operation', () => {
  const old = renderHook(() => useAdministrationSaveSession('direct-lifecycle', 81, 4));
  const pending = old.result.current.prepare(payload); old.unmount();
  const restored = direct(8); expect(restored.result.current.getPending()).toEqual(pending); expect(restored.result.current.uncertain).toBe(true);
});
it.each(['{broken', JSON.stringify({ id: 82, revision: '4', pending: null, confirmed: null }), JSON.stringify({ id: 81, revision: '4', pending: null, confirmed: { status: 'active', revision: '8' } })])('direct lifecycle: invalid saved envelope fails closed (%s)', stored => {
  const store = m.store as WorkspaceDraftStoreApi; store.setViewState(storageKey, stored); const hook = direct(8);
  expect(hook.result.current.recoveryError).toBeTruthy(); expect(() => hook.result.current.getPending()).toThrow(); expect(() => hook.result.current.prepare(payload)).toThrow(); expect(store.getViewState(storageKey)).toBe(stored);
});
it.each(['payload-missing', 'save-missing', 'contract-mismatch', 'fingerprint-mismatch'] as const)('direct lifecycle: incomplete legacy %s recovery fails closed', failure => {
  const old = renderHook(() => useAdministrationSaveSession('direct-lifecycle', 81, 4)); const pending = old.result.current.prepare(payload); old.unmount();
  const store = m.store as WorkspaceDraftStoreApi;
  if (failure === 'payload-missing') store.setViewState('draft:tab:lifecycle-test:direct-lifecycle:administration-payload', 'null');
  else if (failure === 'save-missing') store.setViewState('draft:tab:lifecycle-test:direct-lifecycle:save', '');
  else if (failure === 'contract-mismatch') store.setViewState('draft:tab:lifecycle-test:direct-lifecycle:administration-payload', JSON.stringify({ ...pending, contract: { ...pending.contract, revision: '8' } }));
  else store.setViewState('draft:tab:lifecycle-test:direct-lifecycle:save', JSON.stringify({ id: 81, revision: '4', pending: { fingerprint: 'not the original payload', contract: pending.contract } }));
  const hook = direct(8); expect(hook.result.current.recoveryError).toBeTruthy(); expect(() => hook.result.current.prepare(payload)).toThrow();
});
