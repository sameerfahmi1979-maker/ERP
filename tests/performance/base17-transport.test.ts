// @vitest-environment node
// Pure/synthetic boundaries only. Importing no business reader or real configuration.
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
const logs = vi.hoisted(() => ({warn: vi.fn()}));
vi.mock('@/lib/logger', () => ({logger: logs}));
import {readRoute} from '@/server/reads/route-response';
import {readAllPages} from '@/server/reads/all-pages';
import {collectCompletePages} from '@/lib/reads/complete-pages';
import {literalContains, literalLike} from '@/lib/reads/search';
import {readJson, ReadError} from '@/lib/reads/client';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(() => { throw Error('No network permitted in base17 compatibility tests'); }));
});
afterEach(() => vi.unstubAllGlobals());
const request = (body = '{}', contentType = 'application/json') => new Request('https://synthetic.invalid/api/reads/base17', {method: 'POST', headers: {'content-type': contentType}, body});
function privateHeaders(response: Response) {
  expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
  expect(response.headers.get('Vary')).toBe('Cookie');
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(response.headers.get('X-ERP-Correlation')).toMatch(/^[a-f0-9-]{36}$/);
  expect(response.headers.get('Content-Type')).toContain('application/json');
}

it('returns no-store successful projections and passes POST criteria only to the reader', async () => {
  const criteria = {query: 'SYNTHETIC_PRIVATE_SEARCH', parent: 7};
  const reader = vi.fn(async () => ({success: true, data: [{id: 1}]}));
  const response = await readRoute(request(JSON.stringify(criteria)), reader);
  privateHeaders(response);
  expect(response.status).toBe(200);
  expect(reader).toHaveBeenCalledExactlyOnceWith(criteria);
  expect(await response.json()).toEqual({success: true, data: [{id: 1}]});
  expect(logs.warn).not.toHaveBeenCalled();
});

it.each([
  ['wrong media type', '{}', 'text/plain'],
  ['malformed JSON', '{SYNTHETIC_PRIVATE_INPUT', 'application/json'],
  ['over 4000 bytes', JSON.stringify('x'.repeat(3999)), 'application/json'],
  ['UTF-8 byte cap, not character cap', JSON.stringify('é'.repeat(2000)), 'application/json'],
])('rejects %s before calling a reader and never echoes input', async (_name, body, type) => {
  const reader = vi.fn(async () => ({success: true}));
  const response = await readRoute(request(body, type), reader);
  privateHeaders(response);
  expect(response.status).toBe(400);
  expect(reader).not.toHaveBeenCalled();
  expect(await response.json()).toEqual({success: false, error: 'Invalid read parameters', correlationId: response.headers.get('X-ERP-Correlation')});
});

it('accepts exactly 4000 UTF-8 bytes, including a multibyte boundary', async () => {
  const body = JSON.stringify('é'.repeat(1999));
  expect(new TextEncoder().encode(body)).toHaveLength(4000);
  const reader = vi.fn(async () => ({success: true, data: []}));
  expect((await readRoute(request(body), reader)).status).toBe(200);
  expect(reader).toHaveBeenCalledExactlyOnceWith('é'.repeat(1999));
});

it('keeps the compatibility GET criteria path while rejecting overlarge GET input', async () => {
  const reader = vi.fn(async () => ({success: true, data: []}));
  const url = new URL('https://synthetic.invalid/api/reads/base17');
  url.searchParams.set('params', JSON.stringify({page: 2}));
  const response = await readRoute(new Request(url), reader);
  privateHeaders(response);
  expect(reader).toHaveBeenCalledExactlyOnceWith({page: 2});
  url.searchParams.set('params', 'x'.repeat(4001));
  expect((await readRoute(new Request(url), reader)).status).toBe(400);
  expect(reader).toHaveBeenCalledTimes(1);
});

it.each([
  ['Permission denied', 403, 'Permission denied'],
  ['Invalid SYNTHETIC_PRIVATE_FIELD', 400, 'Invalid read parameters'],
  ['SYNTHETIC_PRIVATE_PROVIDER_DIAGNOSTIC', 503, 'Records could not be loaded. Please retry.'],
])('redacts reader failures for %s with the correct status and common private headers', async (error, status, safe) => {
  const response = await readRoute(request(), async () => ({success: false, error}));
  privateHeaders(response);
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({success: false, error: safe, correlationId: response.headers.get('X-ERP-Correlation')});
  expect(JSON.stringify(logs.warn.mock.calls)).not.toContain('SYNTHETIC_PRIVATE');
  if (status === 503) expect(logs.warn).toHaveBeenCalledExactlyOnceWith('Authorized read unavailable', {correlationId: response.headers.get('X-ERP-Correlation'), code: 'READ_UNAVAILABLE'});
});

it('contains thrown errors and uses a fresh opaque correlation for each response', async () => {
  const reader = async () => { throw Error('SYNTHETIC_PRIVATE_TOKEN'); };
  const first = await readRoute(request(), reader), second = await readRoute(request(), reader);
  privateHeaders(first); privateHeaders(second);
  expect(first.status).toBe(503);
  expect(first.headers.get('X-ERP-Correlation')).not.toBe(second.headers.get('X-ERP-Correlation'));
  expect(await first.text()).not.toContain('SYNTHETIC_PRIVATE_TOKEN');
  expect(JSON.stringify(logs.warn.mock.calls)).not.toContain('SYNTHETIC_PRIVATE_TOKEN');
});

it('readJson keeps criteria out of the URL and forwards same-origin/no-store and the exact AbortSignal', async () => {
  const controller = new AbortController(), criteria = {query: 'SYNTHETIC_PRIVATE_SEARCH', parentId: 9};
  const transport = vi.fn(async () => Response.json({success: true, data: []}));
  vi.stubGlobal('fetch', transport);
  await expect(readJson('synthetic/resource', criteria, controller.signal)).resolves.toEqual({success: true, data: []});
  expect(transport).toHaveBeenCalledExactlyOnceWith('/api/reads/synthetic%2Fresource', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
    headers: {Accept: 'application/json', 'Content-Type': 'application/json'}, body: JSON.stringify(criteria),
  });
});

it.each([400, 401, 403, 503])('readJson exposes only a safe error and opaque correlation for status %s', async status => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('SYNTHETIC_PRIVATE_PROVIDER_BODY', {status, headers: {'X-ERP-Correlation': 'opaque-test-correlation'}})));
  const error = await readJson('synthetic', {}).catch(value => value);
  expect(error).toBeInstanceOf(ReadError);
  expect(error.status).toBe(status);
  expect(error.correlationId).toBe('opaque-test-correlation');
  expect(error.message).not.toContain('SYNTHETIC_PRIVATE_PROVIDER_BODY');
});

it('collects every counted row in caller order with at most 500 rows per transport page', async () => {
  const rows = Array.from({length: 1101}, (_, index) => ({id: 2000 - index}));
  const fetchPage = vi.fn(async (from: number, to: number) => ({data: rows.slice(from, to + 1), count: rows.length, error: null}));
  await expect(collectCompletePages(fetchPage, {identity: row => row.id})).resolves.toEqual(rows);
  expect(fetchPage.mock.calls).toEqual([[0, 499], [500, 999], [1000, 1499]]);
});

it.each([0, -1, 501, 1.5, Number.NaN])('rejects invalid batch size %s without making a request', async batchSize => {
  const fetchPage = vi.fn();
  await expect(collectCompletePages(fetchPage, {batchSize})).rejects.toThrow('Invalid read batch size');
  expect(fetchPage).not.toHaveBeenCalled();
});

it.each([null, -1, 1.5, Number.NaN])('rejects absent or invalid exact count %s', async count => {
  await expect(collectCompletePages(async () => ({data: [], count, error: null}))).rejects.toThrow('completely loaded');
});

it('rejects failed, partial, excess and count-drifted results rather than returning accumulated data', async () => {
  await expect(collectCompletePages(async () => ({data: [{id: 1}], count: 1, error: {message: 'synthetic'}}))).rejects.toThrow('completely loaded');
  await expect(collectCompletePages(async () => ({data: [{id: 1}], count: 4, error: null}), {batchSize: 2})).rejects.toThrow('partial');
  await expect(collectCompletePages(async () => ({data: [1, 2, 3], count: 2, error: null}))).rejects.toThrow('partial');
  const drifting = vi.fn().mockResolvedValueOnce({data: [1, 2], count: 4, error: null}).mockResolvedValueOnce({data: [3, 4], count: 5, error: null});
  await expect(collectCompletePages(drifting, {batchSize: 2})).rejects.toThrow('completely loaded');
  expect(drifting).toHaveBeenCalledTimes(2);
});

it('rejects duplicate explicit row identities across pages and bounds total choices', async () => {
  const duplicate = vi.fn().mockResolvedValueOnce({data: [{id: 1}, {id: 2}], count: 4, error: null}).mockResolvedValueOnce({data: [{id: 2}, {id: 3}], count: 4, error: null});
  await expect(collectCompletePages<{id: number}>(duplicate, {batchSize: 2, identity: row => row.id})).rejects.toThrow('Records changed');
  const oversized = vi.fn(async () => ({data: [1, 2], count: 6, error: null}));
  await expect(collectCompletePages(oversized, {batchSize: 2, maxRows: 5})).rejects.toThrow('Too many choices');
  expect(oversized).toHaveBeenCalledTimes(1);
});

it('represents a confirmed zero count as empty and retains the legacy numeric server facade', async () => {
  await expect(collectCompletePages(async () => ({data: null, count: 0, error: null}))).resolves.toEqual([]);
  const linked = [{id: 7, parent: 1}, {id: 8, parent: 1}];
  const fetchPage = vi.fn(async (from: number, to: number) => ({data: linked.slice(from, to + 1), count: 2, error: null}));
  await expect(readAllPages(fetchPage, 1)).resolves.toEqual(linked);
  expect(fetchPage.mock.calls).toEqual([[0, 0], [1, 1]]);
  // Row identity is caller supplied, never guessed from repeated parent keys.
  await expect(readAllPages(fetchPage, {batchSize: 1, identity: row => row.id})).resolves.toEqual(linked);
});

it('does not claim a transaction snapshot from count and identity checks alone', async () => {
  const fetchPage = vi.fn().mockResolvedValueOnce({data: [{id: 1}, {id: 2}], count: 4, error: null}).mockResolvedValueOnce({data: [{id: 9}, {id: 10}], count: 4, error: null});
  // A disjoint, constant-count replacement cannot be detected by this collector.
  await expect(collectCompletePages<{id: number}>(fetchPage, {batchSize: 2, identity: row => row.id})).resolves.toEqual([{id: 1}, {id: 2}, {id: 9}, {id: 10}]);
});

it('cancellation before a request makes no call and cancellation during a page cannot return a partial success', async () => {
  const early = new AbortController(); early.abort();
  const untouched = vi.fn();
  await expect(collectCompletePages(untouched, {signal: early.signal})).rejects.toMatchObject({name: 'AbortError'});
  expect(untouched).not.toHaveBeenCalled();
  const active = new AbortController();
  let finish!: (value: {data: number[]; count: number; error: null}) => void;
  const fetchPage = vi.fn(() => new Promise<{data: number[]; count: number; error: null}>(resolve => { finish = resolve; }));
  const pending = collectCompletePages(fetchPage, {batchSize: 2, signal: active.signal});
  const rejection = expect(pending).rejects.toMatchObject({name: 'AbortError'});
  active.abort(); finish({data: [1, 2], count: 4, error: null});
  await rejection;
  expect(fetchPage).toHaveBeenCalledTimes(1);
});

it('escapes SQL wildcards and quoted PostgREST OR syntax while retaining literal punctuation and Unicode', () => {
  expect(literalLike('a%_\\b')).toBe(String.raw`%a\%\_\\b%`);
  expect(literalContains('a%_\\b"c,d')).toBe(String.raw`"%a\\%\\_\\\\b\"c,d%"`);
  for (const value of ['a,b).or(x.eq.y', '"quoted"', '\\path_%', 'عربي', '']) {
    expect(JSON.parse(literalContains(value))).toBe(literalLike(value));
  }
});
