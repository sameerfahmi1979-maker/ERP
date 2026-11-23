import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";

const [psql, port, entry] = process.argv.slice(2);
assert.ok(psql && /^\d{4,5}$/.test(port ?? "") && Number(port) <= 65535 && entry,
  "Pass psql, the isolated fixture port and SharePoint worker entry");
const database = "agent_center_heartbeat_native";
const connection = "10000000-0000-0000-0000-000000000001";
const runtime = "agent_heartbeat_fixture_a";
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, PGHOSTADDR: "127.0.0.1" };

function sql(statement, user = "postgres") {
  const result = spawnSync(psql, ["-X", "-w", "-qAt", "-h", "127.0.0.1", "-p", port, "-U", user, "-d", database,
    "-v", "ON_ERROR_STOP=1"], { env, input: statement, encoding: "utf8", timeout: 10000, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim());
  return result.stdout.trim();
}

function snapshot(principal = "company", company = 1, branch = "null") {
  return JSON.parse(sql(`set role authenticated; set agentcenter.principal = '${principal}';
    select public.dms_agent_center_read(${company}, ${branch}, null, null, null, 0);`));
}

async function runWorker({ scenario = "caught_up", configured = true, stopAfter = "dms_agent_center_worker_heartbeat",
  onWaiting, company = "1", user = runtime, connectionId = connection, host = "127.0.0.1", continuous = false, hrLink = false } = {}) {
  const worker = spawn(process.execPath, ["--import", new URL("./sharepoint-telemetry-graph.fixture.mjs", import.meta.url).href, resolve(entry)], {
    windowsHide: true,
    env: {
      ...env, AGENT_MODE: "discovery", TELEMETRY_FIXTURE_SCENARIO: scenario,
      ...(configured ? { AGENT_CENTER_TELEMETRY_COMPANY_ID: company } : {}),
      ...(continuous ? { AGENT_DMS_PILOT: "continuous", PILOT_ERP_AUTH_USER_ID: "30000000-0000-0000-0000-000000000001",
        PILOT_ERP_COMPANY_ID: "1", PILOT_ERP_EMAIL: "synthetic@example.invalid", PILOT_ERP_PASSWORD: "synthetic-only" } : {}),
      ...(hrLink ? { AGENT_DMS_HR_LINK_ENABLED: "1" } : {}),
      AGENT_CONNECTION_ID: connectionId,
      AGENT_DISCOVERY_DATABASE_URL: `postgresql://${user}@${host}:${port}/${database}`,
      GRAPH_TENANT_ID: "20000000-0000-0000-0000-000000000001",
      GRAPH_CLIENT_ID: "20000000-0000-0000-0000-000000000002",
      GRAPH_DRIVE_ID: "FixtureDrive", GRAPH_SOURCE_FOLDER_ID: "FixtureSource", GRAPH_INDEX_FOLDER_ID: "FixtureIndex",
      GRAPH_CLIENT_SECRET: "synthetic-only",
    },
  });
  const closed = new Promise(done => worker.once("close", done));
  worker.stdout.setEncoding("utf8");
  worker.stderr.setEncoding("utf8");
  let pending = "", stderr = "";
  const events = [];
  try {
    return await new Promise((done, reject) => {
      const timeout = setTimeout(() => finish(new Error(`Missing ${stopAfter}: ${JSON.stringify(events)} ${stderr}`)), 5500);
      function finish(error) {
        clearTimeout(timeout);
        if (error) reject(error);
        else done(events);
      }
      worker.once("error", finish);
      worker.once("close", () => finish(new Error(`Worker exited before ${stopAfter}: ${stderr}`)));
      worker.stderr.on("data", data => { stderr += data; });
      worker.stdout.on("data", data => {
        pending += data;
        const lines = pending.split("\n");
        pending = lines.pop();
        for (const line of lines) {
          try {
            const record = JSON.parse(line);
            events.push(record);
            if (record.event === "fixture_graph_waiting") {
              onWaiting?.();
              worker.stdin.write("resume\n");
            }
            if (record.event === stopAfter) finish();
          } catch (error) {
            finish(error);
          }
        }
      });
    });
  } finally {
    worker.kill();
    await closed;
  }
}

assert.equal(sql(`select case when current_database() = '${database}' and inet_server_addr() = inet '127.0.0.1'
  and to_regclass('erp_private.agent_center_sharepoint_worker_heartbeats') is not null then 'fixture' end;`), "fixture");
assert.equal(snapshot().workerHeartbeatAt, undefined);
const defaultPilot = await runWorker({ stopAfter: "dms_continuous_intake", configured: false, continuous: true });
assert.ok(defaultPilot.some(event => event.event === "sharepoint_discovery" && event.status === "caught_up"));
assert.equal(sql("select count(*) from erp_private.agent_center_fixture_hr_link_calls;"), "0", "normal dispatch defaults off");
const optedInPilot = await runWorker({ stopAfter: "dms_continuous_intake", configured: false, continuous: true, hrLink: true });
assert.equal(optedInPilot.find(event => event.event === "dms_approved_hr_link")?.status, "no_eligible_approval");
assert.equal(sql("select count(*) from erp_private.agent_center_fixture_hr_link_calls;"), "1");
assert.equal(snapshot().workerHeartbeatAt, undefined);
await runWorker({ stopAfter: "sharepoint_discovery" });
assert.equal(snapshot().workerHeartbeatAt, undefined, "normal worker needs an explicit enrollment");
sql(`insert into erp_private.agent_center_sharepoint_worker_heartbeats(connection_id,company_id,actor_id,runtime_login)
  values ('${connection}',1,101,'${runtime}');`);
const first = await runWorker();
const confirmed = snapshot();
assert.equal(Date.parse(confirmed.workerHeartbeatAt), Date.parse(first.at(-1).recordedAt));
assert.deepEqual(confirmed.intakeProgress, { completedUnits: 2, totalUnits: 5 });
assert.equal(snapshot("reviewer").workerHeartbeatAt, confirmed.workerHeartbeatAt);
for (const [principal, company, branch] of [["viewer", 1, "null"], ["branch", 1, 11], ["branch", 1, "null"], ["other", 2, "null"]]) {
  const unauthorized = snapshot(principal, company, branch);
  assert.equal(unauthorized.workerHeartbeatAt, undefined);
  assert.equal(unauthorized.intakeProgress, null);
}

const probe = sql(`select erp_private.record_agent_center_sharepoint_heartbeat('${connection}',1);`, runtime);
assert.ok(Date.parse(probe) >= Date.parse(confirmed.workerHeartbeatAt));
assert.equal(snapshot().workerHeartbeatAt, confirmed.workerHeartbeatAt, "the diagnostic probe does not update normal liveness");
await runWorker({ company: "2", stopAfter: "sharepoint_discovery" });
assert.equal(snapshot().workerHeartbeatAt, confirmed.workerHeartbeatAt, "mismatched enrollment cannot write liveness");
assert.equal(snapshot().intakeProgress, null, "a new checkpoint revision invalidates the old measurement");
await runWorker({ host: "telemetry.invalid", stopAfter: "sharepoint_worker_configuration_failed" });

await runWorker({ scenario: "wait", onWaiting() {
  assert.equal(snapshot().workerHeartbeatAt, confirmed.workerHeartbeatAt);
  assert.equal(snapshot().intakeProgress, null, "an open normal worker cycle hides progress");
} });
assert.deepEqual(snapshot().intakeProgress, { completedUnits: 2, totalUnits: 5 });
const healthy = snapshot().workerHeartbeatAt;
await runWorker({ scenario: "failed", stopAfter: "sharepoint_worker_failed" });
assert.equal(snapshot().workerHeartbeatAt, healthy, "a Graph failure cannot advance the heartbeat");
assert.equal(snapshot().intakeProgress, null);
await runWorker({ scenario: "partial" });
assert.ok(Date.parse(snapshot().workerHeartbeatAt) > Date.parse(healthy));
assert.equal(snapshot().intakeProgress, null, "a partial traversal cannot establish the denominator");

await runWorker({ scenario: "replace" });
assert.deepEqual(snapshot().intakeProgress, { completedUnits: 1, totalUnits: 5 }, "a superseded version cannot count as checked");
sql(`update erp_private.agent_pdf_work set status = 'retry', lease_until = now() + interval '10 minutes'
  where connection_id = '${connection}' and item_id = 'b';`);
assert.equal(snapshot().intakeProgress, null, "an active ledger lease suppresses measured progress");
sql(`update erp_private.agent_pdf_work set lease_until = null, sha256 = 'synthetic-b'
    where connection_id = '${connection}' and item_id = 'b';
  insert into public.dms_upload_sessions (id, uploaded_by, owning_company_id, sha256_hash, status, intake_status)
    values (101, 101, 1, 'synthetic-b', 'uploaded', 'ocr_processing');
  insert into erp_private.f07_single_upload_admissions (actor_id, operation_id, upload_session_id)
    select 101, operation_id, 101 from erp_private.agent_pdf_work where connection_id = '${connection}' and item_id = 'b';`);
assert.equal(snapshot().intakeProgress, null, "a retained in-flight ERP intake also hides progress after the worker releases its lease");
sql("update public.dms_upload_sessions set intake_status = 'review_pending' where id = 101;");

sql(`update erp_private.agent_pdf_work set status = 'review_pending', lease_until = null where connection_id = '${connection}' and item_id = 'b';
  update erp_private.dms_agent_center_controls set revision = revision + 1, paused = true where company_id = 1;`);
await runWorker();
assert.ok(snapshot().workerHeartbeatAt, "normal discovery can complete while intake is paused");
assert.equal(snapshot().intakeProgress, null);
sql("update erp_private.dms_agent_center_controls set revision = revision + 1, paused = false where company_id = 1;");
assert.equal(snapshot().intakeProgress, null, "control changes require a fresh measurement");
await runWorker();
assert.deepEqual(snapshot().intakeProgress, { completedUnits: 1, totalUnits: 5 });
sql("update erp_private.agent_center_sharepoint_worker_heartbeats set worker_seen_at = now() - interval '21 minutes';");
assert.equal(snapshot().intakeProgress, null, "old measurements expire while the heartbeat stays historical");
assert.ok(snapshot().workerHeartbeatAt);
sql("update public.user_profiles set status = 'inactive' where id = 101;");
assert.equal(snapshot().workerHeartbeatAt, undefined);
assert.equal(snapshot().intakeProgress, null);
assert.equal(sql(`select has_function_privilege('authenticated','erp_private.record_agent_center_sharepoint_worker_cycle(uuid,bigint,uuid,bigint,boolean)','EXECUTE')
  or has_function_privilege('service_role','erp_private.record_agent_center_sharepoint_worker_cycle(uuid,bigint,uuid,bigint,boolean)','EXECUTE')
  or has_table_privilege('${runtime}','erp_private.agent_center_sharepoint_worker_heartbeats','UPDATE');`), "f");
console.log("PASSED normal worker, authoritative scoped progress and fail-closed telemetry on PostgreSQL");
