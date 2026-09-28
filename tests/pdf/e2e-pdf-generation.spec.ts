/** Real HTTP integration: synthetic print route -> Gotenberg -> parsed PDF.
 * Does not claim to test official issuance/storage/QR; those are F08 workflows.
 */
import { test, expect } from '@playwright/test';
import { signPrintToken } from '../../src/lib/pdf/print-token';
import { gotenbergConvertHtml } from '../../src/lib/pdf/gotenberg';
import { readPrintFixture } from './fixture';
import { inspectPdf } from './pdf-evidence';

test('Synthetic employment print route produces a real, readable PDF', async ({ request }, testInfo) => {
  const fixture = readPrintFixture();
  const token = signPrintToken({ templateKey: 'hr-employment-letter-en', recordType: 'employee', recordId: fixture.employeeId, userId: fixture.userId, ownerCompanyId: fixture.companyId });
  const response = await request.get(`${fixture.origin}/print/hr-employment-letter-en/employee/${fixture.employeeId}?token=${token}`, { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/html');
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers()['x-robots-tag']).toBe('noindex');
  expect(response.headers()['x-template-governance']).toBe('published');
  const html = await response.text();
  expect(html).toContain(fixture.employeeName);
  expect(html).toContain('document.fonts.ready');
  expect(html).not.toContain('DRAFT — NOT OFFICIAL');
  expect(html).not.toContain('googleapis.com');
  // Execute the actual application's transport adapter and its A4 settings.
  // readPrintFixture already rejected any non-loopback renderer target.
  const converted = await gotenbergConvertHtml({ html, paperWidth: 210, paperHeight: 297 });
  const buffer = converted.buffer;
  const evidence = await inspectPdf(buffer, [fixture.employeeName, fixture.companyName, 'Employment Certificate'], 1, { width: 595.28, height: 841.89 });
  expect(evidence.sha256).toBe(converted.checksum);
  expect(evidence.bytes).toBe(converted.fileSizeBytes);
  await testInfo.attach('synthetic-employment.pdf', { body: buffer, contentType: 'application/pdf' });
  await testInfo.attach('pdf-evidence', { body: JSON.stringify(evidence), contentType: 'application/json' });
});
