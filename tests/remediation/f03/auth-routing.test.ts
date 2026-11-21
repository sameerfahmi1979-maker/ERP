import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const state = vi.hoisted(() => ({ user: null as null | { id: string }, throws: false, refresh: false }));
vi.mock('@supabase/ssr', () => ({ createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (cookies: object[], headers: object) => void } }) => ({ auth: { getUser: async () => {
  if (state.throws) throw new Error('simulated outage');
  if (state.refresh) options.cookies.setAll([{ name: 'sb-test-auth-token', value: 'refreshed', options: { httpOnly: true } }], { 'Cache-Control': 'private, no-store' });
  return { data: { user: state.user }, error: null };
} } }) }));
import { updateSession } from '@/lib/supabase/middleware';
import { safeAuthDestination } from '@/lib/auth/navigation';
import { authEmailSchema, loginSchema, signupSchema } from '@/lib/validation/auth';
beforeEach(() => { state.user = null; state.throws = false; state.refresh = false; });
it.each(['/reset-password', '/auth/confirm?code=not-a-real-code&type=invite', '/forgot-password'])('allows signed-in recovery path %s', async path => {
  state.user = { id: 'synthetic' };
  const response = await updateSession(new NextRequest('https://erp.invalid' + path));
  expect(response.headers.get('location')).toBeNull();
});
it('does not trust a cookie name during an auth outage', async () => {
  state.throws = true;
  const response = await updateSession(new NextRequest('https://erp.invalid/login', { headers: { cookie: 'sb-fake-auth-token=fake' } }));
  expect(response.headers.get('location')).toBeNull();
});
it.each(['/dms', '/notifications', '/reports', '/workspace', '/admin/users'])('protects %s and retains the intended path', async path => {
  const response = await updateSession(new NextRequest('https://erp.invalid' + path));
  const url = new URL(response.headers.get('location')!);
  expect(url.pathname).toBe('/login'); expect(url.searchParams.get('redirectTo')).toBe(path);
});
it('preserves refreshed cookies and no-store on redirects', async () => {
  state.user = { id: 'synthetic' }; state.refresh = true;
  const response = await updateSession(new NextRequest('https://erp.invalid/login'));
  expect(response.cookies.get('sb-test-auth-token')?.value).toBe('refreshed');
  expect(response.headers.get('cache-control')).toContain('no-store');
});
it.each(['@example.invalid', '//example.invalid', '/\\example.invalid', 'https://example.invalid', '/auth/confirm?code=x', '/admin\n', '/dashboard#token=x'])('rejects redirect %s', path => expect(safeAuthDestination(path)).toBe('/start'));
it('preserves a safe application destination', () => expect(safeAuthDestination('/admin/hr/employees?page=2')).toBe('/admin/hr/employees?page=2'));
it('normalizes email without changing the password', () => {
  expect(authEmailSchema.parse('  NAME@EXAMPLE.INVALID ')).toBe('name@example.invalid');
  expect(loginSchema.parse({ email: 'name@example.invalid', password: ' old ' }).password).toBe(' old ');
});
it('uses the shared new-password policy for signup', () => expect(signupSchema.safeParse({ email: 'name@example.invalid', password: 'weakpass', fullName: 'Test' }).success).toBe(false));
it.each([
  '/modules/fleet/42?custodyBefore=17',
  '/modules/fleet/operations/23',
  '/modules/fleet/allowances?order=23',
  '/modules/workshop/job-work/18',
  '/modules/inventory?branch=5',
  '/modules/procurement?branch=5',
])('retains and restores signed-out module destination %s', async path => {
  const response = await updateSession(new NextRequest('https://erp.invalid' + path));
  const location = response.headers.get('location');
  expect(location).toBeTruthy();
  const login = new URL(location!);
  expect(login.pathname).toBe('/login');
  expect(login.searchParams.get('redirectTo')).toBe(path);

  state.user = { id: 'synthetic' };
  const signedIn = await updateSession(new NextRequest(login));
  const destination = new URL(signedIn.headers.get('location')!);
  expect(destination.pathname + destination.search).toBe(path);
});

it.each(['/modules/hse', '/modules/finance', '/modules/fleet/relative-path/extra', '/modules/fleet/%2f%2fexample.invalid'])
('rejects an unimplemented module return target %s', path => {
  expect(safeAuthDestination(path)).toBe('/start');
});
