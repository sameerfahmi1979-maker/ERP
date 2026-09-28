import { expect, type Page } from '@playwright/test';
import { assertExactRoute, readBrowserFixture, assertRouteResponse } from './contracts';
export async function loginSynthetic(page: Page) {
  const fixture = readBrowserFixture();
  await page.goto(`${fixture.origin}/login`);
  await page.locator('input[type="email"]').fill(fixture.email);
  await page.locator('input[type="password"]').fill(fixture.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(`${fixture.origin}/dashboard`);
  assertExactRoute(page.url(), fixture.origin, '/dashboard');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
}
export async function openExactRoute(page: Page, pathname: string) {
  const { origin } = readBrowserFixture();
  const response = await page.goto(`${origin}${pathname}`);
  if (!response) throw new Error('FAIL: no page response.');
  assertRouteResponse(response.status(), response.headers()['content-type'] ?? '');
  assertExactRoute(page.url(), origin, pathname);
  await expect(page.getByRole('heading', { name: /^(Access Denied|Application error|Internal Server Error)$/ })).toHaveCount(0);
}
