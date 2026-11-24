import { execFileSync } from "node:child_process";
import { createPrivateKey, randomUUID, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const endpoint = "https://erp.algt.net/api/internal/communications/worker-launch";
const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// libpq reads the preconfigured private operator connection (e.g. PGSERVICE and its protected password file).
// A single autocommitted SELECT must exit successfully before any receipt is signed or delivered.
function debit(boot, attempt) {
  return execFileSync("psql", ["-X", "-qAt", "-w", "-v", "ON_ERROR_STOP=1", "-c",
    `select erp_comm_cost.take_worker_delivery('${boot}'::uuid,'${attempt}'::uuid)::text`],
    { encoding: "utf8", timeout: 5000, maxBuffer: 8192, stdio: ["ignore", "pipe", "ignore"] }).trim();
}

export async function launch(boot, keyBytes, io = { debit, send: fetch }) {
  if (!id.test(boot)) throw Error("Invalid boot identifier");
  const key = createPrivateKey(keyBytes);
  if (key.asymmetricKeyType !== "ed25519") throw Error("Issuer key must be Ed25519");
  const receipt = io.debit(boot, randomUUID());
  if (!receipt || Buffer.byteLength(receipt) > 2700) throw Error("Delivery held");
  const grant = JSON.parse(receipt);
  if (grant.v !== 1 || grant.boot !== boot || !["chat_stage", "ptt"].includes(grant.kind) ||
      Date.parse(grant.notBefore) > Date.now() || !(Date.parse(grant.registerBy) > Date.now() + 10000)) throw Error("Delivery held");
  const body = Buffer.from(receipt);
  const token = body.toString("base64url") + "." + sign(null, body, key).toString("base64url");
  const result = await io.send(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
    headers: { Authorization: "Bearer " + token } });
  if (result.status !== 204) throw Error("Registration not confirmed");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4) throw Error("Expected boot UUID and offline issuer key file");
    await launch(process.argv[2], readFileSync(process.argv[3]));
    process.stdout.write("Worker registration confirmed.\n");
  } catch {
    process.stderr.write("Worker registration unconfirmed. Discard this delivery.\n");
    process.exitCode = 1;
  }
}
