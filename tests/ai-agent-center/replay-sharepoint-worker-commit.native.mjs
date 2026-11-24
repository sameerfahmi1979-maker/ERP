import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [psql, port] = process.argv.slice(2);
assert.ok(psql && /^\d{4,5}$/.test(port ?? "") && Number(port) <= 65535,
  "Pass psql and the disposable PostgreSQL fixture port");

const database = "agent_center_controls_native";
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, PGHOSTADDR: "127.0.0.1" };
const args = ["-X", "-w", "-qAt", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"];
const repoPath = path => fileURLToPath(new URL("../../" + path, import.meta.url));

function run(command, arguments_, timeout = 25_000) {
  const result = spawnSync(command, arguments_, { env, encoding: "utf8", timeout, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim());
  return result.stdout.trim();
}

assert.equal(run(psql, [...args, "-c", `select current_database() = '${database}' and
  inet_server_addr() = inet '127.0.0.1' and inet_server_port() = ${port} and to_regnamespace('erp_private') is null;`]),
  "t", "An empty, disposable IPv4 loopback fixture database is required");

const isolated = "supabase/phase1-isolated/";
const migrations = "supabase/migrations/";
const tests = "tests/ai-agent-center/";
const fixtures = tests + "native-worker-commit/";
for (const path of [
  fixtures + "controls-fixture.native.sql",
  isolated + "20261120161110_dms_agent_center_controls.sql",
  fixtures + "sharepoint-binding-fixture.native.sql",
  tests + "sharepoint-worker-commit-fixture.native.sql",
  migrations + "20261017144319_f07_verified_temporary_uploads.sql",
  migrations + "20261017183329_f07_stable_single_upload_admission.sql",
  migrations + "20261025065803_dms_explicit_upload_company.sql",
  fixtures + "20261118170900_agent_continuous_pdf_intake.sql",
  fixtures + "20261119031500_agent_document_duplicate_review.sql",
  isolated + "20261123100500_dms_agent_center_sharepoint_binding.sql",
  tests + "sharepoint-worker-authority-fixture.native.sql",
  isolated + "20261123101000_dms_sharepoint_intake_origin.sql",
  isolated + "20261123102000_dms_sharepoint_intake_storage.sql",
  isolated + "20261123103000_dms_sharepoint_intake_worker_commit.sql",
]) {
  run(psql, [...args, "-f", repoPath(path)]);
}

console.log(run(process.execPath, [repoPath(tests + "sharepoint-worker-commit.native.mjs"), psql, port, "green", repoPath("")], 180_000));
