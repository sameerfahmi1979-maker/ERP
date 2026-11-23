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

const protectedEnv = {
  AGENT_DMS_PILOT: 'continuous',
  PILOT_AGENT_CENTER_ADMISSION: '1',
  PILOT_AGENT_CENTER_SHAREPOINT_FLOW: '1',
  PILOT_ERP_COMPANY_ID: '7',
  PILOT_ERP_BRANCH_ID: '8',
  PILOT_ERP_AUTH_USER_ID: config.authUserId,
  PILOT_ERP_EMAIL: 'worker@example.invalid',
  PILOT_ERP_PASSWORD: 'synthetic',
  PILOT_GRAPH_ITEM_ID: config.itemId,
  PILOT_GRAPH_VERSION: 'c:pinned-version',
  PILOT_FILE_SHA256: config.sha256,
};

test('protected worker startup requires explicit continuous admission, branch and fixture source', () => {
  const run = env => readDmsPilotConfig({ ...protectedEnv, ...env });
  const protectedConfig = run({});
  assert.equal(protectedConfig.agentCenterSharePointFlow, true);
  assert.equal(protectedConfig.branchId, 8);
  assert.equal(protectedConfig.sourceVersion, protectedEnv.PILOT_GRAPH_VERSION);
  for (const changed of [
    { AGENT_DMS_PILOT: 'one_file' }, { PILOT_AGENT_CENTER_ADMISSION: '0' },
    { PILOT_ERP_BRANCH_ID: '0' }, { PILOT_ERP_BRANCH_ID: '1.2' }, { PILOT_ERP_BRANCH_ID: '01' },
    { PILOT_GRAPH_ITEM_ID: undefined }, { PILOT_GRAPH_VERSION: undefined }, { PILOT_GRAPH_VERSION: 'not-versioned' },
    { PILOT_FILE_SHA256: 'changed' },
  ]) assert.throws(() => run(changed), /pilot|sharepoint|branch|continuous/i);
});

test('uses the same branch-bound operation and current lease at each protected service boundary', async () => {
  const f = fixture();
  const authLease = 'f1000000-0000-4000-8000-000000000011';
  const protectedConfig = { ...readDmsPilotConfig(protectedEnv), operationId: config.operationId };
  const requests = [];
  const client = createDmsPilotClient(protectedConfig, {
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      const route = ['stageSharePoint', 'reviewSharePoint'].includes(body.op) ? 'internal/agents/sharepoint-intake' : 'mobile/dms/v1';
      assert.equal(String(url), 'https://erp.algt.net/api/' + route);
      assert.equal(options.redirect, 'error');
      requests.push(body);
      const data = {
        login: { userId: config.authUserId, accessToken: 'mock.payload.signature', expiresAt: Date.now() / 1000 + 3600 },
        profile: await f.client.profile(),
        scopes: { rows: [{ companyId: 7, branchId: 8 }] },
        admitSharePoint: { id: 42, operationId: config.operationId, replayed: false },
        stageSharePoint: { sessionId: 42, operationId: config.operationId, sha256: config.sha256, byteCount: bytes.length, state: 'staged' },
        reviewSharePoint: { sessionId: 42, operationId: config.operationId, state: 'review_pending', resultId: 20, reviewId: 21, notificationEventId: 22 },
      }[body.op];
      assert.ok(data, body.op);
      return Response.json({ success: true, data });
    },
  });
  const done = await runDmsPilot({ ...f, client, config: protectedConfig, sharePointLease: authLease, source: await f.graph.readApprovedPdf() });
  assert.deepEqual(done, { status: 'review_pending', sessionId: 42 });
  const [, , , admission, stage, review] = requests;
  assert.deepEqual(admission.request.scope, { companyId: 7, branchId: 8 });
  assert.equal(admission.request.operationId, config.operationId);
  assert.equal(admission.sharePointLease, authLease);
  assert.deepEqual(stage, { op: 'stageSharePoint', operationId: config.operationId, sessionId: 42,
    sharePointLease: authLease, pdfBase64: bytes.toString('base64') });
  assert.deepEqual(review, { op: 'reviewSharePoint', operationId: config.operationId, sessionId: 42,
    sharePointLease: authLease });
});

test('protected intake defers the next write after pause and refuses other branch scopes or receipt identities', async () => {
  const protectedConfig = { ...readDmsPilotConfig(protectedEnv), operationId: config.operationId };
  const sharePointLease = 'f1000000-0000-4000-8000-000000000011';
  const f = fixture();
  const calls = [];
  f.client.scopes = async () => [{ companyId: 7, branchId: 9 }];
  f.client.admitSharePoint = async () => { calls.push('admit'); return { id: 42, operationId: config.operationId, replayed: false }; };
  f.client.stageSharePoint = async () => { calls.push('stage'); return { sessionId: 42,
    operationId: config.operationId, sha256: config.sha256, byteCount: bytes.length, state: 'staged' }; };
  f.client.reviewSharePoint = async () => { calls.push('review'); return { sessionId: 43,
    operationId: config.operationId, state: 'review_pending', resultId: 20, reviewId: 21, notificationEventId: 22 }; };
  const run = async () => runDmsPilot({ ...f, config: protectedConfig, sharePointLease, source: await f.graph.readApprovedPdf() });
  await assert.rejects(run(), /pilot_scope_mismatch/);
  assert.deepEqual(calls, []);
  f.client.scopes = async () => [{ companyId: 7, branchId: 8 }];
  await assert.rejects(run(), /pilot_sharepoint_review_unconfirmed/);
  assert.deepEqual(calls, ['admit', 'stage', 'review']);
  const stage = f.client.stageSharePoint;
  f.client.stageSharePoint = async () => { const receipt = await stage(); f.pause(); return receipt; };
  assert.equal((await run()).status, 'paused');
  assert.deepEqual(calls, ['admit', 'stage', 'review', 'admit', 'stage']);
});

test('recovers an uncertain protected review through the same intake under the reclaimed lease', async () => {
  const f = fixture();
  const protectedConfig = { ...readDmsPilotConfig(protectedEnv), operationId: config.operationId };
  const source = await f.graph.readApprovedPdf();
  const first = 'f1000000-0000-4000-8000-000000000011';
  const second = 'f1000000-0000-4000-8000-000000000012';
  const receipts = [];
  const bindings = [];
  f.client.scopes = async () => [{ companyId: 7, branchId: 8 }];
  f.client.admitSharePoint = async (request, lease) => {
    receipts.push(request);
    return { id: 42, operationId: config.operationId, replayed: lease === second };
  };
  f.client.stageSharePoint = async (binding, pdf) => {
    bindings.push(['stage', binding]);
    assert.deepEqual(pdf, bytes);
    return { ...binding, sha256: config.sha256, byteCount: bytes.length,
      state: binding.sharePointLease === first ? 'staged' : 'review_pending' };
  };
  f.client.reviewSharePoint = async binding => {
    bindings.push(['review', binding]);
    if (binding.sharePointLease === first) throw Error('response lost after review');
    return { ...binding, state: 'review_pending', resultId: 20, reviewId: 21, notificationEventId: 22 };
  };
  const run = sharePointLease => runDmsPilot({ ...f, config: protectedConfig, sharePointLease, source });
  await assert.rejects(run(first), /response lost/);
  assert.deepEqual(await run(second), { status: 'review_pending', sessionId: 42 });
  assert.deepEqual(receipts[0], receipts[1]);
  for (const [index, [step, binding]] of bindings.entries()) {
    assert.equal(step, index % 2 === 0 ? 'stage' : 'review');
    assert.deepEqual(binding, { operationId: config.operationId, sessionId: 42, sharePointLease: index < 2 ? first : second });
  }
});

test('replays the original review once after uncertain transport, only on that protected command', async () => {
  const protectedConfig = readDmsPilotConfig(protectedEnv);
  const binding = { operationId: config.operationId, sessionId: 42, sharePointLease: 'f1000000-0000-4000-8000-000000000011' };
  for (const mayRecover of [true, false]) {
    const sent = [];
    const client = createDmsPilotClient(protectedConfig, { fetch: async (url, options) => {
      assert.equal(String(url), 'https://erp.algt.net/api/internal/agents/sharepoint-intake');
      sent.push(JSON.parse(options.body));
      if (sent.length === 1 || !mayRecover) throw Error('response interrupted');
      return Response.json({ success: true, data: { operationId: config.operationId,
        sessionId: 42, state: 'review_pending', resultId: 20, reviewId: 21, notificationEventId: 22 } });
    } });
    if (mayRecover) assert.equal((await client.reviewSharePoint(binding)).resultId, 20);
    else await assert.rejects(client.reviewSharePoint(binding), /pilot_reviewSharePoint_unconfirmed/);
    assert.deepEqual(sent, Array(2).fill({ op: 'reviewSharePoint', ...binding }));
  }
});
