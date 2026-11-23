import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createDmsPilotClient, readDmsPilotConfig, runDmsBatch, runDmsPilot } from './dms-pilot.mjs';

const bytes = Buffer.from('%PDF-1.7\nfixture\n%%EOF');
const config = {
  itemId: 'approved-item', etag: 'approved-version',
  sha256: createHash('sha256').update(bytes).digest('hex'),
  companyId: 7, authUserId: '11111111-2222-4333-8444-555555555555',
  operationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
};
const code = 'ABCDEF1234567890ABCDEF1234567890';

function fixture(initial = 'uploaded') {
  const calls = [];
  let status = initial;
  let paused = false;
  const client = {
    profile: async () => ({ userId: config.authUserId, capabilities: { upload: true, preview: true, review: true, numbering: false } }),
    scopes: async () => [{ companyId: 7, branchId: null }],
    admit: async request => {
      calls.push(['admit', request]);
      return { id: 42, code, uploadUrl: status === 'pending_upload' ? 'signed' : null, duplicate: false };
    },
    upload: async (admission, data) => { assert.equal(admission.code, code); assert.deepEqual(data, bytes); calls.push(['upload']); },
    complete: async (request, id) => {
      assert.equal(request.operationId, config.operationId);
      assert.equal(id, 42);
      status = 'uploaded';
      calls.push(['complete']);
    },
    intake: async () => ({ id: 42, code, status, documentId: null, duplicate: false }),
    start: async id => { assert.equal(id, 42); calls.push(['start']); status = 'review_pending'; },
  };
  const graph = { readApprovedPdf: async () => ({ name: 'verified.pdf', bytes }) };
  const ledger = { read: async () => ({ paused }) };
  return { client, graph, ledger, calls, pause: () => { paused = true; } };
}

test('uploads one authorized PDF and only starts AI Fill, then reuses its admission on restart', async () => {
  const f = fixture('pending_upload');
  const run = () => runDmsPilot({ ...f, config });
  assert.deepEqual(await run(), { status: 'review_pending', sessionId: 42, sessionCode: code });
  assert.deepEqual(await run(), { status: 'review_pending', sessionId: 42, sessionCode: code });
  assert.deepEqual(f.calls.map(c => c[0]), ['admit', 'upload', 'complete', 'start', 'admit']);
  for (const [, request] of f.calls.filter(c => c[0] === 'admit')) {
    assert.equal(request.operationId, config.operationId);
    assert.equal(request.context, null);
    assert.deepEqual(request.scope, { companyId: 7, branchId: null });
    assert.equal(request.metadata.sha256_hash, config.sha256);
  }
});

test('refuses a changed fingerprint and a borrowed ERP identity before admission', async () => {
  const f = fixture();
  await assert.rejects(runDmsPilot({ ...f, config: { ...config, sha256: 'f'.repeat(64) } }), /pilot_fingerprint_mismatch/);
  await assert.rejects(runDmsPilot({ ...f, config: { ...config, authUserId: 'another-user' } }), /pilot_actor_mismatch/);
  assert.deepEqual(f.calls, []);
});

test('honors pause before start and stops when an earlier AI job is processing', async () => {
  const f = fixture();
  f.client.intake = async () => { f.pause(); return { id: 42, code, status: 'uploaded', documentId: null }; };
  assert.equal((await runDmsPilot({ ...f, config })).status, 'paused');
  assert.deepEqual(f.calls.map(c => c[0]), ['admit']);
  const active = fixture('ai_processing');
  assert.equal((await runDmsPilot({ ...active, config })).status, 'ai_processing');
  assert.deepEqual(active.calls.map(c => c[0]), ['admit']);
});

test('accepts inherited branches only within the approved company and still uploads company-wide', async () => {
  const f = fixture();
  f.client.scopes = async () => [{ companyId: 7, branchId: null }, { companyId: 7, branchId: 8 }];
  assert.equal((await runDmsPilot({ ...f, config })).status, 'review_pending');
  assert.deepEqual(f.calls[0][1].scope, { companyId: 7, branchId: null });
  f.client.scopes = async () => [{ companyId: 7, branchId: null }, { companyId: 9, branchId: 8 }];
  await assert.rejects(runDmsPilot({ ...f, config }), /pilot_scope_mismatch/);
});

test('reconciles an uncertain AI response against the original intake', async () => {
  const f = fixture();
  const start = f.client.start;
  f.client.start = async id => { await start(id); throw Error('response lost'); };
  assert.equal((await runDmsPilot({ ...f, config })).status, 'review_pending');
  assert.equal(f.calls.filter(c => c[0] === 'start').length, 1);
});

test('uses the declared ERP actor and sends PDF bytes only to its original signed storage slot', async () => {
  const calls = [];
  const client = createDmsPilotClient({ ...config, email: 'fixture@example.invalid', password: 'fixture' }, {
    fetch: async (url, options) => {
      calls.push({ url: String(url), options });
      if (options.method === 'PUT') return new Response(null, { status: 200 });
      const { op } = JSON.parse(options.body);
      return Response.json({ success: true, data: op === 'login'
        ? { userId: config.authUserId, accessToken: 'mock.payload.signature' }
        : { userId: config.authUserId } });
    },
  });
  assert.equal((await client.profile()).userId, config.authUserId);
  assert.deepEqual(calls.map(c => c.url), Array(2).fill('https://erp.algt.net/api/mobile/dms/v1'));
  assert.equal(calls[1].options.headers.Authorization, 'Bearer mock.payload.signature');
  const storage = `https://mmiefuieduzdiiwnqpie.supabase.co/storage/v1/object/upload/sign/dms-temp/sessions/${code}/verified.pdf?token=mock`;
  await client.upload({ code, uploadUrl: storage }, bytes);
  assert.equal(calls[2].options.headers.Authorization, undefined);
  assert.equal(calls[2].options.headers['x-upsert'], 'false');
  assert.equal(calls[2].options.redirect, 'error');
  for (const url of [storage.replace('mmiefuieduzdiiwnqpie.supabase.co', 'example.net'), storage.replace(code, 'OTHER')]) {
    await assert.rejects(client.upload({ code, uploadUrl: url }, bytes), /pilot_invalid_storage_destination/);
  }
  assert.equal(calls.length, 3);
});

test('a one-file session can use the approved company without reusing a broader password', async () => {
  const configWithSession = readDmsPilotConfig({
    AGENT_DMS_PILOT: 'one_file',
    PILOT_GRAPH_ITEM_ID: config.itemId,
    PILOT_GRAPH_ETAG: config.etag,
    PILOT_FILE_SHA256: config.sha256,
    PILOT_OPERATION_ID: config.operationId,
    PILOT_ERP_AUTH_USER_ID: config.authUserId,
    PILOT_ERP_COMPANY_ID: String(config.companyId),
    PILOT_ERP_ONE_FILE_SESSION: 'mock.payload.signature',
  });
  const f = fixture();
  f.client.scopes = async () => [{ companyId: 7, branchId: null }, { companyId: 9, branchId: null }];
  assert.equal((await runDmsPilot({ ...f, config: configWithSession })).status, 'review_pending');
  assert.deepEqual(f.calls[0][1].scope, { companyId: 7, branchId: null });
  f.client.scopes = async () => [{ companyId: 9, branchId: null }];
  await assert.rejects(runDmsPilot({ ...f, config: configWithSession }), /pilot_scope_mismatch/);
  const client = createDmsPilotClient(configWithSession, { fetch: async (_, options) => {
    assert.equal(options.headers.Authorization, 'Bearer mock.payload.signature');
    assert.deepEqual(JSON.parse(options.body), { op: 'profile' });
    return Response.json({ success: true, data: { userId: config.authUserId } });
  } });
  assert.equal((await client.profile()).userId, config.authUserId);
});

test('a small batch uses saved discovery versions and holds bytes outside the approved ALGT set', async () => {
  const f = fixture();
  const three = ['first', 'second', 'third'].map(itemId => ({ itemId, version: 'c:1', current: true }));
  const invalid = Buffer.from('%PDF-1.7\nout of batch\n%%EOF');
  const read = [];
  f.graph.readDiscoveredPdf = async (id, version) => {
    assert.equal(version, 'c:1');
    read.push(id);
    return { name: id + '.pdf', bytes: id === 'second' ? invalid : bytes };
  };
  f.ledger.batchCandidates = async () => three;
  const batch = { from: '2026-11-18T12:49:00Z', through: '2026-11-18T13:02:00Z', approvedHashes: [config.sha256] };
  const next = { ...config, batch };
  const firstRun = await runDmsBatch({ ...f, config: next });
  const replay = await runDmsBatch({ ...f, config: next });
  assert.deepEqual(read, ['first', 'second', 'third', 'first', 'second', 'third']);
  assert.deepEqual(firstRun.map(x => x.status), ['review_pending', 'held', 'duplicate']);
  assert.deepEqual(replay.map(x => x.status), ['review_pending', 'held', 'duplicate']);
  assert.equal(f.calls.filter(x => x[0] === 'start').length, 1);
  const admits = f.calls.filter(x => x[0] === 'admit').map(x => x[1]);
  assert.equal(admits[0].operationId, admits[1].operationId);
  assert.notEqual(admits[0].operationId, config.operationId);
});

test('a batch refuses to process past its fixed three-file bound', async () => {
  const f = fixture();
  f.ledger.batchCandidates = async () => [1, 2, 3, 4];
  const next = { ...config, batch: { approvedHashes: [config.sha256] } };
  await assert.rejects(runDmsBatch({ ...f, config: next }), /pilot_batch_overflow/);
  assert.deepEqual(f.calls, []);
});

test('a pilot can select the next three files from the same saved discovery window', () => {
  const env = {
    AGENT_DMS_PILOT: 'small_batch',
    PILOT_ERP_AUTH_USER_ID: config.authUserId,
    PILOT_ERP_COMPANY_ID: String(config.companyId),
    PILOT_ERP_ONE_FILE_SESSION: 'mock.payload.signature',
    PILOT_BATCH_FROM: '2026-11-18T12:56:00Z',
    PILOT_BATCH_THROUGH: '2026-11-18T13:02:00Z',
    PILOT_BATCH_ALGT_SHA256: config.sha256,
  };
  assert.equal(readDmsPilotConfig(env).batch.offset, 0);
  assert.equal(readDmsPilotConfig({ ...env, PILOT_BATCH_OFFSET: '3' }).batch.offset, 3);
  for (const invalid of ['-3', '1', '4', '6', '03', '3.0']) {
    assert.throws(() => readDmsPilotConfig({ ...env, PILOT_BATCH_OFFSET: invalid }),
      /pilot_batch_configuration_incomplete/);
  }
});
