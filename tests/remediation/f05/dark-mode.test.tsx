// @vitest-environment jsdom
import './setup';
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useTheme } from 'next-themes';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { AlgtFluentProvider } from '@/components/design-system/fluent-provider';
import { EditFilters } from '@/components/erp/table/list-controls';
import { SearchResultCard } from '@/features/ai/common/search/search-result-card';

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
function ThemeJourney() {
  const { setTheme, resolvedTheme } = useTheme();
  return <><button onClick={() => setTheme('dark')}>Use dark</button><button onClick={() => setTheme('light')}>Use light</button><output>{resolvedTheme}</output><EditFilters definitions={[{ id: 'status', label: 'Status', type: 'select', options: [{value:'active',label:'Active'}] }]} values={{}} onApply={() => {}} scopeLabel="Synthetic results."/></>;
}
it('updates the actual theme provider and an already open Fluent portal without losing its filter draft', async () => {
  render(<ThemeProvider><AlgtFluentProvider><ThemeJourney/></AlgtFluentProvider></ThemeProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Use dark' }));
  await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true));
  expect(document.documentElement.style.colorScheme).toBe('dark');
  fireEvent.click(screen.getByRole('button', { name: 'Edit filters' }));
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'active' } });
  const dialog = screen.getByRole('dialog', { name: 'Edit filters' });
  expect(dialog.classList.contains('algt-dialog')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Use light', hidden: true }));
  await waitFor(() => expect(document.documentElement.classList.contains('light')).toBe(true));
  expect(document.documentElement.style.colorScheme).toBe('light');
  expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('active');
  expect(screen.getByRole('dialog', { name: 'Edit filters' })).toBe(dialog);
});
it('renders search controls with paired semantic surfaces rather than a fixed white background and inherited dark-mode text', () => {
  render(<SearchResultCard result={{ resultType:'entity', entityType:'organization', title:'Synthetic organization', route:'/admin/organizations', snippet:'Synthetic only', badges:[] } as Parameters<typeof SearchResultCard>[0]['result']}/>);
  const link = screen.getByRole('link', { name: 'Open' });
  expect(link.classList.contains('bg-card')).toBe(true);
  expect(link.classList.contains('text-foreground')).toBe(true);
  expect(link.classList.contains('bg-white')).toBe(false);
  expect(screen.getByText('Synthetic organization').classList.contains('text-foreground')).toBe(true);
});
