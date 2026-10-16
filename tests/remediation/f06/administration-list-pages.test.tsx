// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
const m = vi.hoisted(() => ({ branches: vi.fn(), organizations: vi.fn(), choices: vi.fn(), allowed: true }));
vi.mock('@/lib/rbac/check', () => ({ getAuthContext: async () => ({ profile: { id: 1 } }), hasPermission: () => m.allowed, hasGlobalPermission: () => true, hasPermissionInScope: () => true }));
vi.mock('@/server/queries/branches', () => ({ listBranches: m.branches }));
vi.mock('@/server/queries/organizations', () => ({ listOrganizations: m.organizations }));
vi.mock('@/server/queries/branch-company-choices', () => ({ readBranchCompanyChoices: m.choices }));
vi.mock('@/components/erp/page-header', () => ({ ERPPageHeader: ({ title, actions }: { title: string; actions: ReactNode }) => <header><h1>{title}</h1>{actions}</header> }));
vi.mock('@/components/erp/stat-card', () => ({ ERPStatCard: ({ title, value, description }: { title: string; value: string; description: string }) => <section aria-label={title}><h2>{title}</h2><p>{value}</p><p>{description}</p></section> }));
vi.mock('@/features/branches/add-branch-button', () => ({ AddBranchButton: () => <button>Add Branch</button> }));
vi.mock('@/features/organizations/add-organization-button', () => ({ AddOrganizationButton: () => <button>Add Organization</button> }));
vi.mock('@/features/branches/branches-table', () => ({ BranchesTable: ({ data }: { data: unknown[] }) => <div data-testid="loaded-table">{data.length ? 'Branch rows' : 'Empty branches'}</div> }));
vi.mock('@/features/organizations/organizations-table', () => ({ OrganizationsTable: ({ data }: { data: unknown[] }) => <div data-testid="loaded-table">{data.length ? 'Organization rows' : 'Empty organizations'}</div> }));
import BranchesPage from '@/app/(protected)/admin/branches/page';
import OrganizationsPage from '@/app/(protected)/admin/organizations/page';
beforeEach(() => { vi.clearAllMocks(); m.allowed = true; m.branches.mockResolvedValue([]); m.organizations.mockResolvedValue([]); m.choices.mockResolvedValue([]); });
afterEach(cleanup);
for (const [name, page, read] of [['Branches', BranchesPage, m.branches], ['Organizations', OrganizationsPage, m.organizations]] as const) {
  it(`${name}: failed reads show retryable failure with no empty table or fabricated statistics`, async () => {
    read.mockRejectedValue(Error('PRIVATE DATABASE DETAIL')); render(await page());
    expect(within(screen.getByRole('alert')).getByRole('heading', { name: `${name} could not be loaded` })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Try again.');
    expect(screen.queryByTestId('loaded-table')).toBeNull(); expect(screen.queryByText('PRIVATE DATABASE DETAIL')).toBeNull();
    expect(screen.getByRole('link', { name: 'Try loading again' }).getAttribute('href')).toBe(`/admin/${name.toLowerCase()}`);
    expect(screen.queryByRole('region', { name: 'Total Organizations' })).toBeNull();
  });
  it(`${name}: a confirmed empty read is not a failure`, async () => {
    render(await page()); expect(screen.getByTestId('loaded-table').textContent).toBe(`Empty ${name.toLowerCase()}`); expect(screen.queryByRole('alert')).toBeNull();
  });
  it(`${name}: denied users do not trigger list reads`, async () => {
    m.allowed = false; render(await page()); expect(read).not.toHaveBeenCalled(); expect(screen.queryByTestId('loaded-table')).toBeNull();
  });
}
it('organization statistics distinguish visible organization counts from unqueried branch/headcount totals', async () => {
  m.organizations.mockResolvedValue([{ id: 81, status: 'active' }, { id: 82, status: 'inactive' }]); render(await OrganizationsPage());
  const count = within(screen.getByRole('region', { name: 'Organizations in view' }));
  expect(count.getByText('2')).toBeTruthy(); expect(count.getByText('1 active in your accessible list')).toBeTruthy();
  for (const title of ['Total Branches', 'Total Employees']) {
    const stat = within(screen.getByRole('region', { name: title })); expect(stat.getByText('Not available')).toBeTruthy(); expect(stat.queryByText('0')).toBeNull();
  }
});
it('branch choice-projection failure is visible and retryable without guessing creation authority', async () => {
  m.branches.mockResolvedValue([{ id: 101 }]); m.choices.mockRejectedValue(Error('PRIVATE CHOICE DETAIL'));
  render(await BranchesPage());
  expect(within(screen.getByRole('alert')).getByRole('heading', { name: 'Branch company choices could not be loaded' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Add Branch' })).toBeNull(); expect(screen.queryByTestId('loaded-table')).toBeNull();
  expect(screen.queryByText('PRIVATE CHOICE DETAIL')).toBeNull(); expect(screen.getByRole('link', { name: 'Try loading again' }).getAttribute('href')).toBe('/admin/branches');
});
