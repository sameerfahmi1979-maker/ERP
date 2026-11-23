import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runContinuousIntake } from './continuous.mjs';
import { createDmsPilotClient, readDmsPilotConfig } from './dms-pilot.mjs';

const operationId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const firstLease = 'f1000000-0000-4000-8000-000000000011';
const secondLease = 'f1000000-0000-4000-8000-000000000012';
const authUserId = '11111111-2222-4333-8444-555555555555';

test('carries each claimed lease beside the same admission request and stops after its receipt', async () => {
  const calls = [];
  const advances = [];
  const config = { authUserId, companyId: 7, continuous: true, agentCenterAdmission: true };
  const client = createDmsPilotClient(config, { fetch: async (_url, options) => {
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body);
    calls.push(body);
    const data = {
      login: { userId: authUserId, accessToken: 'synthetic.erp.token', expiresAt: Date.now() / 1000 + 3600 },
      profile: { userId: authUserId, capabilities: { upload: true, preview: true, review: true, numbering: false } },
      scopes: { rows: [{ companyId: 7, branchId: null }] },
      admitSharePoint: { id: 42, operationId, replayed: body.sharePointLease === secondLease },
    }[body.op];
    return data ? Response.json({ success: true, data }) : new Response(null, { status: 400 });
  } });
  for (const lease_token of [firstLease, secondLease]) {
    const item = { operation_id: operationId, lease_token, item_id: 'synthetic', version: 'only' };
    const ledger = {
      claimPdf: async () => item,
      advancePdf: async (current, step) => {
        assert.equal(current, item);
        advances.push(step);
        return step === 'inspect' ? 'download' : 'ready';
      },
    };
    const graph = { readDiscoveredPdf: async () => ({ name: 'synthetic.pdf', bytes: Buffer.from('%PDF-file') }) };
    assert.deepEqual(await runContinuousIntake({ config, client, graph, ledger }), ['admission_retained']);
  }
  const admissions = calls.filter(call => call.op === 'admitSharePoint');
  assert.deepEqual(admissions.map(call => call.sharePointLease), [firstLease, secondLease]);
  assert.deepEqual(admissions[0].request, admissions[1].request);
  assert.equal(admissions[0].request.operationId, operationId);
  assert.deepEqual(Object.keys(admissions[0].request).sort(), ['authUserId', 'context', 'metadata', 'operationId', 'scope', 'version']);
  assert.deepEqual(advances, ['inspect', 'prepare', 'fence', 'fence', 'inspect', 'prepare', 'fence', 'fence']);
  assert.ok(calls.every(call => ['login', 'profile', 'scopes', 'admitSharePoint'].includes(call.op)));
});

test('defaults to the existing continuous mode without invoking the admission proof', () => {
  const env = { AGENT_DMS_PILOT: 'continuous', PILOT_ERP_AUTH_USER_ID: authUserId,
    PILOT_ERP_COMPANY_ID: '7', PILOT_ERP_EMAIL: 'pilot@example.invalid', PILOT_ERP_PASSWORD: 'fixture' };
  assert.equal(readDmsPilotConfig(env).agentCenterAdmission, false);
  assert.equal(readDmsPilotConfig({ ...env, PILOT_AGENT_CENTER_ADMISSION: '1' }).agentCenterAdmission, true);
});

test('skips exact duplicates before admission and resumes notification without reprocessing', async () => {
  const actions = [];
  const steps = [];
  const items = [
    { operation_id: 'duplicate', item_id: 'one', version: 'c:1' },
    { operation_id: 'pending', item_id: 'two', version: 'c:2' },
    { operation_id: 'new', item_id: 'three', version: 'c:3' },
  ];
  const result = await runContinuousIntake({
    config: {},
    ledger: {
      claimPdf: async () => items.shift(),
      advancePdf: async (item, step) => {
        steps.push([item.operation_id, step]);
        if (item.operation_id === 'pending') return 'review_pending';
        if (step === 'inspect') return 'download';
        if (step === 'prepare') return item.operation_id === 'duplicate' ? 'duplicate' : 'ready';
        return 'review_pending';
      },
    },
    graph: { readDiscoveredPdf: async id => ({ name: id + '.pdf', bytes: Buffer.from('%PDF-file') }) },
    runPilot: async ({ config }) => { actions.push(config.operationId); return { status: 'review_pending' }; },
  });
  assert.deepEqual(actions, ['new']);
  assert.deepEqual(result, ['duplicate', 'review_pending', 'review_pending']);
  assert.ok(!steps.some(([id, step]) => id === 'pending' && step !== 'inspect'));
});

test('defers an uncertain admission on the same operation and continues the next item', async () => {
  const items = [{ operation_id: 'uncertain' }, { operation_id: 'waiting' }];
  const actions = [];
  const result = await runContinuousIntake({
    config: {},
    ledger: {
      claimPdf: async () => items.shift(),
      advancePdf: async (item, step) => {
        actions.push([item.operation_id, step]);
        if (step === 'inspect') return item.operation_id === 'waiting' ? 'waiting' : 'download';
        if (step === 'prepare') return 'ready';
        return 'deferred';
      },
    },
    graph: { readDiscoveredPdf: async () => ({ name: 'one.pdf', bytes: Buffer.from('%PDF-file') }) },
    runPilot: async () => { throw Error('response lost'); },
  });
  assert.deepEqual(result, ['deferred', 'deferred']);
  assert.deepEqual(actions, [
    ['uncertain', 'inspect'], ['uncertain', 'prepare'], ['uncertain', 'defer'],
    ['waiting', 'inspect'], ['waiting', 'defer'],
  ]);
});
