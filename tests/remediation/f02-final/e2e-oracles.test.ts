import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { assertExactRoute, assertRouteResponse, featureState, fixtureId, localOrigin, readBrowserFixture } from '../../e2e/support/contracts';
import { inspectPdf } from '../../pdf/pdf-evidence';

describe('TEST-003: actual release-test oracles fail closed', () => {
  it('rejects missing credentials instead of running anonymously', () => {
    expect(() => readBrowserFixture({})).toThrow('BLOCKED');
    expect(() => readBrowserFixture({ APP_BASE_URL: 'http://127.0.0.1:16401', E2E_USER_EMAIL: 'f00-test@example.invalid' })).toThrow('E2E_USER_PASSWORD');
  });
  it.each(['https://erp.algt.net', 'https://example.com', 'http://user:secret@localhost:3000', 'http://127.0.0.1:3000/?token=private', 'file:///tmp/app'])('refuses unsafe target %s', value => {
    expect(() => localOrigin(value)).toThrow('BLOCKED');
  });
  it('requires a synthetic identity even on loopback', () => {
    expect(() => readBrowserFixture({ APP_BASE_URL: 'http://localhost:3000', E2E_USER_EMAIL: 'business@example.com', E2E_USER_PASSWORD: 'synthetic-test-only' })).toThrow('synthetic');
  });
  it('accepts a fully specified synthetic login', () => {
    expect(readBrowserFixture({ APP_BASE_URL: 'http://127.0.0.1:16401', E2E_USER_EMAIL: 'f00-test@example.invalid', E2E_USER_PASSWORD: 'synthetic-test-only' }).origin).toBe('http://127.0.0.1:16401');
  });
  it.each([302, 307, 401, 403, 404, 500])('does not treat HTTP %i as an authenticated route pass', status => {
    expect(() => assertRouteResponse(status, 'text/html')).toThrow('FAIL');
  });
  it('requires HTML even for HTTP 200', () => {
    expect(() => assertRouteResponse(200, 'application/json')).toThrow();
    expect(() => assertRouteResponse(200, 'text/html; charset=utf-8')).not.toThrow();
  });
  it('a followed login redirect or substitute list cannot pass the record test', () => {
    for (const route of ['/login', '/dms/documents', '/access-denied']) expect(() => assertExactRoute('http://localhost:3000' + route, 'http://localhost:3000', '/dms/documents/record/77')).toThrow();
    expect(() => assertExactRoute('http://localhost:3000/dms/documents/record/77', 'http://localhost:3000', '/dms/documents/record/77')).not.toThrow();
  });
  it('does not guess feature state or record IDs', () => {
    expect(() => featureState({}, 'FLAG')).toThrow('BLOCKED');
    expect(() => featureState({ FLAG: 'false' }, 'FLAG')).toThrow('BLOCKED');
    expect(featureState({ FLAG: 'off' }, 'FLAG')).toBe('off');
    expect(featureState({ FLAG: 'on' }, 'FLAG')).toBe('on');
    for (const id of ['', '-1', '1.5', '1e2', '9007199254740992']) expect(() => fixtureId({ ID: id }, 'ID')).toThrow('BLOCKED');
    expect(fixtureId({ ID: '913701' }, 'ID')).toBe(913701);
  });
});

describe('TEST-003: PDF content oracle parses actual bytes', () => {
  const makePdf = (texts: string[]) => {
    const pdf = new jsPDF();
    texts.forEach((text, i) => { if (i) pdf.addPage(); if (text) pdf.text(text, 20, 20); });
    return Buffer.from(pdf.output('arraybuffer'));
  };
  it('rejects an HTML login page or success toast', async () => {
    for (const text of ['<html>Sign in</html>', 'Employment Letter PDF ready']) await expect(inspectPdf(Buffer.from(text), ['F02 synthetic'])).rejects.toThrow('not a non-empty PDF');
  });
  it('rejects fake PDF magic without a parseable document', async () => {
    await expect(inspectPdf(Buffer.from('%PDF-1.7\n' + 'invalid'.repeat(100)), ['F02 synthetic'])).rejects.toThrow();
  });
  it('checks every page, fixture content and exact requested count', async () => {
    const bytes = makePdf(['F02 synthetic employee', 'F02 synthetic company']);
    const result = await inspectPdf(bytes, ['F02 synthetic employee', 'F02 synthetic company'], 2);
    expect(result.pages).toBe(2); expect(result.bytes).toBe(bytes.length); expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(inspectPdf(bytes, ['wrong employee'])).rejects.toThrow('expected synthetic');
    await expect(inspectPdf(bytes, ['F02 synthetic'], 1)).rejects.toThrow('page count');
    await expect(inspectPdf(bytes, ['F02 synthetic'], 2, {width: 612, height: 792})).rejects.toThrow('page dimensions');
  });
  it('rejects blank pages, embedded application errors and absent content oracles', async () => {
    await expect(inspectPdf(makePdf(['F02 synthetic', '']), ['F02 synthetic'])).rejects.toThrow('blank');
    await expect(inspectPdf(makePdf(['F02 synthetic Internal Server Error']), ['F02 synthetic'])).rejects.toThrow('application error');
    await expect(inspectPdf(makePdf(['F02 synthetic']), [])).rejects.toThrow('BLOCKED');
  });
});
