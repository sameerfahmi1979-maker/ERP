// @vitest-environment jsdom
// Actual forms, validation and F04/F06 draft/save sessions; offline action/lookup doubles.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode, InputHTMLAttributes, ComponentType } from 'react';
import type { AuthContext } from '@/lib/rbac/check';
import type { BranchWithCompany, OwnerCompany, OwnerCompanyWithGeography } from '@/types/domain';
import { createWorkspaceDraftStore } from '@/lib/workspace/workspace-draft-store';

const m = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), status: vi.fn(), retire: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(),
  close: vi.fn(), markDirty: vi.fn(), route: vi.fn(), rename: vi.fn(), replace: vi.fn(), refresh: vi.fn(), lookup: vi.fn(), signatory: vi.fn(),
  store: null as unknown, currency: 'AED', owner: 'administration-test', unavailableTable: null as string | null, realGeography: false, geographyFailure: false,
  lookupGate: null as Promise<unknown> | null, dirty: false, lastSave: null as (() => unknown) | null,
}));
vi.mock('@/hooks/use-workspace-form-owner', () => ({ useWorkspaceFormOwner: () => ({ id: m.owner }) }));
vi.mock('@/components/workspace/workspace-draft-provider', () => ({ useWorkspaceDraftStoreContext: () => m.store }));
vi.mock('@/components/workspace/workspace-provider', () => ({ useWorkspaceContext: () => null }));
vi.mock('@/hooks/use-workspace-form-navigation', () => ({ useWorkspaceFormNavigation: () => ({ activeTab: { id: m.owner }, closeTab: m.close, markDirty: m.markDirty, updateTabRoute: m.route, renameTab: m.rename, isTabActive: () => true }) }));
vi.mock('@/hooks/use-workspace-form-section', () => ({ useWorkspaceFormSection: () => ['basic', vi.fn()] }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: m.replace, refresh: m.refresh, push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: m.success, error: m.error, warning: m.warning } }));
vi.mock('@/server/actions/branches', () => ({ createBranch: m.create, updateBranch: m.update, updateBranchStatus: m.status, deleteBranch: m.retire }));
vi.mock('@/server/actions/organizations', () => ({ createOrganization: m.create, updateOrganization: m.update, updateOrganizationStatus: m.status, deleteOrganization: m.retire }));
vi.mock('@/server/actions/common-master-data/owner-company-signatories', () => ({ createCompanySignatory: m.signatory, listCompanySignatories: vi.fn(), softDeleteCompanySignatory: vi.fn(), updateCompanySignatory: m.signatory }));
vi.mock('@tanstack/react-query', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  // Keep the real cache/cancellation/batching contract used by PERF invalidation.
  // No queries are mounted here: business writes and lookup reads remain offline doubles.
  const queryClient = new actual.QueryClient();
  return { ...actual, useQuery: () => ({ data: [], isPending: false, isError: false, refetch: vi.fn() }), useQueryClient: () => queryClient };
});
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: (table: string) => {
  m.lookup(table);
  const response = () => m.lookupGate ?? Promise.resolve(table === m.unavailableTable ? { data: null, error: { message: 'PRIVATE lookup detail' } } : { data: table === 'currencies' ? { id: 1, currency_code: m.currency } : { id: 1, name_en: 'Synthetic place', country_id: 1 }, error: null });
  const query = { select: () => query, eq: () => query, maybeSingle: response, single: response, then: (resolve: (data: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve) };
  return query;
} }) }));
vi.mock('@/components/ui/input', () => ({ Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} /> }));
vi.mock('@/components/ui/checkbox', () => ({ Checkbox: (props: InputHTMLAttributes<HTMLInputElement>) => <input type="checkbox" {...props} /> }));
vi.mock('@/components/ui/textarea', () => ({ Textarea: (props: object) => <textarea {...props} /> }));
vi.mock('@/components/ui/label', () => ({ Label: (props: object) => <label {...props} /> }));
vi.mock('@/components/erp/required-label', () => ({ RequiredLabel: (props: object) => <label {...props} /> }));
vi.mock('@/components/ui/button', () => ({ Button: ({ children, variant: _variant, size: _size, ...props }: { children: ReactNode; variant?: string; size?: string }) => <button {...props}>{children}</button> }));
vi.mock('@/components/workspace/erp-record-workspace-form', () => ({
  ERPRecordWorkspaceForm: ({ children, onSave, onSaveAndClose, isSubmitting, isDirty, onRequestClose }: { children: ReactNode; onSave?: () => void; onSaveAndClose?: () => void; isSubmitting: boolean; isDirty: boolean; onRequestClose?: () => void }) => {
    m.dirty = isDirty; if (onSave) m.lastSave = onSave;
    return <div>{children}<button disabled={!onSave || isSubmitting} onClick={onSave}>Test save</button><button disabled={!onSaveAndClose || isSubmitting} onClick={onSaveAndClose}>Test save and close</button><button disabled={!onRequestClose || isSubmitting} onClick={onRequestClose}>Test close</button></div>;
  },
  ERPRecordSectionPanel: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
type ChoiceProps = { value: number | null; onValueChange: (value: number | null) => void; disabled?: boolean };
vi.mock('@/components/erp/geography/country-select', async importOriginal => { const actual = await importOriginal<typeof import('@/components/erp/geography/country-select')>(); return { CountrySelect: (props: ChoiceProps) => m.realGeography ? <actual.CountrySelect {...props} /> : <input aria-label="country" value={props.value ?? ''} disabled={props.disabled} onChange={e => props.onValueChange(e.target.value ? Number(e.target.value) : null)} /> }; });
vi.mock('@/components/erp/geography/emirate-select', async importOriginal => { const actual = await importOriginal<typeof import('@/components/erp/geography/emirate-select')>(); return { EmirateSelect: (props: ChoiceProps) => m.realGeography ? <actual.EmirateSelect {...props} /> : <input aria-label="emirate" value={props.value ?? ''} disabled={props.disabled} onChange={e => props.onValueChange(e.target.value ? Number(e.target.value) : null)} /> }; });
vi.mock('@/components/erp/geography/city-select', async importOriginal => { const actual = await importOriginal<typeof import('@/components/erp/geography/city-select')>(); return { CitySelect: (props: ChoiceProps) => m.realGeography ? <actual.CitySelect {...props} /> : <input aria-label="city" value={props.value ?? ''} disabled={props.disabled} onChange={e => props.onValueChange(e.target.value ? Number(e.target.value) : null)} /> }; });
vi.mock('@/components/erp/geography/area-zone-select', async importOriginal => { const actual = await importOriginal<typeof import('@/components/erp/geography/area-zone-select')>(); return { AreaZoneSelect: (props: ChoiceProps) => m.realGeography ? <actual.AreaZoneSelect {...props} /> : <input aria-label="area" value={props.value ?? ''} disabled={props.disabled} onChange={e => props.onValueChange(e.target.value ? Number(e.target.value) : null)} /> }; });
vi.mock('@/hooks/lookups', () => {
  const query = () => ({ options: [], isLoading: false, error: m.geographyFailure ? Error('Unavailable') : null });
  return { useCountriesQuery: query, useEmiratesQuery: query, useCitiesQuery: query, useAreasQuery: query };
});
vi.mock('@/components/erp/combobox', () => ({ ERPCombobox: ({ value, options, disabled, placeholder, onValueChange }: { value: string | number | null; options: { value: string | number; label: string; disabled?: boolean }[]; disabled?: boolean; placeholder?: string; onValueChange: (value: string | number | null) => void }) => <select aria-label={placeholder} value={value ?? ''} disabled={disabled} onChange={e => onValueChange(e.target.value || null)}><option value="">Choose</option>{options.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select> }));
vi.mock('@/components/erp/finance-basics/currency-select', () => ({ CurrencySelect: ({ value, onValueChange, disabled }: ChoiceProps) => <input aria-label="currency" value={value ?? ''} disabled={disabled} onChange={e => onValueChange(e.target.value ? Number(e.target.value) : null)} /> }));
vi.mock('@/components/erp/erp-child-dialog-form', () => ({ ERPChildDialogForm: ({ children, onSubmit, submitDisabled }: { children: ReactNode; onSubmit: () => void; submitDisabled?: boolean }) => <div>{children}<button disabled={submitDisabled} onClick={onSubmit}>Test child save</button></div> }));
vi.mock('@/features/ai/common/compliance-checker', () => ({ ComplianceFindingAlert: () => null }));
vi.mock('@/features/ai/common/duplicate-detection', () => ({ DuplicateCandidateAlert: () => null }));
vi.mock('@/features/ai/common/field-suggestions', () => ({ AiFieldSuggestionsPanel: () => null }));
vi.mock('@/features/ai/common/risk-scoring', () => ({ RiskScoreAlert: () => null }));
vi.mock('@/features/dms/entity-documents', () => ({ DmsEntityDocumentsTab: ({ entityId }: { entityId: number }) => <span>Documents for {entityId}</span> }));
vi.mock('@/features/organizations/organization-branding-section', () => ({ OrganizationBrandingSection: () => null }));
vi.mock('@/components/ui/badge', () => ({ Badge: ({ children }: { children: ReactNode }) => <span>{children}</span> }));
vi.mock('@/components/ui/dropdown-menu', () => {
  const Group = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  const Item = ({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) => <button onClick={onClick} disabled={disabled}>{children}</button>;
  return { DropdownMenu: Group, DropdownMenuContent: Group, DropdownMenuGroup: Group, DropdownMenuItem: Item, DropdownMenuLabel: Group, DropdownMenuSeparator: () => null, DropdownMenuTrigger: Item };
});
vi.mock('@/components/erp/table/erp-data-table', () => ({ ERPDataTable: ({ data, columns }: { data: { id: number }[]; columns: { id?: string; cell?: ComponentType<{ row: { original: object } }> }[] }) => <div>{data.map(row => <div key={row.id}>{columns.filter(column => column.id === 'actions').map((column, i) => { const Cell = column.cell!; return <Cell key={i} row={{ original: row }} />; })}</div>)}</div> }));

import { BranchWorkspaceForm } from '@/features/branches/branch-workspace-form';
import { OrganizationWorkspaceForm } from '@/features/organizations/organization-workspace-form';
import { BranchesTable } from '@/features/branches/branches-table';
import { OrganizationsTable } from '@/features/organizations/organizations-table';

const auth = { profile: { id: 1 }, permissionCodes: [], globalPermissionCodes: [], roleAssignments: [{ roleId: 1, roleCode: 'system_admin', ownerCompanyId: null, branchId: null, permissionCodes: [] }], roleCodes: ['system_admin'], isAccountActive: true } as unknown as AuthContext;
type Kind = 'branch' | 'organization';
const row = (kind: Kind, revision: number | undefined = 4) => ({ id: 81, workspace_revision: revision, [kind === 'branch' ? 'branch_code' : 'company_code']: 'SYNTHETIC', [kind === 'branch' ? 'branch_name_en' : 'legal_name_en']: 'Synthetic record', owner_company_id: 1, status: 'active', default_currency: 'AED', country_id: null, emirate_id: null, city_id: null, area_zone_id: null, vat_registered: false });
const ui = (kind: Kind, mode: 'add' | 'edit' | 'view' = 'add', revision: number | undefined = 4) => kind === 'branch'
  ? <BranchWorkspaceForm mode={mode} authContext={auth} branch={mode === 'add' ? null : row(kind, revision) as unknown as BranchWithCompany} companies={[{ id: 1, legal_name_en: 'Synthetic company', company_code: 'COMP' } as OwnerCompany]} />
  : <OrganizationWorkspaceForm mode={mode} authContext={auth} organization={mode === 'add' ? null : row(kind, revision) as unknown as OwnerCompany} />;
const field = (name: string) => document.querySelector(`[name="${name}"]`) as HTMLInputElement;
const change = (name: string, value: string) => fireEvent.change(field(name), { target: { value } });
const nameField = (kind: Kind) => kind === 'branch' ? 'branch_name_en' : 'legal_name_en';
const fill = async (kind: Kind) => {
  if (kind === 'organization') await waitFor(() => expect((screen.getByLabelText('currency') as HTMLInputElement).value).toBe('1'));
  change(nameField(kind), 'Synthetic record'); change(kind === 'branch' ? 'branch_code' : 'company_code', 'SYNTHETIC');
  if (kind === 'branch') change('owner_company_id', '1');
};
const save = (close = false) => fireEvent.click(screen.getByRole('button', { name: close ? 'Test save and close' : 'Test save' }));
beforeEach(() => {
  vi.resetAllMocks(); m.store = createWorkspaceDraftStore(); m.currency = 'AED'; m.owner = 'administration-test'; m.unavailableTable = null; m.realGeography = false; m.geographyFailure = false;
  m.lookupGate = null; m.dirty = false; m.lastSave = null;
  m.create.mockResolvedValue({ success: true, data: { id: 81, revision: '1', changed: true, replayed: false } });
  m.update.mockResolvedValue({ success: true, data: { id: 81, revision: '5', changed: true, replayed: false } });
  m.status.mockResolvedValue({ success: true, data: { id: 81, revision: '5', changed: true, replayed: false } });
  m.retire.mockResolvedValue({ success: true, data: { id: 81, revision: '5', changed: true, replayed: false } });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

for (const kind of ['branch', 'organization'] as const) {
  it(`${kind}: confirmed creation becomes an update with the receipt revision`, async () => {
    render(ui(kind)); await fill(kind); change(kind === 'branch' ? 'latitude' : 'icv_score', '0');
    if (kind === 'organization') fireEvent.click(field('vat_registered'));
    save(); await waitFor(() => expect(m.success).toHaveBeenCalledOnce());
    expect(m.create.mock.calls[0][1]).toEqual({ operationId: expect.any(String), revision: null });
    expect(m.create.mock.calls[0][0]).toMatchObject(kind === 'branch' ? { latitude: 0, has_yard: false } : { icv_score: 0, vat_registered: false });
    expect(field(kind === 'branch' ? 'branch_code' : 'company_code').disabled).toBe(true);
    expect(m.route).toHaveBeenCalledWith(m.owner, `/admin/${kind === 'branch' ? 'branches' : 'organizations'}/record/81?mode=edit`, 81, 'edit');
    expect(screen.getByText('Documents for 81')).toBeTruthy();
    change(nameField(kind), 'Updated record'); save(true); await waitFor(() => expect(m.close).toHaveBeenCalledWith(m.owner, { force: true }));
    expect(m.create).toHaveBeenCalledOnce(); expect(m.update.mock.calls[0][0]).toMatchObject({ id: 81, [nameField(kind)]: 'Updated record' });
    expect(m.update.mock.calls[0][0]).not.toHaveProperty(kind === 'branch' ? 'branch_code' : 'company_code');
    expect(m.update.mock.calls[0][1].revision).toBe('1');
  });
  it.each(['uncertain', 'throws', 'malformed', 'wrong-record'])(`${kind}: %s retains exact operation and payload until confirmed`, async failure => {
    const action = failure === 'wrong-record' ? m.update : m.create;
    if (failure === 'throws') action.mockRejectedValueOnce(Error('PRIVATE transport detail'));
    else action.mockResolvedValueOnce(failure === 'uncertain' ? { success: false, uncertain: true, error: 'Unconfirmed' } : { success: true, data: failure === 'wrong-record' ? { id: 82, revision: '5', changed: true, replayed: false } : { id: 81 } });
    render(ui(kind, failure === 'wrong-record' ? 'edit' : 'add')); if (failure !== 'wrong-record') await fill(kind); else if (kind === 'organization') await waitFor(() => expect((screen.getByLabelText('currency') as HTMLInputElement).value).toBe('1'));
    change('notes', 'Retain my draft'); save(true); await waitFor(() => expect(m.error).toHaveBeenCalled());
    expect(field(nameField(kind)).disabled).toBe(true); expect(field('notes').value).toBe('Retain my draft'); expect(m.close).not.toHaveBeenCalled(); expect(m.success).not.toHaveBeenCalled();
    expect(JSON.stringify(m.error.mock.calls)).not.toContain('PRIVATE');
    const lookupCount = m.lookup.mock.calls.length; m.currency = 'USD'; save(true);
    await waitFor(() => expect(m.close).toHaveBeenCalledOnce()); expect(action.mock.calls[1]).toEqual(action.mock.calls[0]); expect(m.lookup).toHaveBeenCalledTimes(lookupCount);
  });
  it(`${kind}: a lost response survives remount and reuses the submitted payload`, async () => {
    m.create.mockRejectedValueOnce(Error('lost')); const first = render(ui(kind)); await fill(kind); change('notes', 'Retained across tabs'); save();
    await waitFor(() => expect(m.error).toHaveBeenCalled()); first.unmount(); m.currency = 'USD';
    render(ui(kind)); expect(field('notes').value).toBe('Retained across tabs'); expect(field(nameField(kind)).disabled).toBe(true);
    save(); await waitFor(() => expect(m.create).toHaveBeenCalledTimes(2)); expect(m.create.mock.calls[1]).toEqual(m.create.mock.calls[0]);
  });
  it(`${kind}: rejection retains draft, advances no revision, and permits correction`, async () => {
    m.update.mockResolvedValueOnce({ success: false, error: 'A newer revision exists.' }); render(ui(kind, 'edit'));
    if (kind === 'organization') await waitFor(() => expect((screen.getByLabelText('currency') as HTMLInputElement).value).toBe('1'));
    change('notes', 'Rejected draft'); save(true); await waitFor(() => expect(m.error).toHaveBeenCalled()); expect(m.close).not.toHaveBeenCalled(); expect(field('notes').value).toBe('Rejected draft'); expect(field('notes').disabled).toBe(false);
    change('notes', 'Corrected draft'); save(); await waitFor(() => expect(m.update).toHaveBeenCalledTimes(2));
    expect(m.update.mock.calls.map(call => call[1].revision)).toEqual(['4', '4']); expect(m.update.mock.calls[0][1].operationId).not.toBe(m.update.mock.calls[1][1].operationId);
  });
  it(`${kind}: simultaneous submissions dispatch once`, async () => {
    let finish!: (value: unknown) => void; m.create.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(ui(kind)); await fill(kind); save(); save(); await waitFor(() => expect(m.create).toHaveBeenCalledOnce());
    await act(async () => finish({ success: true, data: { id: 81, revision: '1', changed: true, replayed: false } }));
  });
  it.each(['success', 'rejection', 'transport failure'])(`${kind}: late %s after account/editor replacement cannot accept, close, or navigate`, async outcome => {
    let finish!: () => void;
    m.create.mockImplementationOnce(() => new Promise((resolve, reject) => { finish = () => outcome === 'transport failure' ? reject(Error('offline')) : resolve(outcome === 'success' ? { success: true, data: { id: 81, revision: '1', changed: true, replayed: false } } : { success: false, error: 'Rejected' }); }));
    const oldStore = m.store as ReturnType<typeof createWorkspaceDraftStore>;
    const first = render(ui(kind)); await fill(kind); change('notes', 'Original owner'); save(true); await waitFor(() => expect(m.create).toHaveBeenCalledOnce());
    const key = `draft:tab:${m.owner}:${kind}-workspace-form:administration-payload`; const originalRequest = oldStore.getViewState(key);
    first.unmount(); m.store = createWorkspaceDraftStore(); render(ui(kind, 'edit'));
    m.error.mockClear(); m.success.mockClear(); m.markDirty.mockClear();
    await act(async () => finish());
    expect(m.success).not.toHaveBeenCalled(); expect(m.error).not.toHaveBeenCalled(); expect(m.close).not.toHaveBeenCalled(); expect(m.route).not.toHaveBeenCalled(); expect(m.replace).not.toHaveBeenCalled(); expect(m.refresh).not.toHaveBeenCalled();
    expect(oldStore.getViewState(key)).toBe(originalRequest); expect((m.store as ReturnType<typeof createWorkspaceDraftStore>).getViewState(key)).toBeUndefined();
  });
  it(`${kind}: view mode cannot save`, async () => {
    render(ui(kind, 'view')); expect((screen.getByRole('button', { name: 'Test save' }) as HTMLButtonElement).disabled).toBe(true); expect(field(nameField(kind)).disabled).toBe(true); expect(m.create).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
  });
  it(`${kind}: corrupt underlying save state is visible and cannot dispatch a replacement operation`, async () => {
    const key = `draft:tab:${m.owner}:${kind}-workspace-form:save`;
    (m.store as ReturnType<typeof createWorkspaceDraftStore>).setViewState(key, '{');
    render(ui(kind, 'edit'));
    expect(screen.getByRole('status').textContent).toContain('could not be verified'); expect(field(nameField(kind)).disabled).toBe(true);
    save(); await waitFor(() => expect(m.error).toHaveBeenCalled()); expect(m.update).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
    expect((m.store as ReturnType<typeof createWorkspaceDraftStore>).getViewState(key)).toBe('{');
  });
  it(`${kind}: list retirement retains history and recovers an uncertain receipt`, async () => {
    m.retire.mockResolvedValueOnce({ success: false, uncertain: true, error: 'Unconfirmed' });
    render(kind === 'branch' ? <BranchesTable authContext={auth} data={[row(kind) as unknown as BranchWithCompany]} /> : <OrganizationsTable authContext={auth} data={[row(kind) as unknown as OwnerCompanyWithGeography]} />);
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull(); fireEvent.click(screen.getByRole('button', { name: 'Retire' }));
    await screen.findByRole('button', { name: 'Retry same change' }); expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('history is retained')); expect(m.refresh).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Deactivate' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Retry same change' })); await waitFor(() => expect(m.refresh).toHaveBeenCalledOnce());
    expect(m.retire.mock.calls[1]).toEqual(m.retire.mock.calls[0]); expect(m.retire.mock.calls[0][1].revision).toBe('4');
    fireEvent.click(screen.getByRole('button', { name: 'Activate' })); await waitFor(() => expect(m.status).toHaveBeenCalledOnce()); expect(m.status.mock.calls[0][2].revision).toBe('5');
  });
}

it('branch inferred text relationships stay omitted until the user explicitly clears them', async () => {
  render(ui('branch', 'edit')); change('notes', 'Preserve historical text'); save(); await waitFor(() => expect(m.update).toHaveBeenCalledOnce()); expect(m.update.mock.calls[0][0]).not.toHaveProperty('emirate_id');
  fireEvent.change(screen.getByLabelText('country'), { target: { value: '1' } }); fireEvent.change(screen.getByLabelText('country'), { target: { value: '' } }); save();
  await waitFor(() => expect(m.update).toHaveBeenCalledTimes(2)); expect(m.update.mock.calls[1][0]).toMatchObject({ emirate_id: null, city_id: null, area_zone_id: null });
});
it('organization explicit geography clear remains null and office identifiers survive', async () => {
  render(ui('organization', 'edit')); await waitFor(() => expect((screen.getByLabelText('currency') as HTMLInputElement).value).toBe('1'));
  fireEvent.change(screen.getByLabelText('country'), { target: { value: '1' } }); fireEvent.change(screen.getByLabelText('country'), { target: { value: '' } });
  fireEvent.change(screen.getAllByLabelText('emirate')[1], { target: { value: '3' } }); fireEvent.change(screen.getAllByLabelText('city')[1], { target: { value: '7' } }); save();
  await waitFor(() => expect(m.update).toHaveBeenCalledOnce()); expect(m.update.mock.calls[0][0]).toMatchObject({ country_id: null, emirate_id: null, city_id: null, area_zone_id: null, office_emirate_id: 3, office_city_id: 7 });
});
it('organization geography lookup failure retains the saved identifier and draft without dispatch', async () => {
  m.unavailableTable = 'countries';
  render(<OrganizationWorkspaceForm mode="edit" authContext={auth} organization={{ ...row('organization'), country_id: 1, country: 'Historical country' } as unknown as OwnerCompany} />);
  await waitFor(() => expect((screen.getByLabelText('currency') as HTMLInputElement).value).toBe('1')); change('notes', 'Retain until reference is available'); save();
  await waitFor(() => expect(m.error).toHaveBeenCalled()); expect(m.update).not.toHaveBeenCalled();
  expect((screen.getByLabelText('country') as HTMLInputElement).value).toBe('1'); expect(field('notes').value).toBe('Retain until reference is available'); expect(field('notes').disabled).toBe(false);
  m.unavailableTable = null; save(); await waitFor(() => expect(m.update).toHaveBeenCalledOnce());
  expect(m.update.mock.calls[0][0]).toMatchObject({ country_id: 1, country: 'Synthetic place', notes: 'Retain until reference is available' });
  expect(JSON.stringify(m.error.mock.calls)).not.toContain('PRIVATE');
});
it('an open signatory dialog cannot submit after company management authority is revoked', async () => {
  const record = row('organization') as unknown as OwnerCompany;
  const first = render(<OrganizationWorkspaceForm mode="edit" authContext={auth} organization={record} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add Signatory' }));
  const childName = screen.getByLabelText('Full Name *') as HTMLInputElement; fireEvent.change(childName, { target: { value: 'Retained child draft' } });
  first.rerender(<OrganizationWorkspaceForm mode="edit" authContext={scopedAuth(null, null, false)} organization={record} />);
  expect((screen.getByRole('button', { name: 'Test child save' }) as HTMLButtonElement).disabled).toBe(true);
  expect(childName.closest('fieldset')?.disabled).toBe(true); expect(childName.value).toBe('Retained child draft');
  fireEvent.submit(childName.closest('form')!); await act(async () => {}); expect(m.signatory).not.toHaveBeenCalled();
});
it('branch existing owner label survives an unavailable or restricted company-choice list', () => {
  render(<BranchWorkspaceForm mode="view" authContext={auth} branch={{ ...row('branch'), owner_company: { id: 1, legal_name_en: 'Historical owner', company_code: 'OLD', status: 'inactive' } } as unknown as BranchWithCompany} companies={[]} />);
  const owner = field('owner_company_id') as unknown as HTMLSelectElement;
  expect(owner.value).toBe('1'); expect(owner.selectedOptions[0].textContent).toBe('Historical owner (OLD)'); expect(owner.disabled).toBe(true);
});
for (const kind of ['branch', 'organization'] as const) for (const mode of ['view', 'edit'] as const) for (const failed of [false, true]) {
  it(`${kind} ${mode}: real geography widgets retain saved labels when ${failed ? 'lookup reads fail' : 'active choices omit historical IDs'}`, async () => {
    m.realGeography = true; m.geographyFailure = failed; if (failed) m.unavailableTable = 'emirates';
    const record = { ...row(kind), country_id: 1, country: 'Historical country', emirate_id: 2, emirate: 'Historical emirate', city_id: 3, city: 'Historical city', area_zone_id: 4, area: 'Historical area', office_emirate_id: 5, office_city_id: 6 };
    render(kind === 'branch' ? <BranchWorkspaceForm mode={mode} authContext={auth} branch={record as unknown as BranchWithCompany} companies={[]} /> : <OrganizationWorkspaceForm mode={mode} authContext={auth} organization={record as unknown as OwnerCompany} />);
    await act(async () => {});
    for (const label of ['Historical emirate', 'Historical city', 'Historical area', ...(kind === 'organization' ? ['Historical country', 'Emirate #5', 'City #6'] : [])]) {
      const option = screen.getByRole('option', { name: `${label} (saved selection)` }) as HTMLOptionElement;
      expect(option.selected).toBe(true); expect(option.disabled).toBe(true);
      if (failed || mode === 'view') expect((option.parentElement as HTMLSelectElement).disabled).toBe(true);
    }
    expect(m.create).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
  });
}

function scopedAuth(companyId: number | null, branchId: number | null, manage = true): AuthContext {
  const view = ['branches.view', 'organizations.view'];
  const writes = manage ? ['branches.manage', 'organizations.manage'] : [];
  return { ...auth, roleCodes: ['reader', 'manager'], permissionCodes: [...view, ...writes], globalPermissionCodes: [...view, ...(companyId === null && branchId === null ? writes : [])], roleAssignments: [
    { roleId: 2, roleCode: 'reader', ownerCompanyId: null, branchId: null, permissionCodes: view },
    { roleId: 3, roleCode: 'manager', ownerCompanyId: companyId, branchId, permissionCodes: writes },
  ] };
}
for (const kind of ['branch', 'organization'] as const) {
  const company = kind === 'branch' ? 1 : 81;
  for (const actor of ['reader', 'company-manager', 'other-company-manager', 'branch-manager', 'sibling-branch-manager', 'global-manager', 'inactive'] as const) {
    it(`${kind} row actions respect ${actor} scope`, () => {
      const ctx = actor === 'reader' ? scopedAuth(null, null, false) : actor === 'company-manager' ? scopedAuth(company, null) : actor === 'other-company-manager' ? scopedAuth(company + 1, null) : actor === 'branch-manager' ? scopedAuth(company, 81) : actor === 'sibling-branch-manager' ? scopedAuth(company, 82) : scopedAuth(null, null);
      if (actor === 'inactive') ctx.isAccountActive = false;
      const allowed = actor === 'global-manager' || actor === 'company-manager' || (kind === 'branch' && actor === 'branch-manager');
      render(kind === 'branch' ? <BranchesTable authContext={ctx} data={[row(kind) as unknown as BranchWithCompany]} /> : <OrganizationsTable authContext={ctx} data={[row(kind) as unknown as OwnerCompanyWithGeography]} />);
      expect(screen.getByRole('button', { name: 'View' })).toBeTruthy();
      for (const name of ['Edit', 'Deactivate', 'Retire']) expect(screen.queryByRole('button', { name }) !== null).toBe(allowed);
    });
    it(`${kind} manually requested edit form respects ${actor} scope`, () => {
      const ctx = actor === 'reader' ? scopedAuth(null, null, false) : actor === 'company-manager' ? scopedAuth(company, null) : actor === 'other-company-manager' ? scopedAuth(company + 1, null) : actor === 'branch-manager' ? scopedAuth(company, 81) : actor === 'sibling-branch-manager' ? scopedAuth(company, 82) : scopedAuth(null, null);
      if (actor === 'inactive') ctx.isAccountActive = false;
      const allowed = actor === 'global-manager' || actor === 'company-manager' || (kind === 'branch' && actor === 'branch-manager');
      render(kind === 'branch'
        ? <BranchWorkspaceForm authContext={ctx} mode="edit" branch={row(kind) as unknown as BranchWithCompany} companies={[{ id: company, legal_name_en: 'Company' } as OwnerCompany]} />
        : <OrganizationWorkspaceForm authContext={ctx} mode="edit" organization={row(kind) as unknown as OwnerCompany} />);
      expect((screen.getByRole('button', { name: 'Test save' }) as HTMLButtonElement).disabled).toBe(!allowed);
      expect(field(nameField(kind)).disabled).toBe(!allowed);
    });
  }
  it(`${kind}: permission from one assignment cannot combine with scope from another`, () => {
    const ctx = scopedAuth(company + 1, null);
    ctx.roleAssignments!.push({ roleId: 4, roleCode: 'local-reader', ownerCompanyId: company, branchId: kind === 'branch' ? 81 : null, permissionCodes: ['branches.view', 'organizations.view'] });
    render(kind === 'branch' ? <BranchesTable authContext={ctx} data={[row(kind) as unknown as BranchWithCompany]} /> : <OrganizationsTable authContext={ctx} data={[row(kind) as unknown as OwnerCompanyWithGeography]} />);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull(); expect(screen.queryByRole('button', { name: 'Retire' })).toBeNull();
  });
  it(`${kind}: permission removal hides the retry of a pending status change`, async () => {
    m.retire.mockResolvedValueOnce({ success: false, uncertain: true });
    const table = (ctx: AuthContext) => kind === 'branch' ? <BranchesTable authContext={ctx} data={[row(kind) as unknown as BranchWithCompany]} /> : <OrganizationsTable authContext={ctx} data={[row(kind) as unknown as OwnerCompanyWithGeography]} />;
    const view = render(table(scopedAuth(company, null))); fireEvent.click(screen.getByRole('button', { name: 'Retire' })); await screen.findByRole('button', { name: 'Retry same change' });
    view.rerender(table(scopedAuth(null, null, false))); expect(screen.queryByRole('button', { name: 'Retry same change' })).toBeNull(); expect(m.retire).toHaveBeenCalledOnce();
  });
}
it('branch creation offers only companies with company-wide management authority', () => {
  const companies = [{ id: 1, legal_name_en: 'Authorized company', company_code: 'OWN' }, { id: 2, legal_name_en: 'Sibling company', company_code: 'OTHER' }] as OwnerCompany[];
  render(<BranchWorkspaceForm mode="add" authContext={scopedAuth(1, null)} companies={companies} />);
  expect(screen.queryByRole('option', { name: /Authorized company/ })).toBeTruthy(); expect(screen.queryByRole('option', { name: /Sibling company/ })).toBeNull();
  expect((screen.getByRole('button', { name: 'Test save' }) as HTMLButtonElement).disabled).toBe(false);
});
it('branch-only assignment cannot create a new sibling branch', () => {
  render(<BranchWorkspaceForm mode="add" authContext={scopedAuth(1, 81)} companies={[{ id: 1, legal_name_en: 'Company' } as OwnerCompany]} />);
  expect((screen.getByRole('button', { name: 'Test save' }) as HTMLButtonElement).disabled).toBe(true);
});
it('company-only organization manager cannot create a new organization', () => {
  render(<OrganizationWorkspaceForm mode="add" authContext={scopedAuth(81, null)} />);
  expect((screen.getByRole('button', { name: 'Test save' }) as HTMLButtonElement).disabled).toBe(true);
});

function w21Deferred() { let resolve!: (value: unknown) => void; const promise = new Promise<unknown>(done => { resolve = done; }); return { promise, resolve }; }
const w21Store = () => m.store as ReturnType<typeof createWorkspaceDraftStore>;
const w21Keys = (kind: Kind) => ({ save: `draft:tab:${m.owner}:${kind}-workspace-form:save`, payload: `draft:tab:${m.owner}:${kind}-workspace-form:administration-payload` });
for (const kind of ['organization', 'branch'] as const) {
  for (const history of ['first-known', 'prior-unknown'] as const) {
    for (const part of ['save', 'payload'] as const) {
      it.each(['missing', 'replaced', 'unreadable'] as const)(`W29 ${kind}: ${history} with ${part} %s witness preserves outcome without local writes`, async fault => {
        const gate = w21Deferred();
        if (history === 'prior-unknown') m.update.mockResolvedValueOnce({ success: false, uncertain: true });
        m.update.mockReturnValueOnce(gate.promise);
        render(ui(kind, 'edit'));
        if (kind === 'organization') await waitFor(() => expect((screen.getByLabelText('currency') as HTMLInputElement).value).toBe('1'));
        change('notes', 'W29 retained draft');
        if (history === 'prior-unknown') {
          save();
          await waitFor(() => expect(m.error).toHaveBeenCalled());
          await waitFor(() => expect((screen.getByRole('button', { name: 'Test save' }) as HTMLButtonElement).disabled).toBe(false));
          m.error.mockClear();
        }
        const expectedCalls = history === 'prior-unknown' ? 2 : 1;
        const oldSave = m.lastSave;
        save();
        await waitFor(() => expect(m.update).toHaveBeenCalledTimes(expectedCalls));
        if (history === 'prior-unknown') expect(m.update.mock.calls[1]).toEqual(m.update.mock.calls[0]);
        const store = w21Store(), keys = w21Keys(kind), read = store.getViewState.bind(store);
        if (fault === 'replaced') store.setViewState(keys[part], JSON.stringify({ id: 999, revision: '99' }));
        const expectedBytes = [read(keys.save), read(keys.payload)];
        const readFault = fault === 'replaced' ? null : vi.spyOn(store, 'getViewState').mockImplementation(key => {
          if (key === keys[part]) {
            if (fault === 'unreadable') throw Error('PRIVATE W29 witness');
            return undefined;
          }
          return read(key);
        });
        const write = vi.spyOn(store, 'setViewState');
        const clear = vi.spyOn(store, 'clearDraft');
        const guidance = vi.fn();
        field('notes').closest('form')!.addEventListener('workspace-field-errors', guidance);
        await act(async () => { gate.resolve({ success: false, uncertain: false, error: 'Known denial', fieldErrors: { notes: 'Do not offer field correction' } }); });
        await waitFor(() => expect((screen.getByRole('button', { name: 'Test save' }) as HTMLButtonElement).disabled).toBe(true));
        if (history === 'first-known') {
          expect(screen.getByRole('status').textContent).toMatch(/rejected.*reopen/i);
          expect(screen.getByRole('status').textContent).not.toMatch(/unconfirmed/i);
          expect(JSON.stringify(m.error.mock.calls)).not.toMatch(/unconfirmed/i);
        } else {
          expect(screen.getByRole('status').textContent).not.toMatch(/rejected/i);
          expect(JSON.stringify(m.error.mock.calls)).toMatch(/unconfirmed/i);
        }
        expect(m.dirty).toBe(true);
        expect(field('notes').disabled).toBe(true);
        expect(field('notes').value).toBe('W29 retained draft');
        expect(guidance).not.toHaveBeenCalled();
        expect(m.success).not.toHaveBeenCalled();
        expect(m.route).not.toHaveBeenCalled();
        expect(m.close).not.toHaveBeenCalled();
        expect(JSON.stringify(m.error.mock.calls)).not.toContain('PRIVATE');
        expect(write).not.toHaveBeenCalled();
        expect(clear).not.toHaveBeenCalled();
        readFault?.mockRestore();
        expect([read(keys.save), read(keys.payload)]).toEqual(expectedBytes);
        await act(async () => { await oldSave?.(); });
        fireEvent.submit(field('notes').closest('form')!);
        expect(m.update).toHaveBeenCalledTimes(expectedCalls);
        expect(write).not.toHaveBeenCalled();
        expect(clear).not.toHaveBeenCalled();
      });
    }
  }
}
for (const kind of ['organization', 'branch'] as const) {
  it.each(['Permission denied', 'Known aborted request'])(`W21 ${kind}: unknown then %s survives two remounts with the original request`, async error => {
    m.update.mockResolvedValueOnce({ success: false, uncertain: true }).mockResolvedValueOnce({ success: false, uncertain: false, error, fieldErrors: { notes: 'Must not suggest correction' } }).mockResolvedValueOnce({ success: true, data: { id: 81, revision: '5', changed: false, replayed: true } });
    const first = render(ui(kind, 'edit')); if (kind === 'organization') await waitFor(() => expect((screen.getByLabelText('currency') as HTMLInputElement).value).toBe('1'));
    change('notes', 'Original immutable draft'); save(); await waitFor(() => expect(m.error).toHaveBeenCalled()); const original = structuredClone(m.update.mock.calls[0]); first.unmount();
    m.currency = 'USD'; const second = render(ui(kind, 'edit', 9));
    const guidance = vi.fn(); field('notes').closest('form')!.addEventListener('workspace-field-errors', guidance);
    save(); await waitFor(() => expect(m.update).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/earlier.*unconfirmed/i));
    expect(field('notes').disabled).toBe(true); expect(m.dirty).toBe(true); fireEvent.click(screen.getByRole('button', { name: 'Test close' })); expect(m.close).not.toHaveBeenCalled();
    expect(guidance).not.toHaveBeenCalled(); expect(JSON.stringify(m.error.mock.calls)).not.toContain('Must not suggest correction'); second.unmount();
    render(ui(kind, 'edit', 12)); const lookups = m.lookup.mock.calls.length; save(); await waitFor(() => expect(m.success).toHaveBeenCalledWith('No changes to save'));
    expect(m.update.mock.calls).toEqual([original, original, original]); expect(m.lookup).toHaveBeenCalledTimes(lookups);
  });
  for (const failure of ['accept before write', 'accept after write', 'draft cleanup', 'success notice', 'route update'] as const) {
    it(`W21 ${kind}: ${failure} after receipt is confirmed, terminal and clean with close recovery`, async () => {
      render(ui(kind, 'edit')); if (kind === 'organization') await waitFor(() => expect((screen.getByLabelText('currency') as HTMLInputElement).value).toBe('1'));
      change('notes', 'Confirmed draft'); const store = w21Store(), keys = w21Keys(kind);
      if (failure.startsWith('accept')) { const write = store.setViewState.bind(store); vi.spyOn(store, 'setViewState').mockImplementation((key, value) => { if (key === keys.payload && value === 'null') { if (failure === 'accept after write') write(key, value); throw Error('PRIVATE'); } write(key, value); }); }
      if (failure === 'draft cleanup') vi.spyOn(store, 'clearDraft').mockImplementationOnce(() => { throw Error('PRIVATE'); });
      if (failure === 'success notice') m.success.mockImplementationOnce(() => { throw Error('PRIVATE'); });
      if (failure === 'route update') m.route.mockImplementationOnce(() => { throw Error('PRIVATE'); });
      const oldSave = m.lastSave; save(); await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/saved.*reopen/i));
      expect(screen.getByRole('status').textContent).not.toMatch(/unconfirmed|not saved/i); expect(m.dirty).toBe(false); expect(field('notes').disabled).toBe(true);
      expect((screen.getByRole('button', { name: 'Test save' }) as HTMLButtonElement).disabled).toBe(true);
      await act(async () => { await oldSave?.(); }); fireEvent.submit(field('notes').closest('form')!); expect(m.update).toHaveBeenCalledOnce();
      fireEvent.click(screen.getByRole('button', { name: 'Test close' })); expect(m.close).toHaveBeenCalledOnce(); expect(JSON.stringify(m.error.mock.calls)).not.toContain('PRIVATE');
    });
  }
  it.each([false, true])(`W21 ${kind}: known-first local clearing failure afterWrite=%s stays known and blocks another operation`, async afterWrite => {
    m.update.mockResolvedValueOnce({ success: false, uncertain: false, error: 'Definite rejection' }); render(ui(kind, 'edit'));
    if (kind === 'organization') await waitFor(() => expect((screen.getByLabelText('currency') as HTMLInputElement).value).toBe('1'));
    change('notes', 'Rejected draft'); const store = w21Store(), keys = w21Keys(kind), write = store.setViewState.bind(store);
    vi.spyOn(store, 'setViewState').mockImplementation((key, value) => { if (key === keys.payload && value === 'null') { if (afterWrite) write(key, value); throw Error('PRIVATE'); } write(key, value); });
    const oldSave = m.lastSave; save(); await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/rejected.*reopen/i));
    expect(screen.getByRole('status').textContent).not.toMatch(/unconfirmed|was saved/i); expect(m.dirty).toBe(true); expect(field('notes').value).toBe('Rejected draft');
    await act(async () => { await oldSave?.(); }); expect(m.update).toHaveBeenCalledOnce(); expect(m.success).not.toHaveBeenCalled();
  });
  for (const phase of ['lookup', 'action'] as const) {
    it(`W21 ${kind}: deferred ${phase} cannot resume after owner A-B-A`, async () => {
      const gate = w21Deferred(), view = render(ui(kind, 'edit'));
      if (kind === 'organization') await waitFor(() => expect((screen.getByLabelText('currency') as HTMLInputElement).value).toBe('1'));
      if (phase === 'lookup') { if (kind === 'branch') fireEvent.change(screen.getByLabelText('emirate'), { target: { value: '1' } }); m.lookupGate = gate.promise; }
      else m.update.mockReturnValueOnce(gate.promise);
      const lookupsBeforeSave = m.lookup.mock.calls.length;
      save(); await waitFor(() => phase === 'action' ? expect(m.update).toHaveBeenCalledOnce() : expect(m.lookup.mock.calls.length).toBeGreaterThan(lookupsBeforeSave));
      const owner = m.owner, before = w21Store().getViewState(w21Keys(kind).payload); m.owner = 'other-owner'; view.rerender(ui(kind, 'edit')); m.owner = owner; view.rerender(ui(kind, 'edit'));
      await act(async () => { gate.resolve(phase === 'action' ? { success: true, data: { id: 81, revision: '5', changed: true, replayed: false } } : { data: { id: 1, currency_code: 'AED', name_en: 'Place' }, error: null }); });
      expect(m.update).toHaveBeenCalledTimes(phase === 'action' ? 1 : 0); expect(m.success).not.toHaveBeenCalled(); expect(m.route).not.toHaveBeenCalled(); expect(w21Store().getViewState(w21Keys(kind).payload)).toBe(before);
    });
  }
  it.each(['save', 'payload'] as const)(`W21 ${kind}: replacement %s before dispatch blocks Save with verified recovery guidance`, async part => {
    render(ui(kind, 'edit'));
    if (kind === 'organization') await waitFor(() => expect((screen.getByLabelText('currency') as HTMLInputElement).value).toBe('1'));
    const key = w21Keys(kind)[part], replacement = JSON.stringify({ id: 999, revision: '9' }); w21Store().setViewState(key, replacement);
    const oldSave = m.lastSave; save(); await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/saved request could not be verified/i));
    expect((screen.getByRole('button', { name: 'Test save' }) as HTMLButtonElement).disabled).toBe(true);
    expect(field('notes').disabled).toBe(true); await act(async () => { await oldSave?.(); });
    expect(m.update).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled(); expect(w21Store().getViewState(key)).toBe(replacement);
  });
  it.each(['save', 'payload'] as const)(`W21 ${kind}: replacement %s during dispatch is not overwritten by confirmed acknowledgement`, async part => {
    const gate = w21Deferred(); m.update.mockReturnValueOnce(gate.promise); render(ui(kind, 'edit'));
    if (kind === 'organization') await waitFor(() => expect((screen.getByLabelText('currency') as HTMLInputElement).value).toBe('1'));
    save(); await waitFor(() => expect(m.update).toHaveBeenCalledOnce()); const key = w21Keys(kind)[part], replacement = JSON.stringify({ id: 999, revision: '9' }); w21Store().setViewState(key, replacement);
    await act(async () => { gate.resolve({ success: true, data: { id: 81, revision: '5', changed: true, replayed: false } }); });
    expect(w21Store().getViewState(key)).toBe(replacement); expect(screen.getByRole('status').textContent).toMatch(/saved.*reopen/i); expect(m.update).toHaveBeenCalledOnce();
  });
}
