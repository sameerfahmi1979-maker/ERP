import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Pool } from 'pg';
import { openDiscoveryLedger } from './ledger.mjs';

const adminURL = process.env.AGENT_TEST_ADMIN_URL;
const workerURL = process.env.AGENT_TEST_WORKER_URL;
const id = 'ba100001-f14e-4a43-beeb-c4aa6dcd9191';
const otherId = 'ba100002-f14e-4a43-beeb-c4aa6dcd9191';
const config = {
  tenantId: 'aaaa0000-f14e-4a43-beeb-c4aa6dcd9191', clientId: 'bbbb0000-f14e-4a43-beeb-c4aa6dcd9191',
  driveId: 'drive', sourceId: 'source', indexId: 'index',
};
const pdf = { id: 'sample', kind: 'file', name: 'approved-fixture.pdf', version: 'c:v1', mime: 'application/pdf',
  size: 50000, ancestors: ['nested', config.sourceId] };

test('native PostgreSQL commits pages and cursors together and fences scope, retry and pause', {
  skip: !adminURL || !workerURL,
}, async () => {
  assert.equal(new URL(adminURL).hostname, '127.0.0.1');
  assert.equal(new URL(workerURL).hostname, '127.0.0.1');
  const admin = new Pool({ connectionString: adminURL });
  const worker = new Pool({ connectionString: workerURL });
  const env = { AGENT_CONNECTION_ID: id, AGENT_DISCOVERY_DATABASE_URL: workerURL };
  let ledger = openDiscoveryLedger(env, config);
  try {
    const standardRoles = await admin.query(`select role_name,
        has_table_privilege(role_name, 'erp_private.agent_sync_checkpoints', 'SELECT') as reads,
        has_function_privilege(role_name, 'erp_private.commit_agent_sharepoint_page(uuid,bigint,text,jsonb)', 'EXECUTE') as commits
        from unnest(array['anon','authenticated','service_role']::name[]) role_name`);
    assert.ok(standardRoles.rows.every(row => !row.reads && !row.commits));
    await admin.query(`insert into erp_private.agent_connections
        values ($1, 'agent_test_worker', $3, $4, $5, $6, $7),
               ($2, 'agent_test_other', $3, $4, $5, 'other_source', 'other_index')
        on conflict (id) do nothing`, [id, otherId, config.tenantId, config.clientId, config.driveId, config.sourceId, config.indexId]);
    await admin.query('delete from erp_private.agent_source_items where connection_id = $1', [id]);
    await admin.query('delete from erp_private.agent_source_versions where connection_id = $1', [id]);
    await admin.query(`insert into erp_private.agent_sync_checkpoints(connection_id, cursor, revision, paused)
        values ($1, null, 0, false), ($2, null, 0, false)
        on conflict (connection_id) do update set cursor = null, revision = 0, paused = false`, [id, otherId]);
    const before = await ledger.read();
    const race = await Promise.all([
      ledger.commit(before, { cursor: 'page-2', changes: [pdf] }),
      ledger.commit(before, { cursor: 'page-2', changes: [pdf] }),
    ]);
    assert.deepEqual(race.sort(), ['committed', 'stale']);
    await ledger.close();
    ledger = openDiscoveryLedger(env, config);
    assert.deepEqual(await ledger.read(), { cursor: 'page-2', revision: '1', paused: false });
    await assert.rejects(ledger.commit(await ledger.read(), { cursor: 'would-lose-change', changes: [
      { id: 'nested', kind: 'unavailable' }, { ...pdf, id: 'break', name: '' },
    ] }), { code: '23514' });
    const checkpoint = await ledger.read();
    assert.equal(checkpoint.cursor, 'page-2');
    const current = () => worker.query('select available,filename from erp_private.agent_source_items where connection_id=$1', [id]);
    assert.deepEqual((await current()).rows, [{ available: true, filename: pdf.name }]);
    await assert.rejects(ledger.commit(checkpoint, { cursor: 'bad', changes: [{ ...pdf, ancestors: ['index', 'source'] }] }),
      { code: '22023' });
    assert.equal(await ledger.commit(checkpoint, { cursor: 'page-3', changes: [{ ...pdf, name: 'renamed.pdf' }] }), 'committed');
    assert.equal((await worker.query('select count(*)::int as n from erp_private.agent_source_versions')).rows[0].n, 1);
    assert.deepEqual((await current()).rows, [{ available: true, filename: 'renamed.pdf' }]);
    assert.equal((await worker.query('select id from erp_private.agent_connections where id = $1', [otherId])).rowCount, 0);
    await assert.rejects(worker.query("select erp_private.commit_agent_sharepoint_page($1, 0, 'forbidden', '[]')", [otherId]),
      { code: '42501' });
    await assert.rejects(worker.query('update erp_private.agent_sync_checkpoints set paused = false'), { code: '42501' });
    const last = await ledger.read();
    assert.equal(await ledger.commit(last, { cursor: 'page-4', changes: [{ id: 'nested', kind: 'unavailable' }] }), 'committed');
    assert.equal((await current()).rows[0].available, false);
    const beforePause = await ledger.read();
    await admin.query('update erp_private.agent_sync_checkpoints set paused = true where connection_id=$1', [id]);
    assert.equal(await ledger.commit(beforePause, { cursor: 'blocked', changes: [] }), 'paused');
    assert.equal((await ledger.read()).cursor, 'page-4');
  } finally {
    await Promise.all([ledger.close(), admin.end(), worker.end()]);
  }
});
