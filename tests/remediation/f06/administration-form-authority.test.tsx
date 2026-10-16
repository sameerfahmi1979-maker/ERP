// @vitest-environment jsdom
// Actual F06 page composition and pure scope predicates; database/record components doubled.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { AuthContext } from '@/lib/rbac/check';
import { hasPermissionInScope } from '@/lib/rbac/scope';
const m = vi.hoisted(() => ({ ctx: null as unknown as AuthContext, tableAuth: null as AuthContext | null, choiceRead: vi.fn(), organizationList: vi.fn(), branchRead: vi.fn(), organizationRead: vi.fn() }));
vi.mock('@/lib/rbac/check', async () => ({ ...await import('@/lib/rbac/scope'), getAuthContext: async () => m.ctx }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw Error('Redirect ' + url); }, notFound: () => { throw Error('Not found'); } }));
vi.mock('@/server/queries/organizations', () => ({ listOrganizations: () => m.organizationList() }));
vi.mock('@/server/queries/branch-company-choices', () => ({ readBranchCompanyChoices: (branchId?: number) => m.choiceRead(branchId) }));
vi.mock('@/server/queries/branches', () => ({ listBranches: async () => [{ id: 101, owner_company_id: 81, status: 'active' }] }));
vi.mock('@/server/actions/organizations', () => ({ getOrganizationById: (id: number) => m.organizationRead(id) }));
vi.mock('@/server/actions/branches', () => ({ getBranchById: (id: number) => m.branchRead(id) }));
vi.mock('@/components/erp/page-header', () => ({ ERPPageHeader: ({ actions }: { actions: ReactNode }) => <header>{actions}</header> }));
vi.mock('@/components/erp/stat-card', () => ({ ERPStatCard: () => null }));
vi.mock('@/features/branches/add-branch-button', () => ({ AddBranchButton: () => <button>Add Branch</button> }));
vi.mock('@/features/organizations/add-organization-button', () => ({ AddOrganizationButton: () => <button>Add Organization</button> }));
vi.mock('@/features/branches/branches-table', () => ({ BranchesTable: ({ authContext }: { authContext: AuthContext }) => { m.tableAuth = authContext; return <div>Branches table</div>; } }));
vi.mock('@/features/organizations/organizations-table', () => ({ OrganizationsTable: ({ authContext }: { authContext: AuthContext }) => { m.tableAuth = authContext; return <div>Organizations table</div>; } }));
vi.mock('@/features/branches/branch-workspace-form', () => ({ BranchWorkspaceForm: ({ mode, companies }: { mode: string; companies: { id: number }[] }) => <div data-testid="form-mode">{mode}<span data-testid="company-choices">{companies.map(company => company.id).join(',')}</span></div> }));
vi.mock('@/features/organizations/organization-workspace-form', () => ({ OrganizationWorkspaceForm: ({ mode }: { mode: string }) => <div data-testid="form-mode">{mode}</div> }));

import BranchesPage from '@/app/(protected)/admin/branches/page';
import OrganizationsPage from '@/app/(protected)/admin/organizations/page';
import NewBranchPage from '@/app/(protected)/admin/branches/record/new/page';
import NewOrganizationPage from '@/app/(protected)/admin/organizations/record/new/page';
import BranchRecordPage from '@/app/(protected)/admin/branches/record/[id]/page';
import OrganizationRecordPage from '@/app/(protected)/admin/organizations/record/[id]/page';

function context(company: number | null, branch: number | null, manage = true): AuthContext {
  const view = ['branches.view', 'organizations.view']; const writes = manage ? ['branches.manage', 'organizations.manage'] : [];
  return { profile: { id: 1 } as AuthContext['profile'], email: null, accountStatus: 'active', isAccountActive: true, roleCodes: ['reader', 'manager'], permissionCodes: [...view, ...writes], globalPermissionCodes: [...view, ...(company === null && branch === null ? writes : [])], roleAssignments: [
    { roleId: 1, roleCode: 'reader', ownerCompanyId: null, branchId: null, permissionCodes: view },
    { roleId: 2, roleCode: 'manager', ownerCompanyId: company, branchId: branch, permissionCodes: writes },
  ] };
}
const companyChoices = [{ id: 81, legal_name_en: 'Company 81', company_code: 'C81' }, { id: 82, legal_name_en: 'Company 82', company_code: 'C82' }];
beforeEach(() => {
  m.ctx = context(null, null, false); m.tableAuth = null;
  m.branchRead.mockReset().mockResolvedValue({ success: true, data: { id: 101, owner_company_id: 81, status: 'active' } });
  m.organizationRead.mockReset().mockResolvedValue({ success: true, data: { id: 81, status: 'active' } });
  m.organizationList.mockReset().mockResolvedValue([{ id: 81, status: 'active' }, { id: 82, status: 'active' }]);
  m.choiceRead.mockReset().mockImplementation(async (branchId?: number) => branchId === undefined
    ? companyChoices.filter(company => hasPermissionInScope(m.ctx, 'branches.manage', company.id))
    : branchId === 101 && (hasPermissionInScope(m.ctx, 'branches.view', 81, 101) || hasPermissionInScope(m.ctx, 'branches.manage', 81, 101)) ? [companyChoices[0]] : []);
}); afterEach(cleanup);

for (const actor of ['reader', 'company-manager', 'other-company-manager', 'branch-manager', 'sibling-branch-manager', 'global-manager'] as const) {
  const auth = () => actor === 'reader' ? context(null, null, false) : actor === 'company-manager' ? context(81, null) : actor === 'other-company-manager' ? context(82, null) : actor === 'branch-manager' ? context(81, 101) : actor === 'sibling-branch-manager' ? context(81, 102) : context(null, null);
  it(`${actor}: organization edit route uses the record's company scope`, async () => {
    m.ctx = auth(); render(await OrganizationRecordPage({ params: Promise.resolve({ id: '81' }), searchParams: Promise.resolve({ mode: 'edit' }) }));
    expect(screen.getByTestId('form-mode').textContent).toBe(actor === 'global-manager' || actor === 'company-manager' ? 'edit' : 'view');
  });
  it(`${actor}: branch edit route uses the exact company/branch assignment`, async () => {
    m.ctx = auth(); render(await BranchRecordPage({ params: Promise.resolve({ id: '101' }), searchParams: Promise.resolve({ mode: 'edit' }) }));
    expect(screen.getByTestId('form-mode').textContent?.startsWith(actor === 'global-manager' || actor === 'company-manager' || actor === 'branch-manager' ? 'edit' : 'view')).toBe(true);
  });
  it(`${actor}: organization list advertises creation only with global authority`, async () => {
    m.ctx = auth(); render(await OrganizationsPage()); expect(screen.queryByRole('button', { name: 'Add Organization' }) !== null).toBe(actor === 'global-manager'); expect(m.tableAuth).toBe(m.ctx);
  });
  it(`${actor}: branch list creation needs company-wide management and preserves table scopes`, async () => {
    m.ctx = auth(); render(await BranchesPage()); expect(screen.queryByRole('button', { name: 'Add Branch' }) !== null).toBe(['global-manager', 'company-manager', 'other-company-manager'].includes(actor)); expect(m.tableAuth).toBe(m.ctx);
  });
  it(`${actor}: direct organization creation cannot bypass the global boundary`, async () => {
    m.ctx = auth(); if (actor !== 'global-manager') await expect(NewOrganizationPage()).rejects.toThrow('Redirect'); else { render(await NewOrganizationPage()); expect(screen.getByTestId('form-mode').textContent).toBe('add'); }
  });
  it(`${actor}: direct branch creation offers only authorized company scopes`, async () => {
    m.ctx = auth(); if (!['global-manager', 'company-manager', 'other-company-manager'].includes(actor)) await expect(NewBranchPage()).rejects.toThrow('Redirect');
    else { render(await NewBranchPage()); expect(screen.getByTestId('company-choices').textContent).toBe(actor === 'global-manager' ? '81,82' : actor === 'company-manager' ? '81' : '82'); }
  });
}
it('a local reader assignment cannot borrow manage permission from another company on a direct edit URL', async () => {
  m.ctx = context(82, null); m.ctx.roleAssignments!.push({ roleId: 3, roleCode: 'local-reader', ownerCompanyId: 81, branchId: 101, permissionCodes: ['branches.view', 'organizations.view'] });
  render(await BranchRecordPage({ params: Promise.resolve({ id: '101' }), searchParams: Promise.resolve({ mode: 'edit' }) })); expect(screen.getByTestId('form-mode').textContent?.startsWith('view')).toBe(true);
});
it('legacy flat create/edit names do not manufacture scoped manage authority', async () => {
  m.ctx = context(null, null, false); m.ctx.permissionCodes.push('branches.create', 'branches.edit', 'organizations.create', 'organizations.edit');
  await expect(NewBranchPage()).rejects.toThrow('Redirect'); await expect(NewOrganizationPage()).rejects.toThrow('Redirect');
  render(await OrganizationRecordPage({ params: Promise.resolve({ id: '81' }), searchParams: Promise.resolve({ mode: 'edit' }) })); expect(screen.getByTestId('form-mode').textContent).toBe('view');
});

function branchOnlyContext(company: number | null, branch: number | null, manage = true): AuthContext {
  const permissions = ['branches.view', ...(manage ? ['branches.manage'] : [])];
  return { ...context(company, branch, manage), roleCodes: ['branch-only'], permissionCodes: permissions,
    globalPermissionCodes: company === null && branch === null ? permissions : [],
    roleAssignments: [{ roleId: 3, roleCode: 'branch-only', ownerCompanyId: company, branchId: branch, permissionCodes: permissions }] };
}
for (const company of [81, null]) {
  it(`branch-only ${company === null ? 'global' : 'company'} manager can reach creation without reading organizations`, async () => {
    m.ctx = branchOnlyContext(company, null); m.organizationList.mockRejectedValue(Error('Organization read forbidden'));
    const list = render(await BranchesPage()); expect(screen.getByRole('button', { name: 'Add Branch' })).toBeTruthy(); list.unmount();
    render(await NewBranchPage()); expect(screen.getByTestId('company-choices').textContent).toBe(company === null ? '81,82' : '81');
    expect(m.choiceRead).toHaveBeenCalledWith(undefined); expect(m.organizationList).not.toHaveBeenCalled();
  });
}
for (const manage of [false, true]) {
  it(`branch-only scoped ${manage ? 'manager' : 'reader'} sees the existing company without obtaining creation choices`, async () => {
    m.ctx = branchOnlyContext(81, 101, manage); m.organizationList.mockRejectedValue(Error('Organization read forbidden'));
    render(await BranchRecordPage({ params: Promise.resolve({ id: '101' }), searchParams: Promise.resolve({ mode: 'edit' }) }));
    expect(screen.getByTestId('form-mode').textContent?.startsWith(manage ? 'edit' : 'view')).toBe(true);
    expect(screen.getByTestId('company-choices').textContent).toBe('81'); expect(m.choiceRead).toHaveBeenCalledWith(101);
    await expect(NewBranchPage()).rejects.toThrow('Redirect'); expect(m.organizationList).not.toHaveBeenCalled();
  });
}
it('BranchesPage: a failed company-choice read is a visible load error, not empty authority', async () => {
  m.ctx = branchOnlyContext(81, null); m.choiceRead.mockRejectedValue(Error('Company choices unavailable'));
  render(await BranchesPage());
  expect(screen.getByRole('alert').textContent).toContain('Branch company choices could not be loaded');
  expect(screen.queryByRole('button', { name: 'Add Branch' })).toBeNull();
  expect(screen.queryByText('Branches table')).toBeNull(); expect(m.tableAuth).toBeNull();
});
it('NewBranchPage: a failed company-choice read is not an empty authorized choice list', async () => {
  m.ctx = branchOnlyContext(81, null); m.choiceRead.mockRejectedValue(Error('Company choices unavailable'));
  await expect(NewBranchPage()).rejects.toThrow('Company choices unavailable');
});
it('branch record surfaces a failed company-label projection instead of rendering a blank owner', async () => {
  m.ctx = branchOnlyContext(81, 101); m.choiceRead.mockRejectedValue(Error('Company choices unavailable'));
  await expect(BranchRecordPage({ params: Promise.resolve({ id: '101' }), searchParams: Promise.resolve({ mode: 'edit' }) })).rejects.toThrow('Company choices unavailable');
});
for (const kind of ['branch', 'organization'] as const) {
  const page = kind === 'branch' ? BranchRecordPage : OrganizationRecordPage;
  const read = () => kind === 'branch' ? m.branchRead : m.organizationRead;
  it.each(['101junk', '1.5', '0', '-1', ' 81', '1e2', '9007199254740992'])(`${kind}: malformed route ID %s is rejected before any record or choice read`, async id => {
    await expect(page({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) })).rejects.toThrow('Not found');
    expect(read()).not.toHaveBeenCalled(); expect(m.choiceRead).not.toHaveBeenCalled();
  });
  it.each(['unavailable', undefined])(`${kind}: %s backend failure is a safe retry error, not a missing record`, async errorCode => {
    read().mockResolvedValue({ success: false, errorCode, error: 'PRIVATE DATABASE DETAIL' });
    await expect(page({ params: Promise.resolve({ id: kind === 'branch' ? '101' : '81' }), searchParams: Promise.resolve({}) })).rejects.toThrow(`The ${kind} could not be loaded. Try again.`);
    expect(m.choiceRead).not.toHaveBeenCalled();
  });
  it.each(['not_found', 'invalid', 'denied'])(`${kind}: authoritative %s has a distinct outcome`, async errorCode => {
    read().mockResolvedValue({ success: false, errorCode, error: 'Safe server message' });
    await expect(page({ params: Promise.resolve({ id: kind === 'branch' ? '101' : '81' }), searchParams: Promise.resolve({}) })).rejects.toThrow(errorCode === 'denied' ? 'Redirect' : 'Not found');
    expect(m.choiceRead).not.toHaveBeenCalled();
  });
  it(`${kind}: malformed successful read is a load failure, not404`, async () => {
    read().mockResolvedValue({ success: true });
    await expect(page({ params: Promise.resolve({ id: kind === 'branch' ? '101' : '81' }), searchParams: Promise.resolve({}) })).rejects.toThrow(`The ${kind} could not be loaded. Try again.`);
  });
}
