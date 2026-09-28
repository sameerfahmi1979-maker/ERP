/** Read-only journeys on explicitly seeded local records. See support/README.md. */
import { test, expect } from '@playwright/test';
import { loginSynthetic, openExactRoute } from './support/browser';
import { featureState, fixtureId, requireSetting } from './support/contracts';

test.beforeEach(async ({ page }) => { await loginSynthetic(page); });

test('PW-01: authenticated dashboard has usable navigation', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'All Documents', exact: true })).toBeVisible();
});
test('PW-02: documents route and its list controls load', async ({ page }) => {
  await openExactRoute(page, '/dms/documents');
  await expect(page.getByRole('heading', { name: 'All Documents', exact: true })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
});
test('PW-03: the tracked document, not a substitute list, opens', async ({ page }) => {
  const id = fixtureId(process.env, 'E2E_DOCUMENT_ID');
  const title = requireSetting(process.env, 'E2E_DOCUMENT_TITLE');
  await openExactRoute(page, `/dms/documents/record/${id}`);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: 'Overview', exact: true })).toBeVisible();
});
test('PW-04: review queue matches its explicit feature state', async ({ page }) => {
  const state = featureState(process.env, 'E2E_REVIEW_STATE');
  await openExactRoute(page, '/dms/review-queue');
  await expect(page.getByRole('heading', { name: 'DMS Review Queue', exact: true })).toBeVisible();
  const disabled = page.getByText('DMS Review Queue is not enabled.', { exact: true });
  if (state === 'off') await expect(disabled).toBeVisible();
  else {
    await expect(disabled).toHaveCount(0);
    await expect(page.getByText('No review items found.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  }
});
test('PW-05: intelligence admin renders its own content', async ({ page }) => {
  await openExactRoute(page, '/admin/dms/intelligence');
  await expect(page.getByRole('heading', { name: 'DMS Intelligence Admin', exact: true })).toBeVisible();
});
test('PW-06/07: observability proves the configured OFF or ON state', async ({ page }) => {
  const state = featureState(process.env, 'E2E_OBSERVABILITY_STATE');
  await openExactRoute(page, '/admin/dms/ai-observability');
  if (state === 'off') {
    await expect(page.getByRole('heading', { name: 'DMS AI Observability is not enabled', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toHaveCount(0);
  } else {
    await expect(page.getByRole('heading', { name: 'DMS AI Observability', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'AI Usage Overview', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
    await expect(page.getByText('Feature Flag: DMS_AI_OBSERVABILITY = false', { exact: true })).toHaveCount(0);
  }
});
