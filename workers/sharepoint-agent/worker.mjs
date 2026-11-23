import { setTimeout as delay } from 'node:timers/promises';
import { ConnectionError, createSharePointConnection, readConnectionConfig } from './connection.mjs';
import { discoverChanges } from './discovery.mjs';
import { createDmsPilotClient, readDmsPilotConfig, runDmsBatch, runDmsPilot } from './dms-pilot.mjs';
import { runContinuousIntake } from './continuous.mjs';

const mode = process.env.AGENT_MODE ?? 'connection_probe';

const shutdown = new AbortController();
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => shutdown.abort());
}

function report(event, details = {}) {
  console.log(JSON.stringify({ event, mode, ...details }));
}

async function runAgentCenterHeartbeat() {
  const { openAgentCenterHeartbeatLedger } = await import('./ledger.mjs');
  const ledger = openAgentCenterHeartbeatLedger(process.env);
  try {
    while (!shutdown.signal.aborted) {
      try {
        const recordedAt = await ledger.pulse();
        if (recordedAt) report('dms_agent_center_heartbeat', { recordedAt });
        else report('dms_agent_center_heartbeat_unavailable');
      } catch {
        report('dms_agent_center_heartbeat_failed', { reason: 'database_operation_failed' });
      }
      if (!shutdown.signal.aborted) await delay(15_000, undefined, { signal: shutdown.signal });
    }
  } finally {
    await ledger.close();
  }
}

async function run() {
  if (mode === 'agent_center_heartbeat') return runAgentCenterHeartbeat();
  const config = readConnectionConfig(process.env);
  const connection = createSharePointConnection(config);
  if (!['connection_probe', 'discovery'].includes(mode)) throw new ConnectionError('invalid_AGENT_MODE');
  const ledger = mode === 'discovery'
    ? (await import('./ledger.mjs')).openDiscoveryLedger(process.env, config)
    : null;
  const pilot = ledger ? readDmsPilotConfig(process.env) : null;
  const continuousClient = pilot?.continuous ? createDmsPilotClient(pilot, { shutdown: shutdown.signal }) : null;
  let pilotDone = false;
  const interval = 15 * 60_000;
  let retryDelay = 30_000;
  try {
    while (!shutdown.signal.aborted) {
      let wait = interval;
      try {
        if (ledger) {
          if (continuousClient) {
            try {
              const status = await ledger.linkNextApprovedEmployeeDocument();
              report('dms_approved_hr_link', { status });
              if (status !== 'disabled' && status !== 'no_eligible_approval') wait = 60_000;
            } catch {
              report('dms_approved_hr_link_failed', { reason: 'database_operation_failed' });
            }
          }
          const result = await discoverChanges({ sharePoint: connection, ledger, signal: shutdown.signal });
          report('sharepoint_discovery', result);
          if (result.status === 'more_pages' || result.status === 'stale') wait = 1000;
          if (continuousClient && result.status === 'caught_up' && !shutdown.signal.aborted) {
            const statuses = await runContinuousIntake({ config: pilot, client: continuousClient, graph: connection,
              ledger, signal: shutdown.signal });
            report('dms_continuous_intake', { statuses });
            if (statuses.length) wait = 60_000;
          } else if (pilot && !pilot.continuous && !pilotDone && result.status === 'caught_up' && !shutdown.signal.aborted) {
            try {
              const client = createDmsPilotClient(pilot, { shutdown: shutdown.signal });
              const context = { config: pilot, client, graph: connection, ledger, signal: shutdown.signal };
              const receipts = pilot.batch ? await runDmsBatch(context) : [await runDmsPilot(context)];
              if (pilot.batch) report('dms_batch', { receipts });
              else report('dms_pilot', receipts[0]);
              pilotDone = !receipts.some(({ status }) => ['paused', 'ocr_processing', 'ai_processing'].includes(status));
              if (pilot.batch && !pilotDone) wait = 15_000;
            } catch (error) {
              const reason = error instanceof ConnectionError ? error.message : 'pilot_unexpected_error';
              report('dms_pilot_failed', { reason });
              pilotDone = true;
            }
          }
        } else {
          report('sharepoint_connection_verified', await connection.probe());
        }
        retryDelay = 30_000;
      } catch (error) {
        const reason = error instanceof ConnectionError ? error.message : 'unexpected_worker_error';
        report('sharepoint_worker_failed', { reason });
        wait = retryDelay;
        retryDelay = Math.min(interval, retryDelay * 2);
      }
      if (!shutdown.signal.aborted) await delay(wait, undefined, { signal: shutdown.signal });
    }
  } finally {
    await ledger?.close();
  }
}

run().catch(error => {
  if (shutdown.signal.aborted) return;
  const reason = error instanceof ConnectionError ? error.message : 'unexpected_startup_error';
  report('sharepoint_worker_configuration_failed', { reason });
  process.exitCode = 1;
});
