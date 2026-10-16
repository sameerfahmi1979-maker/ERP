// @vitest-environment jsdom
import './setup';
import { useEffect } from 'react';
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useTheme } from 'next-themes';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { AlgtFluentProvider } from '@/components/design-system/fluent-provider';
import { EditFilters } from '@/components/erp/table/list-controls';
import { SearchResultCard } from '@/features/ai/common/search/search-result-card';
import { PermissionReviewSaveDialog } from '@/features/permissions/permission-review-save-dialog';

afterEach(() => { cleanup(); document.documentElement.classList.remove('dark', 'light'); localStorage.clear(); });
const css = readFileSync('src/components/design-system/algt-foundation.css', 'utf8');
const globals = readFileSync('src/app/globals.css', 'utf8');
it('pairs native select AND option/optgroup colours instead of inheriting a white foreground on an OS surface', () => {
  expect(css).toMatch(/select\s*\{[^}]*background-color:\s*var\(--card\);[^}]*color:\s*var\(--card-foreground\);/);
  expect(css).toMatch(/select option, select optgroup\s*\{[^}]*background-color:\s*var\(--card\);[^}]*color:\s*var\(--card-foreground\);/);
  expect(css).not.toMatch(/option:checked|forced-color-adjust:\s*none/);
});
it('leaves high contrast under system control with readable disabled values and visible keyboard focus', () => {
  expect(css).toContain('@media (forced-colors: active)');
  expect(css).toContain('background-color: Canvas; color: CanvasText;');
  expect(css).toContain('color: GrayText;');
  expect(css).toContain('select:focus-visible { outline: 2px solid var(--ring);');
});
it('provides light/dark browser schemes and semantic surface tokens for body-mounted settings dialogs', () => {
  expect(globals).toMatch(/:root\s*\{\s*color-scheme: light;/);
  expect(globals).toMatch(/\.dark\s*\{\s*color-scheme: dark;/);
  expect(css).toContain('.algt-auth, .algt-dialog {');
  expect(css).toContain('.dark .algt-auth, .dark .algt-dialog {');
});
function ThemeJourney({ theme }: { theme: 'light' | 'dark' }) {
  const { setTheme, resolvedTheme } = useTheme();
  // Change the real context without clicking controls behind a modal. This
  // exercises a theme update while the existing portal remains mounted.
  useEffect(() => { setTheme(theme); }, [setTheme, theme]);
  return <><output>{resolvedTheme}</output><EditFilters definitions={[{ id: 'status', label: 'Status', type: 'select', options: [{value:'active',label:'Active'}] }]} values={{}} onApply={() => {}} scopeLabel="Synthetic results."/></>;
}
it('updates the actual theme provider and an already open Fluent portal without losing its filter draft', async () => {
  const app = (theme: 'light' | 'dark') => <ThemeProvider><AlgtFluentProvider><ThemeJourney theme={theme}/></AlgtFluentProvider></ThemeProvider>;
  const view = render(app('dark'));
  await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true));
  expect(document.documentElement.style.colorScheme).toBe('dark');
  const trigger = screen.getByRole('button', { name: 'Edit filters' });
  act(() => trigger.focus());
  fireEvent.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: 'Edit filters' });
  const status = within(dialog).getByLabelText('Status') as HTMLSelectElement;
  act(() => status.focus());
  expect(document.activeElement).toBe(status);
  expect(await within(dialog).findByRole('combobox', { name: 'Status' })).toBe(status);
  fireEvent.change(status, { target: { value: 'active' } });
  expect(dialog.classList.contains('algt-dialog')).toBe(true);
  view.rerender(app('light'));
  await waitFor(() => expect(document.documentElement.classList.contains('light')).toBe(true));
  expect(document.documentElement.style.colorScheme).toBe('light');
  expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('active');
  expect(await screen.findByRole('dialog', { name: 'Edit filters' })).toBe(dialog);
  expect(await within(dialog).findByRole('combobox', { name: 'Status' })).toBe(status);
  expect(document.activeElement).toBe(status);
});
it('renders search controls with paired semantic surfaces rather than a fixed white background and inherited dark-mode text', () => {
  render(<SearchResultCard result={{ resultType:'entity', entityType:'organization', title:'Synthetic organization', route:'/admin/organizations', snippet:'Synthetic only', badges:[] } as Parameters<typeof SearchResultCard>[0]['result']}/>);
  const link = screen.getByRole('link', { name: 'Open' });
  expect(link.classList.contains('bg-card')).toBe(true);
  expect(link.classList.contains('text-foreground')).toBe(true);
  expect(link.classList.contains('bg-white')).toBe(false);
  expect(screen.getByText('Synthetic organization').classList.contains('text-foreground')).toBe(true);
});
it('keeps populated permission warnings and grant badges theme-paired in the body-mounted review dialog', () => {
  render(<PermissionReviewSaveDialog open onOpenChange={() => {}} isSaving={false} failedKeys={new Set()} onConfirm={async () => {}} changes={[{ permissionId: 1, permissionCode: 'synthetic.view', permissionName: 'Synthetic permission', roleId: 1, roleCode: 'synthetic', roleName: 'Synthetic role', action: 'grant', originalAssigned: false, roleIsSystem: true, permissionIsSystem: false }]}/>);
  const warning = screen.getByText('Warning:').closest('p')!;
  expect(warning.classList.contains('dark:text-amber-200')).toBe(true);
  expect(warning.parentElement!.classList.contains('dark:bg-amber-950')).toBe(true);
  const badge = screen.getByText('1 grant');
  expect(badge.classList.contains('dark:bg-emerald-950')).toBe(true);
  expect(badge.classList.contains('dark:text-emerald-200')).toBe(true);
});
it('keeps revoke and failure meaning readable while saving disables repeated permission actions', () => {
  const confirm = vi.fn(), change = vi.fn();
  render(<PermissionReviewSaveDialog open onOpenChange={change} isSaving failedKeys={new Set(['2:7'])} onConfirm={confirm} changes={[{ permissionId: 2, permissionCode: 'synthetic.view', permissionName: 'Synthetic permission', roleId: 7, roleCode: 'synthetic', roleName: 'Synthetic role', action: 'revoke', originalAssigned: true, roleIsSystem: false, permissionIsSystem: true }]}/>);
  const badge = screen.getByText('1 revoke');
  expect(badge.classList.contains('dark:bg-amber-950')).toBe(true);
  expect(badge.classList.contains('dark:text-amber-200')).toBe(true);
  expect(screen.getByText('Failed').classList.contains('text-destructive')).toBe(true);
  expect(screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Saving…' }));
  expect(confirm).not.toHaveBeenCalled();
  expect(change).not.toHaveBeenCalled();
});
it('composes all six F06 theme callers without restoring retired catalogue mutation implementations', () => {
  const read = (path: string) => readFileSync(`src/features/${path}`, 'utf8');
  const partyType = read('master-data/parties/admin/party-types-admin-table.tsx');
  expect(partyType).toContain('hasGlobalPermission');
  expect(partyType).toContain('createPartyTypeAttempt');
  expect(partyType).toContain('dark:bg-green-950 dark:text-green-200');
  for (const name of ['relationship-types', 'service-categories']) {
    const source = read(`master-data/parties/admin/${name}-admin-table.tsx`);
    expect(source).toContain('PartyAdminMasterTable');
    expect(source).not.toContain('handleSubmit');
  }
  const audit = read('master-data/parties/party-audit-tab.tsx');
  for (const color of ['green', 'blue', 'red', 'orange', 'teal']) {
    expect(audit).toContain(`bg-${color}-100 text-${color}-800 dark:bg-${color}-950 dark:text-${color}-200`);
  }
  expect(audit).toContain('?? "bg-muted text-foreground"');
  const command = read('permissions/permission-command-center.tsx');
  for (const color of ['emerald', 'blue', 'amber']) {
    expect(command).toContain(`dark:bg-${color}-950 dark:text-${color}-200 dark:border-${color}-800`);
  }
  expect(command).toContain('bg-muted text-muted-foreground border-border');
  expect(read('permissions/permission-review-save-dialog.tsx')).toContain('dark:bg-amber-950');
});
it('retains responsive employee toolbar and the F06 document-creation authority gate with PERF paging', () => {
  const source = readFileSync('src/features/hr/employees/employees-table.tsx', 'utf8');
  expect(source).toContain('flex w-full min-w-0 flex-wrap items-center gap-2 md:ml-auto md:w-auto md:flex-nowrap');
  expect(source).toContain('documentWizardEnabled && canStartDocumentEmployee(authContext)');
  expect(source).toContain('useServerPage<EmployeeListRow>');
});
it('uses semantic recruitment headings and paired warning surfaces in the final HR and assistant cohorts', () => {
  const conversion = readFileSync('src/features/hr/recruitment/tabs/candidate-conversion-tab.tsx', 'utf8');
  expect(conversion).toContain('text-sm font-semibold text-foreground uppercase');
  expect(conversion).toContain('dark:bg-green-950');
  const compliance = readFileSync('src/features/hr/ai/hr-ai-compliance-panel.tsx', 'utf8');
  expect(compliance).toContain('dark:border-red-800 dark:bg-red-950');
  expect(compliance).toContain('text-red-700 dark:text-red-200');
  expect(compliance).toContain('dark:border-amber-800 dark:bg-amber-950');
  const assistant = readFileSync('src/app/(protected)/assistant/page.tsx', 'utf8');
  expect(assistant).toContain('dark:bg-amber-950');
  expect(assistant).toContain('dark:text-amber-200');
});
