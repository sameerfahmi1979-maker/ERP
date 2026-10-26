import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { jsPDF } from 'jspdf';

const db = vi.hoisted(() => ({ actor: vi.fn(), service: vi.fn(), original: vi.fn(), storage: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc: db.actor }) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  rpc: db.service, storage: db.storage,
  from: () => ({ select: () => ({ eq: () => ({ single: db.original }) }) }),
}) }));
import { recoverDurableOutput } from '@/lib/output/durable-operation';

// Actual ERP orchestration, renderer HTTP adapter, parser, hash/identity checks
// and Storage SDK. Database RPCs are a controlled stateful port, NOT native RLS
// acceptance or a managed-cloud/compiled-app capacity test. No browser process.
const pdf = new jsPDF(); pdf.text('F18 synthetic retained original', 10, 10);
const bytes = Buffer.from(pdf.output('arraybuffer'));
const digest = createHash('sha256').update(bytes).digest('hex');
const session = 'f1800000-0000-4000-8000-000000000001';
const objectId = 'f1800000-0000-4000-8000-000000000002';
const originalPath = '/storage/v1/object/erp-generated-pdfs/f18/original.pdf';
const infoPath = '/storage/v1/object/info/erp-generated-pdfs/f18/original.pdf';
let origin: string;
let object: Buffer | null;
let mode: string;
let version: number;
let requests: { method: string; path: string; upsert?: string }[];
let claims: number;
let state: ReturnType<typeof retained>;
function retained() {
  return {
    document: { id: 18, lifecycle_state: 'rendering', storage_path: 'f18/original.pdf', file_name: 'original.pdf', checksum: 'pending', file_size_bytes: null as number | null, serial_no: 'F18-SYNTHETIC-18', output_code: 'F18_SYNTHETIC', source_record_id: 18, supersedes_issuance_id: null, template_id: null, generated_at: '2026-10-26T00:00:00Z', data_snapshot_json: {}, branding_snapshot_json: null, policy_snapshot_json: { official: false, requiresSerial: true } },
    plan: { html: '<p>F18 synthetic retained render plan</p>', layoutVersion: 0 } as { html: string; layoutVersion: number } | null,
    pdf: null as string | null, sha: null as string | null, size: null as number | null, renderer: null as string | null, link: null,
  };
}
const server = http.createServer((req, res) => {
  const parts: Buffer[] = [];
  req.on('data', chunk => parts.push(Buffer.from(chunk)));
  req.on('end', () => {
    const url = req.url ?? '';
    requests.push({ method: req.method ?? '', path: url, upsert: req.headers['x-upsert'] as string | undefined });
    res.setHeader('Connection', 'close');
    const json = (status: number, body: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    const error = (status: number) => json(status, { statusCode: String(status), message: 'F18_PRIVATE_PROVIDER_BODY', error: 'synthetic' });
    if (url === '/health') { json(200, {}); return; }
    if (url === '/version') { res.end('f18-local-fixture'); return; }
    if (url === '/forms/chromium/convert/html') {
      if (mode === 'renderer-stream') { res.writeHead(503); res.flushHeaders(); res.write('F18_PRIVATE_PROVIDER_BODY'); return; }
      res.writeHead(200, { 'Content-Type': 'application/pdf' });
      res.end(mode === 'invalid-pdf' ? '%PDF-1.7 invalid %%EOF' : bytes); return;
    }
    if (url === infoPath) {
      if (mode === 'unknown-storage') { error(503); return; }
      if (!object) { error(404); return; }
      json(200, { id: objectId, version: String(version), last_modified: '2026-10-26T00:00:00.123Z' }); return;
    }
    if (url === originalPath && req.method === 'POST') {
      if (object) { error(409); return; }
      object = Buffer.concat(parts);
      if (mode === 'upload-response-lost') { req.socket.destroy(); return; }
      json(200, { Id: objectId, Key: 'erp-generated-pdfs/f18/original.pdf' }); return;
    }
    if (url === originalPath && req.method === 'GET') {
      if (mode === 'download-unavailable') { error(503); return; }
      if (!object) { error(404); return; }
      if (mode === 'version-change') version++;
      res.writeHead(200, { 'Content-Type': 'application/pdf' }); res.end(object); return;
    }
    error(404);
  });
});
beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  vi.stubEnv('GOTENBERG_URL', origin);
  db.storage = createClient(origin, 'f18-synthetic-no-cloud-access', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }).storage;
});
beforeEach(() => {
  vi.clearAllMocks(); object = null; mode = 'ok'; version = 1; requests = []; claims = 0; state = retained();
  db.original.mockResolvedValue({ data: { storage_path: 'f18/original.pdf', generated_by: 18 }, error: null });
  db.actor.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'f08_claim_operation') {
      claims++;
      return { data: { id: 18, actorId: 18, sessionId: session, leaseId: args.p_lease }, error: null };
    }
    if (name === 'f08_output_actor') return mode === 'revoked' ? { data: null, error: { code: '42501' } } : { data: { actorId: 18, authSessionId: session }, error: null };
    if (name === 'f08_finish_operation') {
      state.document.lifecycle_state = 'issued'; state.document.checksum = digest; state.document.file_size_bytes = bytes.length; state.pdf = null; state.plan = null;
      if (mode === 'finish-response-lost') return { data: null, error: { code: 'response_lost' } };
    }
    return { data: { id: 18 }, error: null };
  });
  db.service.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'f08_read_operation') return { data: structuredClone(state), error: null };
    if (name === 'f08_checkpoint_operation' && args.p_pdf) {
      state.pdf = args.p_pdf as string; state.sha = digest; state.size = bytes.length; state.renderer = args.p_renderer as string;
    }
    return { data: { id: 18 }, error: null };
  });
});
afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); vi.unstubAllEnvs(); });
const count = (path: string, method: string) => requests.filter(r => r.path === path && r.method === method).length;
const finishes = () => db.actor.mock.calls.filter(([name]) => name === 'f08_finish_operation').length;
function checkOriginal() {
  expect(object).toEqual(bytes);
  expect(count(originalPath, 'POST')).toBe(1);
  expect(requests.find(r => r.path === originalPath && r.method === 'POST')?.upsert).toBe('false');
  expect(requests.every(r => !['PUT', 'DELETE'].includes(r.method))).toBe(true);
  expect(claims).toBeGreaterThan(1);
  expect(db.service).toHaveBeenCalledWith('f08_attest_pdf', expect.objectContaining({ p_id: 18, p_actor: 18, p_session: session, p_object: objectId, p_sha: digest, p_size: bytes.length }));
}
it('composes the real adapters into exact-original issuance and side-effect-free replay', async () => {
  expect(await recoverDurableOutput(18)).toMatchObject({ kind: 'issued', issuanceId: 18, finalSha256: digest }); checkOriginal();
  const before = requests.length;
  expect(await recoverDurableOutput(18)).toMatchObject({ kind: 'issued', idempotentReplay: true }); expect(requests).toHaveLength(before);
});
it.each(['renderer-stream', 'invalid-pdf'])('holds %s, then resumes the same original', async fault => {
  mode = fault; const first = await recoverDurableOutput(18);
  expect(first.kind).toBe('reconciliation_required'); expect(JSON.stringify(first)).not.toContain('F18_PRIVATE_PROVIDER_BODY');
  expect(finishes()).toBe(0); expect(count(originalPath, 'POST')).toBe(0); expect(state.pdf).toBeNull();
  mode = 'ok'; expect((await recoverDurableOutput(18)).kind).toBe('issued'); checkOriginal();
});
it('holds an unknown Storage observation without uploading or re-rendering on resume', async () => {
  mode = 'unknown-storage'; expect((await recoverDurableOutput(18)).kind).toBe('reconciliation_required');
  expect(count(originalPath, 'POST')).toBe(0); expect(finishes()).toBe(0); expect(state.pdf).not.toBeNull();
  mode = 'ok'; expect((await recoverDurableOutput(18)).kind).toBe('issued');
  expect(count('/forms/chromium/convert/html', 'POST')).toBe(1); checkOriginal();
});
it('reconciles a real disconnected upload acknowledgement with no replacement upload', async () => {
  mode = 'upload-response-lost'; expect((await recoverDurableOutput(18)).kind).toBe('issued'); checkOriginal();
});
it('holds unavailable downloaded bytes, then attests the unchanged stored original', async () => {
  mode = 'download-unavailable'; const first = await recoverDurableOutput(18);
  expect(first.kind).toBe('reconciliation_required'); expect(JSON.stringify(first)).not.toContain('F18_PRIVATE_PROVIDER_BODY'); expect(finishes()).toBe(0);
  mode = 'ok'; expect((await recoverDurableOutput(18)).kind).toBe('issued');
  expect(count('/forms/chromium/convert/html', 'POST')).toBe(1); checkOriginal();
});
it('rejects an object-version change during real transfer before attestation or issue', async () => {
  mode = 'version-change'; expect((await recoverDurableOutput(18)).kind).toBe('reconciliation_required');
  expect(finishes()).toBe(0); expect(db.service.mock.calls.some(([name]) => name === 'f08_attest_pdf')).toBe(false); expect(object).toEqual(bytes);
});
it('stops at the current-actor gate before downloading or attesting after access revocation', async () => {
  mode = 'revoked'; expect((await recoverDurableOutput(18)).kind).toBe('reconciliation_required');
  expect(count(originalPath, 'GET')).toBe(0); expect(finishes()).toBe(0); expect(db.service.mock.calls.some(([name]) => name === 'f08_attest_pdf')).toBe(false);
});
it('reconciles a lost final response without repeating rendering, upload or issue', async () => {
  mode = 'finish-response-lost'; expect((await recoverDurableOutput(18)).kind).toBe('reconciliation_required');
  const before = requests.length; mode = 'ok';
  expect(await recoverDurableOutput(18)).toMatchObject({ kind: 'issued', issuanceId: 18, idempotentReplay: true });
  expect(requests).toHaveLength(before); expect(finishes()).toBe(1); checkOriginal();
});
