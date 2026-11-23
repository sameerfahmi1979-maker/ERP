import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const [psql, port, worker] = process.argv.slice(2);
assert.ok(psql && /^\d{4,5}$/.test(port ?? "") && Number(port) <= 65535 && worker,
  "Pass psql, the disposable PostgreSQL fixture port and the SharePoint worker entry");
const database = "agent_center_heartbeat_native";
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, PGHOSTADDR: "127.0.0.1" };
const args = ["-X", "-w", "-qAt", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"];

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, { env, encoding: "utf8", timeout: 25000, windowsHide: true, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim());
  return result.stdout.trim();
}

const file = path => fileURLToPath(new URL(path, import.meta.url));
const held = "../../supabase/phase1-isolated/";
const fixture = "native-telemetry/";
assert.equal(run(psql, [...args, "-c", `select current_database() = '${database}' and
  inet_server_addr() = inet '127.0.0.1' and inet_server_port() = ${port} and to_regnamespace('erp_private') is null;`]),
  "t", "An empty, disposable IPv4 loopback fixture database is required");

for (const path of [
  fixture + "projection-fixture.native.sql",
  fixture + "20261120161031_dms_agent_center_read.sql",
  fixture + "20261120162020_dms_agent_center_projection_privacy.sql",
  held + "20261120161110_dms_agent_center_controls.sql",
  fixture + "sharepoint-heartbeat-fixture.native.sql",
  held + "20261123113000_dms_agent_center_sharepoint_heartbeat.sql",
  "sharepoint-telemetry-fixture.native.sql",
]) {
  run(psql, [...args, "-f", file(path)]);
}

const discovery = readFileSync(file(fixture + "20261118104719_agent_sharepoint_discovery.sql"), "utf8");
const start = discovery.indexOf("create function erp_private.commit_agent_sharepoint_page");
const end = discovery.lastIndexOf("commit;");
assert.ok(start > 0 && end > start, "Expected the checked-in native discovery commit function");
run(psql, args, { input: discovery.slice(start, end) });
run(psql, [...args, "-f", file(held + "20261123120000_dms_agent_center_sharepoint_worker_telemetry.sql")]);
console.log(run(process.execPath, [file("sharepoint-telemetry.native.mjs"), psql, port, worker]));
