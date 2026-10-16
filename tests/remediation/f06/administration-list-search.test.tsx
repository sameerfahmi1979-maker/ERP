// @vitest-environment jsdom
// Real administration adapters and shared table; transport/export/workspace ownership are doubled.
import '../f05/setup';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import type { ReactNode } from 'react';
import type { AuthContext } from '@/lib/rbac/check';
import type { BranchWithCompany, OwnerCompanyWithGeography } from '@/types/domain';
import { WorkspaceUiMemoryProvider } from '@/hooks/use-persistent-ui-state';

const m = vi.hoisted(() => ({ exportProps: null as unknown }));
vi.mock('next/navigation', () => ({ usePathname: () => '/synthetic-admin-list', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/hooks/use-workspace-form-owner', () => ({ useWorkspaceFormOwner: () => null }));
vi.mock('@/server/actions/branches', () => ({ updateBranchStatus: vi.fn(), deleteBranch: vi.fn() }));
vi.mock('@/server/actions/organizations', () => ({ updateOrganizationStatus: vi.fn(), deleteOrganization: vi.fn() }));
vi.mock('@/components/erp/export/erp-export-menu', () => ({ ERPExportMenu: (props: unknown) => { m.exportProps = props; return null; } }));
import { BranchesTable } from '@/features/branches/branches-table';
import { OrganizationsTable } from '@/features/organizations/organizations-table';

const auth = { isAccountActive: true, permissionCodes: [], globalPermissionCodes: [], roleCodes: [], roleAssignments: [] } as unknown as AuthContext;
const branches = [
  { id: 101, owner_company_id: 81, branch_name_en: 'Synthetic West Depot', branch_code: 'F06ADMINB1004B', status: 'active', workspace_revision: 1, emirate: 'Dubai', area: 'Industrial 2', owner_company: { id: 81, legal_name_en: 'Synthetic Gulf Company', company_code: 'SYN-GULF', status: 'active' } },
  { id: 102, owner_company_id: 82, branch_name_en: 'Synthetic East Depot', branch_code: 'OTHER102', status: 'active', workspace_revision: 1, emirate: 'Abu Dhabi', area: 'Industrial 3', owner_company: { id: 82, legal_name_en: 'Synthetic East Company', company_code: 'SYN-EAST', status: 'active' } },
] as unknown as BranchWithCompany[];
const organizations = [
  { id: 81, legal_name_en: 'Synthetic Gulf Company', company_code: 'SYN-GULF', short_name: 'Gulf', emirate_id: 7, emirate: 'Historical text', emirate_rel: { id: 7, name_en: 'Dubai' }, status: 'active', default_currency: 'AED', workspace_revision: 1 },
  { id: 82, legal_name_en: 'Synthetic East Company', company_code: 'SYN-EAST', short_name: 'East', emirate_id: 8, emirate: 'Abu Dhabi', emirate_rel: null, status: 'inactive', default_currency: 'AED', workspace_revision: 1 },
] as unknown as OwnerCompanyWithGeography[];
function Wrap({ children }: { children: ReactNode }) { return <FluentProvider theme={webLightTheme}><WorkspaceUiMemoryProvider>{children}</WorkspaceUiMemoryProvider></FluentProvider>; }
afterEach(cleanup);

it.each(['Synthetic West Depot', 'F06ADMINB1004B', 'f06adminb1004b', 'Synthetic Gulf Company', 'SYN-GULF', 'Dubai', 'Industrial 2'])(
  'branch search finds the displayed value %s', query => {
    render(<Wrap><BranchesTable authContext={auth} data={branches} /></Wrap>);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search branches...' }), { target: { value: query } });
    expect(screen.getByText('Synthetic West Depot')).toBeTruthy();
    expect(screen.queryByText('Synthetic East Depot')).toBeNull();
  },
);
it.each(['Synthetic Gulf Company', 'SYN-GULF', 'syn-gulf', 'Gulf', 'Dubai'])(
  'organization search finds the displayed value %s', query => {
    render(<Wrap><OrganizationsTable authContext={auth} data={organizations} /></Wrap>);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search organizations...' }), { target: { value: query } });
    expect(screen.getByText('Synthetic Gulf Company')).toBeTruthy();
    expect(screen.queryByText('Synthetic East Company')).toBeNull();
  },
);
it('a missing branch company join retains the known owner identity without inventing its label', () => {
  render(<Wrap><BranchesTable authContext={auth} data={[{ ...branches[0], owner_company: null }]} /></Wrap>);
  expect(screen.getByText('Organization #81 (name unavailable)')).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox', { name: 'Search branches...' }), { target: { value: 'Organization #81' } });
  expect(screen.getByText('Synthetic West Depot')).toBeTruthy();
});
it('missing geography labels retain known IDs rather than presenting them as unset', () => {
  render(<Wrap><OrganizationsTable authContext={auth} data={[{ ...organizations[0], emirate: null, emirate_rel: null }]} /></Wrap>);
  expect(screen.getByText('Emirate #7 (name unavailable)')).toBeTruthy();
});
it('branch geography IDs remain visible and searchable when their saved labels are unavailable', () => {
  render(<Wrap><BranchesTable authContext={auth} data={[{ ...branches[0], emirate: null, emirate_id: 7, area: null, area_zone_id: 9 }]} /></Wrap>);
  expect(screen.getByText('Emirate #7 (name unavailable)')).toBeTruthy(); expect(screen.getByText('Area #9 (name unavailable)')).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox', { name: 'Search branches...' }), { target: { value: 'Area #9' } });
  expect(screen.getByText('Synthetic West Depot')).toBeTruthy();
});
it('organization exports include the visible joined geography label rather than hidden historical text', () => {
  render(<Wrap><OrganizationsTable authContext={auth} data={organizations} exportConfig={{ title: 'Organizations', filename: 'organizations' }} /></Wrap>);
  const props = m.exportProps as { columns: { key: string; getValue: (row: OwnerCompanyWithGeography) => unknown }[] };
  expect(props.columns.find(column => column.key === 'company')!.getValue(organizations[0])).toBe('Synthetic Gulf Company SYN-GULF');
  expect(props.columns.find(column => column.key === 'emirate')!.getValue(organizations[0])).toBe('Dubai');
});
it('branch export uses the visible company label and code, not an object', () => {
  render(<Wrap><BranchesTable authContext={auth} data={branches} exportConfig={{ title: 'Branches', filename: 'branches' }} /></Wrap>);
  const props = m.exportProps as { columns: { key: string; getValue: (row: BranchWithCompany) => unknown }[] };
  expect(props.columns.find(column => column.key === 'branch')!.getValue(branches[0])).toBe('Synthetic West Depot F06ADMINB1004B');
  expect(props.columns.find(column => column.key === 'owner_company')!.getValue(branches[0])).toBe('Synthetic Gulf Company SYN-GULF');
});
it('an unmatched search can be cleared without dropping either loaded branch', () => {
  render(<Wrap><BranchesTable authContext={auth} data={branches} /></Wrap>);
  fireEvent.change(screen.getByRole('textbox', { name: 'Search branches...' }), { target: { value: 'absent' } });
  expect(screen.getByText(/No records match your search/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));
  expect(screen.getByText('Synthetic West Depot')).toBeTruthy(); expect(screen.getByText('Synthetic East Depot')).toBeTruthy();
});
