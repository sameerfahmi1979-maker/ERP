import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openAgentCenterHeartbeatLedger, openDiscoveryLedger } from './ledger.mjs';

const env = {
  AGENT_CONNECTION_ID: '090ac57d-5647-4bad-9005-a006ff28ede6',
  AGENT_DISCOVERY_DATABASE_URL: 'postgres://worker:fixture@hosted.invalid:5432/postgres',
  AGENT_CENTER_TELEMETRY_COMPANY_ID: '1',
  AGENT_CENTER_HEARTBEAT_COMPANY_ID: '1',
};
const graph = { tenantId: 'tenant', clientId: 'client', driveId: 'drive', sourceId: 'source', indexId: 'index' };
const supervised = { continuous: true, agentCenterAdmission: true, agentCenterSharePointFlow: true,
  companyId: 1, branchId: 1 };

test('allows normal discovery to open hosted telemetry only for its validated supervised scope', async () => {
  const ledger = openDiscoveryLedger(env, graph, { pilot: supervised });
  try {
    assert.equal(ledger.telemetryEnabled, true);
  } finally {
    await ledger.close();
  }
});

test('retains the loopback fence for legacy and standalone proof telemetry', () => {
  assert.throws(() => openDiscoveryLedger(env, graph), /agent_center_heartbeat_requires_loopback/);
  assert.throws(() => openDiscoveryLedger(env, graph, {
    pilot: { ...supervised, agentCenterSharePointFlow: false },
  }), /agent_center_heartbeat_requires_loopback/);
  assert.throws(() => openAgentCenterHeartbeatLedger(env), /agent_center_heartbeat_requires_loopback/);
});

test('rejects a different telemetry company and TLS overrides before connecting', () => {
  assert.throws(() => openDiscoveryLedger({ ...env, AGENT_CENTER_TELEMETRY_COMPANY_ID: '2' }, graph, {
    pilot: supervised,
  }), /agent_center_telemetry_scope_mismatch/);
  assert.throws(() => openDiscoveryLedger({ ...env,
    AGENT_DISCOVERY_DATABASE_URL: `${env.AGENT_DISCOVERY_DATABASE_URL}?sslmode=disable`,
  }, graph, { pilot: supervised }), /invalid_AGENT_DISCOVERY_DATABASE_URL/);
});

test('keeps ordinary hosted discovery and local proof modes available', async () => {
  const ordinary = openDiscoveryLedger({ ...env, AGENT_CENTER_TELEMETRY_COMPANY_ID: undefined }, graph);
  const local = openDiscoveryLedger({ ...env,
    AGENT_DISCOVERY_DATABASE_URL: env.AGENT_DISCOVERY_DATABASE_URL.replace('hosted.invalid', '127.0.0.1'),
  }, graph);
  try {
    assert.equal(ordinary.telemetryEnabled, false);
    assert.equal(local.telemetryEnabled, true);
  } finally {
    await Promise.all([ordinary.close(), local.close()]);
  }
});
