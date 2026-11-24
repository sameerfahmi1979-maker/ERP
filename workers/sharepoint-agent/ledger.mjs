import { Pool } from 'pg';
import { ConnectionError } from './connection.mjs';
import { maxBatchSize } from './dms-pilot.mjs';

function openLedgerPool(env, { loopbackOnly = false } = {}) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(env.AGENT_CONNECTION_ID ?? '')) {
    throw new ConnectionError('invalid_AGENT_CONNECTION_ID');
  }
  let url;
  try {
    url = new URL(env.AGENT_DISCOVERY_DATABASE_URL);
  } catch {
    throw new ConnectionError('invalid_AGENT_DISCOVERY_DATABASE_URL');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.search || url.hash) {
    throw new ConnectionError('invalid_AGENT_DISCOVERY_DATABASE_URL');
  }
  if (loopbackOnly && url.hostname !== '127.0.0.1') {
    throw new ConnectionError('agent_center_heartbeat_requires_loopback');
  }
  // Remote connections always validate TLS. Only the isolated local database
  // can use plaintext loopback transport.
  const ssl = url.hostname === '127.0.0.1' ? false : {
    rejectUnauthorized: true,
    ...(env.AGENT_DISCOVERY_DATABASE_CA ? { ca: env.AGENT_DISCOVERY_DATABASE_CA } : {}),
  };
  const pool = new Pool({
    connectionString: url.toString(), ssl, max: 2,
    connectionTimeoutMillis: 5000, statement_timeout: 15000, query_timeout: 20000,
  });
  pool.on('error', () => {});
  return pool;
}

function readCompanyId(env, key) {
  const companyId = Number(env[key]);
  if (!Number.isSafeInteger(companyId) || companyId <= 0) {
    throw new ConnectionError(`invalid_${key}`);
  }
  return companyId;
}

export function openAgentCenterHeartbeatLedger(env) {
  const companyId = readCompanyId(env, 'AGENT_CENTER_HEARTBEAT_COMPANY_ID');
  const pool = openLedgerPool(env, { loopbackOnly: true });
  const fields = [env.AGENT_CONNECTION_ID, companyId];
  return {
    async pulse() {
      const { rows } = await pool.query(
        'select erp_private.record_agent_center_sharepoint_heartbeat($1, $2) as recorded_at', fields,
      );
      return rows[0].recorded_at;
    },
    close: () => pool.end(),
  };
}

export function openDiscoveryLedger(env, graphConfig) {
  const companyId = env.AGENT_CENTER_TELEMETRY_COMPANY_ID === undefined
    ? null
    : readCompanyId(env, 'AGENT_CENTER_TELEMETRY_COMPANY_ID');
  const pool = openLedgerPool(env, { loopbackOnly: companyId !== null });
  const fields = [env.AGENT_CONNECTION_ID, graphConfig.tenantId, graphConfig.clientId,
    graphConfig.driveId, graphConfig.sourceId, graphConfig.indexId];
  async function recordWorkerCycle(cycleId, revision, caughtUp) {
    const { rows } = await pool.query(
      'select erp_private.record_agent_center_sharepoint_worker_cycle($1, $2, $3, $4, $5) as recorded_at',
      [fields[0], companyId, cycleId, revision, caughtUp],
    );
    return rows[0].recorded_at;
  }
  return {
    telemetryEnabled: companyId !== null,
    async startWorkerCycle(cycleId) {
      await this.read();
      await recordWorkerCycle(cycleId, null, false);
    },
    finishWorkerCycle: recordWorkerCycle,
    async read() {
      const { rows } = await pool.query(
        `select s.cursor, s.revision, s.paused
           from erp_private.agent_sync_checkpoints s
           join erp_private.agent_connections c on c.id = s.connection_id
          where c.id = $1 and c.tenant_id = $2 and c.client_id = $3 and c.drive_id = $4
            and c.source_folder_id = $5 and c.index_folder_id = $6`,
        fields,
      );
      if (rows.length !== 1) throw new ConnectionError('discovery_binding_unavailable');
      return rows[0];
    },
    async commit(checkpoint, page) {
      const { rows } = await pool.query(
        'select erp_private.commit_agent_sharepoint_page($1, $2, $3, $4) as status',
        [fields[0], checkpoint.revision, page.cursor, JSON.stringify(page.changes)],
      );
      return rows[0].status;
    },
    async batchCandidates(batch) {
      await this.read();
      const { rows } = await pool.query(
        `with latest_in_window as (
           select distinct on (item_id) item_id, version, discovered_at
             from erp_private.agent_source_versions
            where connection_id = $1 and mime = 'application/pdf' and size_bytes between 1 and 3145728
              and discovered_at >= $2::timestamptz and discovered_at <= $3::timestamptz
            order by item_id, discovered_at desc, version desc
         ), candidates as (
           select item_id, version, discovered_at from latest_in_window
            order by discovered_at, item_id, version limit $4 offset $5
         )
         select candidates.item_id as "itemId", candidates.version,
                coalesce(item.available and item.version = candidates.version, false) as current
           from candidates
           left join erp_private.agent_source_items item
             on item.connection_id = $1 and item.item_id = candidates.item_id
          order by candidates.discovered_at, candidates.item_id, candidates.version`,
        [fields[0], batch.from, batch.through, maxBatchSize, batch.offset],
      );
      return rows;
    },
    async claimPdf() {
      const { rows } = await pool.query('select erp_private.claim_agent_pdf($1) as item', [fields[0]]);
      return rows[0].item;
    },
    async advancePdf(item, step, hash = null) {
      const { rows } = await pool.query(
        'select erp_private.advance_agent_pdf($1, $2, $3, $4, $5) as status',
        [fields[0], item.operation_id, item.lease_token, step, hash],
      );
      return rows[0].status;
    },
    async linkNextApprovedEmployeeDocument() {
      const { rows } = await pool.query(
        'select erp_private.link_agent_approved_employee_document($1) as status',
        [fields[0]],
      );
      return rows[0].status;
    },
    close: () => pool.end(),
  };
}
