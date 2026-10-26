import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { jsPDF } from 'jspdf';
import { readBoundedDmsObject, verifyDmsBlob } from '@/server/dms-file-verification';
import { readBoundedOriginal } from '@/lib/output/bounded-original';

// Actual Supabase Storage SDK and local HTTP transport; no cloud or browser.
let origin: string, mode = 'ok';
const paths: string[] = [];
const pdf = new jsPDF(); pdf.text('F18 synthetic storage response', 10, 10);
const bytes = Buffer.from(pdf.output('arraybuffer'));
const fingerprint = createHash('sha256').update(bytes).digest('hex');
const server = http.createServer((req, res) => {
  paths.push(req.url ?? ''); req.resume();
  res.setHeader('Connection', 'close');
  if (mode === '403' || mode === '503') {
    res.writeHead(Number(mode), { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ statusCode: mode, message: 'F18_PRIVATE_PROVIDER_DETAIL', error: 'synthetic' })); return;
  }
  if (mode === 'disconnect') { req.socket.destroy(); return; }
  res.writeHead(200, { 'Content-Type': 'application/pdf' });
  res.end(mode === 'truncated' ? bytes.subarray(0, bytes.length - 1) : mode === 'oversized' ? Buffer.concat([bytes, Buffer.from('x')]) : bytes);
});
beforeAll(async () => {
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(() => { mode = 'ok'; paths.length = 0; });
afterAll(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); });
function storage() {
  return createClient(origin, 'f18-synthetic-no-cloud-access', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }).storage.from('f18-synthetic');
}
it('retrieves and parses the exact original through the real SDK', async () => {
  const blob = await readBoundedDmsObject(storage(), 'original.pdf', bytes.length);
  expect(await verifyDmsBlob(blob, { name: 'original.pdf', mime: 'application/pdf', size: bytes.length, sha256: fingerprint })).toEqual({ mime: 'application/pdf', size: bytes.length, sha256: fingerprint });
  expect(paths).toEqual(['/storage/v1/object/f18-synthetic/original.pdf']);
});
it.each(['403', '503'])('holds an unavailable object on HTTP %s without exposing the provider body', async status => {
  mode = status;
  await expect(readBoundedDmsObject(storage(), 'original.pdf', bytes.length)).rejects.toThrow('File transfer unavailable.');
});
it.each(['truncated', 'oversized', 'disconnect'])('rejects %s transport without creating replacement data', async fault => {
  mode = fault;
  await expect(readBoundedDmsObject(storage(), 'original.pdf', bytes.length)).rejects.toThrow();
  expect(paths.every(p => p === '/storage/v1/object/f18-synthetic/original.pdf')).toBe(true);
});
it('rejects changed bytes against the retained original hash', async () => {
  const blob = await readBoundedDmsObject(storage(), 'original.pdf', bytes.length);
  await expect(verifyDmsBlob(blob, { name: 'original.pdf', mime: 'application/pdf', size: bytes.length, sha256: '0'.repeat(64) })).rejects.toThrow('fingerprint');
});
it('retrieves the bounded issued-original bytes through the real SDK', async () => {
  expect(await readBoundedOriginal(storage(), 'original.pdf')).toEqual(bytes);
});
