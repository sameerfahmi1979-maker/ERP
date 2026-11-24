import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, randomUUID, verify } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test, { after,mock } from "node:test";
import { fileURLToPath,pathToFileURL } from "node:url";
import { preparePlan, renderEnrollmentSql, writePlanBundle, readPlanBundle, deliverPlannedBoot as realDeliver, issuePlannedBoot as realIssue, createSupervisorManifest } from "./commission-communication-pilot.mjs";
// Explicit nonsecret fixture adapter. Production CLI has no ACL bypass and no private key/vault is inspected by tests.
function fixtureIo(args) {
  mkdirSync(args[3], {recursive: true});
  args[4] = {verifyPrivateDirectory: () => true, verifyPrivateFile: () => true, ...args[4]};
  return args;
}
const deliverPlannedBoot = (...args) => realDeliver(...fixtureIo(args));
const issuePlannedBoot = (...args) => realIssue(...fixtureIo(args));

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const key = privateKey.export({ format: "pem", type: "pkcs8" });
const now = Date.parse("2026-11-24T12:00:00.000Z");mock.method(Date,"now",()=>now);
const source = mkdtempSync(join(resolve("tmp"), "pilot-commission-evidence-"));
after(() => mock.restoreAll()); // Keep owned synthetic fixture artifacts; no recursive test-folder deletion.
for (const name of ["host", "retention", "recovery", "fleet"]) writeFileSync(join(source, name), `Fixture ${name}; not operating evidence.`);
function spec() {
  return { v: 1, poolsAlreadyEnrolled:false, approvalId: randomUUID(), deploymentId: randomUUID(),
    notBefore: new Date(now - 1000).toISOString(), until: new Date(now + 3600000).toISOString(),
    publicKeySpkiBase64: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    evidence: Object.fromEntries(["host", "retention", "recovery", "fleet"].map(name => [name, join(source, name)])),
    host: { maxReplicas: 1, maxRestartsPerDeployment: 3, maxDeployments: 1, recoverySeconds: 60, supervisorLookupRetries: 0 },
    workers: [{kind: "chat_stage", workerId: randomUUID(), poolPermitId: randomUUID(), bootIds: Array.from({length: 4}, randomUUID),
      maxPolls: 130, pollSeconds: 30, busySeconds: 70, retrySeconds: 180, registrationSeconds: 5, restartSeconds: 60}],
    notifications: {poolPermitId: randomUUID(), ticks: 10, pollSeconds: 20, calendar: true, push: false},
  };
}
function plan(input = spec()) { return preparePlan(input, {now}); }
function receipt(p, worker = p.spec.workers[0], boot = worker.bootIds[0]) {
  return JSON.stringify({v: 1, kind: worker.kind, deploymentId: p.spec.deploymentId, worker: worker.workerId,
    boot, maxPolls: worker.maxPolls, maxReplicas: 1, maxRestartsPerDeployment: 3, maxDeployments: 1,
    prepaidProbes: 4, evidenceId: p.evidence.host.reference + "/" + worker.kind,
    notBefore: p.spec.notBefore, registerBy: p.spec.until, until: p.spec.until});
}

test("prepares finite explicit startup/recovery bounds and hashes genuine input files without claiming activation", () => {
  const p = plan();
  assert.equal(p.state, "prepared-not-applied");
  assert.equal(p.workers[0].maxActions, 524);
  assert.equal(p.workers[0].minimumLedgerBytes, "18022400");
  assert.equal(p.workers[0].maxLookups, 16);
  assert.equal(p.workers[0].prepaidProbes, 4);
  assert.match(p.evidence.host.reference, /^sha256:[a-f0-9]{64}$/);
  assert.equal(p.runtime.ERP_COMM_CHAT_STAGE_CLEANUP_ENABLED, "true");
  assert.equal(p.runtime.ERP_COMM_CHAT_STAGE_BOOT_IDS, JSON.stringify(p.spec.workers[0].bootIds));
  assert.equal(p.runtime.ERP_COMM_NOTIFICATION_SCHEDULER_ENABLED, "true");
  assert.equal(p.runtime.ERP_COMM_PTT_CLEANUP_ENABLED, undefined);
  assert.equal(p.runtime.RAILWAY_DEPLOYMENT_ID, undefined);
});

test("offline CLI prepares and verifies a complete reviewable bundle without contacting a runtime or database", () => {
  const path = join(source, randomUUID() + ".json"), out = join(source, randomUUID());
  writeFileSync(path, JSON.stringify(spec()));
  const script = fileURLToPath(new URL("./commission-communication-pilot.mjs", import.meta.url));
  const clock=join(source,"synthetic-clock.mjs");writeFileSync(clock,"Date.now=()=>Date.parse('2026-11-24T12:00:00.000Z');\n");
  const prepared = execFileSync(process.execPath, ["--import",pathToFileURL(clock).href,script, "prepare", "--spec", path, "--out", out], {encoding: "utf8"});
  assert.match(prepared, /Prepared, not applied/);
  const reviewed = execFileSync(process.execPath, ["--import",pathToFileURL(clock).href,script, "review", "--plan", out], {encoding: "utf8"});
  assert.match(reviewed, /input-file hashes match/);
  assert.match(readFileSync(join(out, "notification-start.sql"), "utf8"), /notification_start_scheduler/);
});

test("normalizes UUIDs for the exact database receipt and rejects nonexistent dates", () => {
  const s = spec(); s.deploymentId = s.deploymentId.toUpperCase(); s.workers[0].workerId = s.workers[0].workerId.toUpperCase();
  const p = plan(s); assert.equal(p.spec.deploymentId, s.deploymentId.toLowerCase());
  assert.equal(p.runtime.ERP_COMM_CHAT_STAGE_CLEANUP_WORKER_ID, s.workers[0].workerId.toLowerCase());
  s.notBefore = "2026-02-30T00:00:00.000Z"; assert.throws(() => plan(s), /Nonexistent/);
});

test("rejects unknown knobs, invalid identities, unbounded host exposure, inadequate recovery and absent evidence", () => {
  for (const change of [s => s.surprise = true, s => s.approvalId = "bad", s => s.host.maxReplicas = 2,
    s => s.host.maxDeployments = 2, s => s.host.maxRestartsPerDeployment = 2,
    s => s.host.recoverySeconds = 61, s => s.host.supervisorLookupRetries = 4, s => s.workers[0].pollSeconds = 29,
    s => s.workers[0].maxPolls = 1, s => s.workers[0].bootIds[1] = s.workers[0].bootIds[0],
    s => s.notifications.ticks = 4097, s => s.notifications.pollSeconds = 21,
    s => s.notifications.push = "true", s => s.evidence.host = join(source, "absent"),
    s => s.until = "2026-12-01T00:00:00.000Z", s => s.until = new Date(now - 1).toISOString(),
    s => s.publicKeySpkiBase64 = key]) {
    const s = spec(); change(s); assert.throws(() => plan(s));
  }
});

test("PTT plans need a funded spare and use their exact native cadence and finite fleet limits", () => {
  const s = spec(); s.host.maxRestartsPerDeployment = 1;
  s.workers = [{kind: "ptt", workerId: randomUUID(), poolPermitId: randomUUID(), bootIds: [randomUUID(), randomUUID()],
    maxPolls: 400, pollSeconds: 10, busySeconds: 30, retrySeconds: 60, restartSeconds: 60}];
  const p = plan(s);
  assert.equal(p.workers[0].maxActions, 802);
  assert.equal(p.runtime.ERP_COMM_PTT_WORKER_ID, s.workers[0].workerId);
  assert.match(renderEnrollmentSql(p), /ptt_worker_fleet/);
  const bad = structuredClone(s); bad.host.maxRestartsPerDeployment = 0; bad.workers[0].bootIds.pop();
  assert.throws(() => plan(bad));
});

test("SQL consumes only authentic preissued permits and leaves protected approval/evidence/capacity creation to their owners", () => {
  const p = plan(), sql = renderEnrollmentSql(p);
  for (const name of ["approval", "authority", "proof", "meter", "capacity", "reservation", "unit_hold"]) {
    assert.doesNotMatch(sql, new RegExp(`insert into erp_comm_cost\\.${name}\\b`, "i"));
  }
  assert.doesNotMatch(sql, /\bgrant\s|set_config\('request\.jwt|set role|budget\.approve/i);
  assert.match(sql, /a\.owner_auth_id=au\.owner_auth_id/);
  assert.match(sql, /a\.max_micros<=5000000/);
  assert.match(sql, /a\.revoked_at is null/);
  assert.match(sql, /funded_worker_registration_probes/);
  assert.match(sql, /funded_worker_delivery_lookups/);
  assert.match(sql, /worker_lookup_plan/);
  assert.match(sql, /permanent_ledger_bytes/);
  assert.match(sql, /budget\.fundControl/);
  assert.match(sql, /worker_launch_ticket/);
  assert.match(sql, /chat_stage_boot/);
  assert.match(sql, /commit;/);
  assert.doesNotMatch(sql, /notification_start_scheduler/);
});

test("default production mode verifies exact already-enrolled pools and does not enroll or consume them twice",()=>{
  const s=spec();delete s.poolsAlreadyEnrolled;s.workers[0].poolValidUntil=new Date(now+3660000).toISOString();s.workers[0].poolMaxActions=600;
  const p=plan(s),sql=renderEnrollmentSql(p);
  assert.equal(p.spec.poolsAlreadyEnrolled,true);assert.equal(p.workers[0].maxActions,600);
  assert.doesNotMatch(sql,/insert into erp_comm_cost\.control_pool/);assert.match(sql,/r\.consumed_at is not null/);
  assert.match(sql,/cp\.max_actions=600/);assert.equal(p.workers[0].command.endEpoch,Math.round((now+3660000)/1000));
});

test("issuer prepares private publication only after committed debit, with exact receipt and no delivery or fabricated published claim", async () => {
  const p = plan(), journal = join(source, randomUUID()); let debits = 0;
  const result = await issuePlannedBoot(p, p.spec.workers[0].bootIds[0], key, journal, {
    debit() {debits++; return receipt(p);}, send() {throw Error("issuer must not contact runtime");},
  });
  assert.equal(debits, 1);
  assert.equal(result.state, "signed-unpublished");
  const sql = readFileSync(result.publishSqlPath, "utf8");
  assert.match(sql, /insert into erp_comm_cost\.worker_signed_delivery\(boot,token,receipt_sha256\)/);
  assert.doesNotMatch(sql, /budget\.approve|private.key|grant\s/i);
  const journalData = JSON.parse(readFileSync(join(journal, p.spec.workers[0].bootIds[0] + ".json")));
  assert.equal(journalData.receipt.boot, p.spec.workers[0].bootIds[0]);
  assert.equal(journalData.state, "signed-unpublished");
  await assert.rejects(issuePlannedBoot(p, p.spec.workers[0].bootIds[0], key, journal, {debit() {debits++;}}));
  assert.equal(debits, 1);
});

test("signs exact supervisor bounds only after every planned boot has a committed matching receipt; manifest generation makes no DB calls", async () => {
  const p=plan(), out=join(source,randomUUID()), adapters={verifyPrivateDirectory:()=>true,verifyPrivateFile:()=>true};
  mkdirSync(out);
  assert.throws(()=>createSupervisorManifest(p,key,out,adapters));
  for (const w of p.spec.workers) for (const boot of w.bootIds) await issuePlannedBoot(p,boot,key,out,{debit:()=>receipt(p,w,boot)});
  const result=createSupervisorManifest(p,key,out,adapters);
  assert.equal(result.state,"manifest-prepared-not-installed");
  const token=readFileSync(result.manifestPath,"utf8").trim().split("=")[1];
  const [body,signature]=token.split(".").map(value=>Buffer.from(value,"base64url"));
  assert.ok(verify(null,body,publicKey,signature));
  const m=JSON.parse(body.toString());
  assert.equal(m.planHash,p.planHash); assert.equal(m.deploymentId,p.spec.deploymentId);
  assert.equal(m.maxPhysicalStarts,4); assert.equal(m.workers[0].maxLookups,16);
  assert.equal(m.workers[0].quarantineSeconds,165); assert.deepEqual(m.workers[0].boots,p.spec.workers[0].bootIds);
  const changed=join(out,p.spec.workers[0].bootIds[0]+".json"), journal=JSON.parse(readFileSync(changed,"utf8"));
  journal.state="discarded-unconfirmed";writeFileSync(changed,JSON.stringify(journal));
  assert.throws(()=>createSupervisorManifest(p,key,out,adapters),/changed|Missing/);
});

test("prepares bounded private post-deployment redelivery SQL against its pre-funded dedicated pool and retirement tail",async()=>{
  const s=spec();s.host.supervisorLookupRetries=1;s.supervisorDelivery={poolPermitId:randomUUID(),planId:randomUUID(),cadenceSeconds:20,maxActions:183,retireBy:new Date(now+3625000).toISOString()};
  const p=plan(s),out=join(source,randomUUID()),adapters={verifyPrivateDirectory:()=>true,verifyPrivateFile:()=>true};mkdirSync(out);
  for(const w of p.spec.workers)for(const boot of w.bootIds)await issuePlannedBoot(p,boot,key,out,{debit:()=>receipt(p,w,boot)});
  const result=createSupervisorManifest(p,key,out,adapters),sql=readFileSync(result.deliverySqlPath,"utf8");
  assert.match(sql,/insert into erp_comm_cost\.supervisor_delivery_plan/);assert.match(sql,/start_supervisor_delivery/);
  assert.match(sql,new RegExp(s.supervisorDelivery.poolPermitId));assert.doesNotMatch(sql,/create extension|grant\s|insert into erp_comm_cost\.approval/);
  const bad=structuredClone(s);bad.supervisorDelivery.retireBy=s.until;assert.throws(()=>plan(bad),/retirement tail/);
});

test("bundle review detects edited SQL, configuration, source evidence and plan hashes", () => {
  const p = plan(), out = join(source, randomUUID());
  writePlanBundle(p, out);
  assert.equal(readPlanBundle(out).planHash, p.planHash);
  const sql = join(out, "enroll.sql"), original = readFileSync(sql);
  writeFileSync(sql, "select 1;"); assert.throws(() => readPlanBundle(out), /changed|hash/i);
  writeFileSync(sql, original);
  const evidence = p.evidence.host.path, evidenceOriginal = readFileSync(evidence);
  writeFileSync(evidence, "changed"); assert.throws(() => readPlanBundle(out), /changed|hash/i);
  writeFileSync(evidence, evidenceOriginal);
  const json = join(out, "plan.json"), data = JSON.parse(readFileSync(json, "utf8"));
  data.spec.workers[0].maxPolls++; writeFileSync(json, JSON.stringify(data));
  assert.throws(() => readPlanBundle(out), /changed|hash/i);
});

test("startup debits once, validates every field and signs the exact committed receipt without retries", async () => {
  const p = plan(), calls = [], journal = join(source, randomUUID());
  await deliverPlannedBoot(p, p.spec.workers[0].bootIds[0], key, journal, {
    debit(boot, attempt) { calls.push("debit"); assert.ok(existsSync(join(journal, boot + ".json"))); assert.match(attempt, /^[a-f0-9-]{36}$/); return receipt(p); },
    async send(url, init) {
      calls.push("send"); assert.equal(url, "https://erp.algt.net/api/internal/communications/worker-launch");
      const [body, sig] = init.headers.Authorization.slice(7).split(".").map(s => Buffer.from(s, "base64url"));
      assert.equal(body.toString(), receipt(p)); assert.ok(verify(null, body, publicKey, sig)); return {status: 204};
    },
  });
  assert.deepEqual(calls, ["debit", "send"]);
  assert.equal(JSON.parse(readFileSync(join(journal, p.spec.workers[0].bootIds[0] + ".json"))).state, "registration-confirmed");
  await assert.rejects(deliverPlannedBoot(p, p.spec.workers[0].bootIds[0], key, journal, {debit() {throw Error("must not retry");}}));
});

test("wrong public key, unplanned boot and mutated plan stop before debit", async () => {
  const p = plan(); let debits = 0;
  const io = {debit() {debits++;}};
  const other = generateKeyPairSync("ed25519").privateKey.export({format: "pem", type: "pkcs8"});
  await assert.rejects(deliverPlannedBoot(p, p.spec.workers[0].bootIds[0], other, join(source, randomUUID()), io));
  await assert.rejects(deliverPlannedBoot(p, randomUUID(), key, join(source, randomUUID()), io));
  p.spec.workers[0].maxPolls++;
  await assert.rejects(deliverPlannedBoot(p, p.spec.workers[0].bootIds[0], key, join(source, randomUUID()), io));
  assert.equal(debits, 0);
});

test("missing or rejected Windows ACL custody fails before any debit or receipt/publication write", async () => {
  const p = plan(); let debits = 0;
  await assert.rejects(realIssue(p, p.spec.workers[0].bootIds[0], key, join(source, randomUUID()), {debit() {debits++;}}));
  const out = join(source, randomUUID()); mkdirSync(out);
  await assert.rejects(realIssue(p, p.spec.workers[0].bootIds[0], key, out, {verifyPrivateDirectory: () => false, debit() {debits++;}}), /Protected/);
  assert.equal(debits, 0); assert.equal(existsSync(join(out, p.spec.workers[0].bootIds[0] + ".json")), false);
});

test("ambiguous debit/response and overbroad, cross-deployment or fabricated receipts are discarded without retry", async () => {
  for (const alter of [g => g.deploymentId = randomUUID(), g => g.maxPolls++, g => g.until = new Date(now + 7200000).toISOString(),
    g => g.prepaidProbes++, g => g.extra = 1, g => g.worker = randomUUID(), g => g.evidenceId = "invented"]) {
    const p = plan(); let sends = 0;
    await assert.rejects(deliverPlannedBoot(p, p.spec.workers[0].bootIds[0], key, join(source, randomUUID()), {
      debit() {const g = JSON.parse(receipt(p)); alter(g); return JSON.stringify(g);}, send() {sends++;},
    })); assert.equal(sends, 0);
  }
  for (const mode of ["debit-lost", "response-lost", "rejected"]) {
    const p = plan(), journal = join(source, randomUUID()); let debits = 0, sends = 0;
    const io = {debit() {debits++; if (mode === "debit-lost") throw Error("lost"); return receipt(p);},
      async send() {sends++; if (mode === "response-lost") throw Error("lost"); return {status: 503};}};
    await assert.rejects(deliverPlannedBoot(p, p.spec.workers[0].bootIds[0], key, journal, io));
    await assert.rejects(deliverPlannedBoot(p, p.spec.workers[0].bootIds[0], key, journal, io));
    assert.equal(debits, 1); assert.equal(sends, mode === "debit-lost" ? 0 : 1);
    assert.equal(JSON.parse(readFileSync(join(journal, p.spec.workers[0].bootIds[0] + ".json"))).state, "discarded-unconfirmed");
  }
});
