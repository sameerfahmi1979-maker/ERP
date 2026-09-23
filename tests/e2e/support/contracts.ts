/** Fail-closed contracts shared by real E2E journeys and offline oracle tests. */
export type TestEnvironment = Record<string, string | undefined>;
export function requireSetting(env: TestEnvironment, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`BLOCKED: ${name} is required; no production defaults are permitted.`);
  return value;
}
export function localOrigin(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('BLOCKED: invalid test origin.'); }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.protocol !== 'http:' ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('BLOCKED: these fixture tests require an isolated loopback origin.');
  }
  return url.origin;
}
export function readBrowserFixture(env: TestEnvironment = process.env) {
  const origin = localOrigin(requireSetting(env, 'APP_BASE_URL'));
  const email = requireSetting(env, 'E2E_USER_EMAIL');
  if (!email.endsWith('@example.invalid')) throw new Error('BLOCKED: synthetic test identity required.');
  return { origin, email, password: requireSetting(env, 'E2E_USER_PASSWORD') };
}
export function fixtureId(env: TestEnvironment, name: string): number {
  const raw = requireSetting(env, name), id = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(id) || id < 1) throw new Error(`BLOCKED: invalid ${name}.`);
  return id;
}
export function featureState(env: TestEnvironment, name: string): 'on' | 'off' {
  const value = requireSetting(env, name);
  if (value !== 'on' && value !== 'off') throw new Error(`BLOCKED: ${name} must be on or off.`);
  return value;
}
export function assertExactRoute(actual: string, origin: string, pathname: string): void {
  const url = new URL(actual);
  if (url.origin !== origin || url.pathname !== pathname) {
    // Never echo a potentially credential-bearing callback URL.
    throw new Error('FAIL: expected authenticated route was not reached.');
  }
}
export function assertRouteResponse(status: number, contentType: string): void {
  if (status !== 200 || !contentType.includes('text/html')) throw new Error('FAIL: expected HTML response; redirect/error is not a route pass.');
}
