/** Local-only print route integration. Actual signer, explicit synthetic ownership. */
import { test, expect } from '@playwright/test';
import { signPrintToken } from '../../src/lib/pdf/print-token';
import { readPrintFixture } from './fixture';

const templateKey = 'hr-employment-letter-en';
function signed(overrides: Partial<Parameters<typeof signPrintToken>[0]> = {}) {
  const f = readPrintFixture();
  return signPrintToken({ templateKey, recordType: 'employee', recordId: f.employeeId, userId: f.userId, ownerCompanyId: f.companyId, ...overrides });
}
function route(token?: string, template = templateKey) {
  const f = readPrintFixture();
  return `${f.origin}/print/${template}/employee/${f.employeeId}${token ? '?token=' + token : ''}`;
}
test('missing token is rejected, not redirected to login', async ({ request }) => {
  const response = await request.get(route(), { maxRedirects: 0 });
  expect(response.status()).toBe(401);
  expect(await response.text()).toBe('Missing print token');
});
test('tampered real signature is rejected', async ({ request }) => {
  const token = signed();
  const parts = token.split('.');
  parts[1] = (parts[1].startsWith('A') ? 'B' : 'A') + parts[1].slice(1);
  const response = await request.get(route(parts.join('.')), { maxRedirects: 0 });
  expect(response.status()).toBe(401);
  expect(await response.text()).toContain('signature is invalid');
});
test('expired real token is rejected for expiry', async ({ request }) => {
  const original = Date.now;
  let token: string;
  try { Date.now = () => original() - 180_000; token = signed(); } finally { Date.now = original; }
  const response = await request.get(route(token), { maxRedirects: 0 });
  expect(response.status()).toBe(401);
  expect(await response.text()).toContain('has expired');
});
test('signed template mismatch is rejected', async ({ request }) => {
  const response = await request.get(route(signed({ templateKey: 'bilingual-sample-en-ar' })), { maxRedirects: 0 });
  expect(response.status()).toBe(403);
  expect(await response.text()).toBe('Print token mismatch');
});
test('signed record mismatch is rejected', async ({ request }) => {
  const f = readPrintFixture();
  const response = await request.get(route(signed({ recordId: f.employeeId + 1 })), { maxRedirects: 0 });
  expect(response.status()).toBe(403);
  expect(await response.text()).toBe('Print token mismatch');
});
test('signed unknown template reaches registry rejection, not token rejection', async ({ request }) => {
  const response = await request.get(route(signed({ templateKey: 'f02-unknown-template' }), 'f02-unknown-template'), { maxRedirects: 0 });
  expect(response.status()).toBe(404);
  expect(await response.text()).toContain('Unknown template key');
});
test('published synthetic employee output has exact identity and private headers', async ({ request }) => {
  const f = readPrintFixture(), response = await request.get(route(signed()), { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/html');
  expect(response.headers()['x-template-governance']).toBe('published');
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers()['x-robots-tag']).toBe('noindex');
  const html = await response.text();
  expect(html).toContain(f.employeeName);
  expect(html).toContain(f.companyName);
  expect(html).not.toContain('DRAFT — NOT OFFICIAL');
});
test('draft governance is positively asserted with watermark', async ({ request }) => {
  const template = 'bilingual-sample-en-ar';
  const response = await request.get(route(signed({ templateKey: template }), template), { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()['x-template-governance']).toBe('draft');
  expect(await response.text()).toContain('DRAFT — NOT OFFICIAL');
});
test('all configured Arabic font weights return actual WOFF2 bytes', async ({ request }) => {
  const f = readPrintFixture();
  for (const weight of [400, 600, 700]) {
    const response = await request.get(`${f.origin}/fonts/noto-sans-arabic-arabic-${weight}-normal.woff2`, { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('woff2');
    expect((await response.body()).subarray(0, 4).toString('ascii')).toBe('wOF2');
  }
});
