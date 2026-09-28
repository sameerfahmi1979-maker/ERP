import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
const state = vi.hoisted(() => ({ resolvedTheme: undefined as string | undefined, setTheme: vi.fn() }));
vi.mock('next-themes', () => ({ useTheme: () => state }));
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
vi.mock('@/features/auth/actions', () => ({ signOut: vi.fn() }));
vi.mock('@/components/erp/notification-bell', () => ({ NotificationBell: () => null }));
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { AppHeader } from '@/components/layout/app-header';
describe('actual shell theme control', () => {
  it('hydrates the actual header identically with server and persisted dark state', () => {
    Object.assign(state, { theme: undefined, resolvedTheme: undefined });
    const server = renderToStaticMarkup(createElement(AppHeader, {displayName:'Synthetic User'}));
    Object.assign(state, { theme: 'dark', resolvedTheme: 'dark' });
    expect(renderToStaticMarkup(createElement(AppHeader, {displayName:'Synthetic User'}))).toBe(server);
  });
  it('keeps identical markup for server, saved light, saved dark and system dark hydration', () => {
    state.resolvedTheme = undefined;
    const server = renderToStaticMarkup(createElement(ThemeToggle));
    for (const resolved of ['light', 'dark']) {
      state.resolvedTheme = resolved;
      expect(renderToStaticMarkup(createElement(ThemeToggle))).toBe(server);
    }
    expect(server).toContain('Toggle color theme');
    expect(server).toContain('lucide-sun');
    expect(server).toContain('lucide-moon');
  });
  it('toggles the resolved system theme, not the literal system preference', () => {
    state.resolvedTheme = 'dark';
    ThemeToggle({}).props.onClick();
    expect(state.setTheme).toHaveBeenLastCalledWith('light');
    state.resolvedTheme = 'light';
    ThemeToggle({}).props.onClick();
    expect(state.setTheme).toHaveBeenLastCalledWith('dark');
  });
});
