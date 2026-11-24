/** Operator tool. `prepare`/`review` are offline. `issue`/`deliver` explicitly spend one existing SQL delivery.
 * No owner approval, proof, price, capacity, reservation, grant, provider or host configuration is created here.
 */
import { execFileSync } from "node:child_process";
import { createHash, createPrivateKey, createPublicKey, randomUUID, sign, verify } from "node:crypto";
import { closeSync, fsyncSync, ftruncateSync, mkdirSync, openSync, readFileSync, realpathSync, statSync, writeFileSync, writeSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launch } from "./launch-communication-worker.mjs";

export const PILOT_END = "2026-11-30T19:59:00.000Z";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const artifacts = ["enroll.sql", "notification-start.sql", "runtime.env", "review.md"];
const canonical = value => JSON.stringify(value, function (_key, item) {
  return item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(k => [k, item[k]])) : item;
});
const hash = value => createHash("sha256").update(value).digest("hex");
const textHash = value => hash(canonical(value));
const sql = value => "'" + String(value).replaceAll("'", "''") + "'";
const check = (condition, message) => { if (!condition) throw Error(message); };
function object(value, keys, name, optional = []) {
  check(value && typeof value === "object" && !Array.isArray(value), `Invalid ${name}`);
  check(Object.keys(value).every(k => keys.includes(k) || optional.includes(k)) && keys.every(k => Object.hasOwn(value, k)), `Unexpected or missing ${name} fields`);
}
function integer(value, min, max, name) { check(Number.isSafeInteger(value) && value >= min && value <= max, `Invalid ${name}`); }
function identifier(value, name) { check(typeof value === "string" && uuid.test(value), `Invalid ${name}`); }
function instant(value, name) {
  check(typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)), `Invalid ${name}`);
  check(new Date(Date.parse(value)).toISOString() === value.replace(/(?<!\.\d{3})Z$/, ".000Z"), `Nonexistent ${name}`);
  return Date.parse(value);
}
function publicKey(value) {
  check(typeof value === "string" && value.length <= 256 && Buffer.from(value, "base64").toString("base64") === value, "Invalid public key");
  const key = createPublicKey({key: Buffer.from(value, "base64"), format: "der", type: "spki"});
  check(key.asymmetricKeyType === "ed25519", "Issuer public key must be Ed25519");
  return key;
}

export function preparePlan(input, {now = Date.now()} = {}) {
  const s = structuredClone(input);
  object(s, ["v", "approvalId", "deploymentId", "notBefore", "until", "publicKeySpkiBase64", "evidence", "host", "workers"], "spec", ["notifications","poolsAlreadyEnrolled","supervisorDelivery"]);
  s.poolsAlreadyEnrolled??=true;check(typeof s.poolsAlreadyEnrolled==="boolean","Explicit pool enrollment mode required");
  check(s.v === 1, "Unsupported spec version");
  identifier(s.approvalId, "approval"); identifier(s.deploymentId, "deployment"); publicKey(s.publicKeySpkiBase64);
  s.approvalId = s.approvalId.toLowerCase(); s.deploymentId = s.deploymentId.toLowerCase();
  const start = instant(s.notBefore, "notBefore"), end = instant(s.until, "until");
  check(end > now + 120000 && start < end && end - start <= 86400000 && end <= Date.parse(PILOT_END), "Invalid or expired finite pilot window");
  s.notBefore = new Date(start).toISOString(); s.until = new Date(end).toISOString();
  object(s.host, ["maxReplicas", "maxRestartsPerDeployment", "maxDeployments", "recoverySeconds", "supervisorLookupRetries"], "host");
  check(s.host.maxReplicas === 1 && s.host.maxDeployments === 1, "Only one existing replica and one deployment are supported");
  integer(s.host.maxRestartsPerDeployment, 1, 15, "host restart bound");
  integer(s.host.recoverySeconds, 1, 3600, "measured recovery seconds");
  integer(s.host.supervisorLookupRetries, 0, 3, "supervisor lookup retries");
  object(s.evidence, ["host", "retention", "recovery", "fleet"], "evidence");
  const evidence = {};
  for (const [name, path] of Object.entries(s.evidence)) {
    check(typeof path === "string" && isAbsolute(path), `Absolute ${name} evidence path required`);
    const bytes = readFileSync(path);
    check(bytes.length > 0 && bytes.length <= 10 * 1024 * 1024, `Invalid ${name} evidence file`);
    evidence[name] = {path: resolve(path), sha256: hash(bytes), reference: "sha256:" + hash(bytes)};
    s.evidence[name] = resolve(path);
  }
  check(Array.isArray(s.workers) && s.workers.length >= 1 && s.workers.length <= 2, "One or two explicit workers required");
  const ids = new Set(), kinds = new Set();
  const reserveIdentifier = (value, name) => { identifier(value, name); check(!ids.has(value.toLowerCase()), `Repeated ${name}`); ids.add(value.toLowerCase()); return value.toLowerCase(); };
  const starts = s.host.maxReplicas * (1 + s.host.maxRestartsPerDeployment) * s.host.maxDeployments;
  const runtime = {ERP_COMM_WORKER_BOOT_PUBLIC_KEY: s.publicKeySpkiBase64,
    ERP_COMM_WORKER_SUPERVISOR_ENABLED: "true", ERP_COMM_WORKER_SUPERVISOR_UNTIL: s.until};
  const workers = s.workers.map(w => {
    const chat = w.kind === "chat_stage";
    check(chat || w.kind === "ptt", "Unsupported worker kind");
    object(w, ["kind", "workerId", "poolPermitId", "bootIds", "maxPolls", "pollSeconds", "busySeconds", "retrySeconds", "restartSeconds", ...(chat ? ["registrationSeconds"] : [])], "worker",["poolValidUntil","poolMaxActions"]);
    check(!kinds.has(w.kind), "Repeated worker kind"); kinds.add(w.kind);
    w.workerId = reserveIdentifier(w.workerId, "worker ID"); w.poolPermitId = reserveIdentifier(w.poolPermitId, "pool permit");
    check(Array.isArray(w.bootIds) && w.bootIds.length === starts && w.bootIds.length >= (chat ? 4 : 2), "Every physical start needs a unique prepaid boot; chat needs three spares");
    w.bootIds = w.bootIds.map(id => reserveIdentifier(id, "boot ID"));
    integer(w.pollSeconds, chat ? 30 : 1, chat ? 30 : 3600, "native cadence");
    integer(w.busySeconds, chat ? 70 : 30, 3600, "busy seconds");
    integer(w.retrySeconds, chat ? 180 : 60, 3600, "retry seconds");
    integer(w.restartSeconds, s.host.recoverySeconds, 3600, "recovery allowance");
    if (chat) integer(w.registrationSeconds, 5, 60, "registration seconds");
    integer(w.maxPolls, Math.ceil((end - start) / (w.pollSeconds * 1000)) + 4, 1000000, "poll allowance with shutdown margin");
    const requiredActions = starts * (w.maxPolls + 1);
    w.poolMaxActions??=requiredActions;integer(w.poolMaxActions,requiredActions,2147483647,"funded pool actions");
    w.poolValidUntil??=s.until;
    const poolEnd=instant(w.poolValidUntil,"funded pool cutoff");check(poolEnd>=end && poolEnd<=Date.parse(PILOT_END),"Pool cutoff does not cover worker window");
    w.poolValidUntil=new Date(poolEnd).toISOString();
    const maxActions=w.poolMaxActions;
    const maxLookups = starts * w.bootIds.length * (1 + s.host.supervisorLookupRetries);
    integer(maxActions, 1, 2147483647, "control action bound");
    const minimumLedgerBytes = String(65536 + 32768 * (maxActions + maxLookups + 2 * w.bootIds.length));
    const prefix = chat ? "ERP_COMM_CHAT_STAGE" : "ERP_COMM_PTT";
    runtime[chat ? prefix + "_CLEANUP_WORKER_ID" : prefix + "_WORKER_ID"] = w.workerId;
    runtime[prefix + "_CLEANUP_ENABLED"] = "true";
    runtime[prefix + "_BOOT_IDS"] = JSON.stringify(w.bootIds);
    runtime[prefix + "_LOOKUP_RETRIES"] = String(s.host.supervisorLookupRetries);
    runtime[prefix + "_RECOVERY_WAIT_SECONDS"] = String(srcQuarantine(w));
    return {kind: w.kind, poolPermitId: w.poolPermitId, maxActions, maxLookups, minimumLedgerBytes, prepaidProbes: starts,
      evidenceId: evidence.host.reference + "/" + w.kind,
      command: {op: "budget.fundControl", kind: chat ? "chat_stage_poll" : "ptt_worker_poll", subject: w.workerId, maxActions, endEpoch: Math.round(poolEnd / 1000)}};
  });
  if (s.notifications) {
    object(s.notifications, ["poolPermitId", "ticks", "pollSeconds", "calendar", "push"], "notifications");
    s.notifications.poolPermitId = reserveIdentifier(s.notifications.poolPermitId, "notification permit"); integer(s.notifications.ticks, 1, 4096, "notification ticks");
    integer(s.notifications.pollSeconds, 1, 20, "notification cadence");
    check(typeof s.notifications.calendar === "boolean" && typeof s.notifications.push === "boolean", "Explicit notification booleans required");
    runtime.ERP_COMM_NOTIFICATION_SCHEDULER_ENABLED = "true";
  }
  if(s.supervisorDelivery) {
    check(s.host.supervisorLookupRetries>=1,"Post-deployment recovery requires at least one funded lookup retry");
    const d=s.supervisorDelivery;object(d,["poolPermitId","planId","cadenceSeconds","maxActions","retireBy"],"supervisor delivery",["maxClaimsPerProcess"]);
    d.maxClaimsPerProcess??=3;integer(d.maxClaimsPerProcess,1,3,"funded private manifest claims per process");
    reserveIdentifier(d.poolPermitId,"supervisor delivery permit");identifier(d.planId,"supervisor delivery plan");
    integer(d.cadenceSeconds,10,30,"supervisor delivery cadence");
    integer(d.maxActions,Math.ceil((end-start)/(d.cadenceSeconds*1000))+2,4096,"prepaid delivery and retirement actions");
    const retire=instant(d.retireBy,"supervisor retirement cutoff");
    check(retire>=end+(d.cadenceSeconds+5)*1000 && retire<=Date.parse(PILOT_END),"Delivery retirement tail must fit its original funded cutoff");
    d.retireBy=new Date(retire).toISOString();
  }
  const p = {v: 1, state: "prepared-not-applied", preparedAt: new Date(now).toISOString(), pilotEnd: PILOT_END, spec: s, evidence, workers, runtime};
  return {...p, planHash: textHash(p)};
}

function srcQuarantine(worker) {
  return worker.busySeconds + worker.pollSeconds + worker.restartSeconds + (worker.registrationSeconds ?? 0);
}

function validatePlan(p) {
  let again;
  try{again=preparePlan(p.spec,{now:instant(p.preparedAt,"preparedAt")});}catch{throw Error("Plan or source evidence changed; prepare and review a new plan");}
  check(again.planHash === p.planHash && textHash({...p, planHash: undefined}) === p.planHash, "Plan or source evidence changed; prepare and review a new plan");
}
function poolGuard(p, permit, kind, subject, actions, ledger, extraUnits = []) {
  const feature = kind === "chat_stage_poll" ? "media_upload" : kind === "ptt_worker_poll" ? "ptt_live" : "push";
  const requiredDimensions = kind === "chat_stage_poll" ? ["railway", "database", "storage"] : kind === "ptt_worker_poll" ? ["railway", "database", "sfu_turn"] : ["railway", "database", "fcm"];
  const poolSpec=p.spec.workers.find(w=>w.poolPermitId===permit),poolEnd=poolSpec?.poolValidUntil??p.spec.until;
  const consumed=p.spec.poolsAlreadyEnrolled
    ? `r.consumed_at is not null and exists(select from erp_comm_cost.control_pool cp where cp.permit_id=r.permit_id and cp.enabled and cp.used=0 and cp.kind=${sql(kind)} and cp.subject=${sql(subject)} and cp.max_actions=${actions} and cp.valid_until=${sql(poolEnd)}::timestamptz and cp.poll_seconds=${poolSpec?.pollSeconds??p.spec.notifications?.pollSeconds})`
    : "r.consumed_at is null and r.expires_at>clock_timestamp()";
  return `
  if not exists(select from erp_comm_cost.reservation r join erp_comm_cost.proof q using(operation_id)
    where r.permit_id=${sql(permit)}::uuid and r.approval_id=${sql(p.spec.approvalId)}::uuid and q.approval_id=r.approval_id
    and r.scope='communications' and r.feature=${sql(feature)} and ${consumed} and r.settled_at is null
    and r.reserved_micros>=greatest(r.floor_micros,(select coalesce(sum(price.upper_micros),0) from erp_comm_cost.meter price where price.operation_id=q.operation_id))
    and r.command_hash=sha256(convert_to(jsonb_build_object('op','budget.fundControl','kind',${sql(kind)},'subject',${sql(subject)},'maxActions',${actions},'endEpoch',${Math.round(Date.parse(poolEnd) / 1000)}::bigint)::text,'UTF8'))
    and q.valid_until>clock_timestamp() and q.operational_stop_by>=${sql(p.spec.until)}::timestamptz
    and length(trim(q.retained_at_zero_cost_evidence))>0 and length(trim(q.shutdown_evidence))>0
    and not exists(select from erp_comm_cost.pause z where z.scope=r.scope and z.feature=r.feature)
    and not exists(select from unnest(array[${requiredDimensions.map(sql).join(",")}]) dim where not exists(
      select from erp_comm_cost.meter m where m.operation_id=q.operation_id and m.dimension=dim))
    and not exists(select from erp_comm_cost.meter m join erp_comm_cost.capacity c on c.id=m.capacity_id
      left join erp_comm_cost.unit_hold h on h.permit_id=r.permit_id and h.capacity_id=c.id
      where m.operation_id=q.operation_id and (not m.complete or m.observed_at>clock_timestamp() or m.observed_at<clock_timestamp()-q.max_meter_age
        or m.valid_until<=clock_timestamp() or m.covered_until<${sql(p.spec.until)}::timestamptz or not c.enabled or c.dimension<>m.dimension
        or c.valid_from>clock_timestamp() or c.valid_until<${sql(p.spec.until)}::timestamptz or coalesce(h.units,0)<m.upper_units
        or (select coalesce(sum(total.units),0) from erp_comm_cost.unit_hold total where total.capacity_id=c.id)>c.available_units))
  ) then raise exception 'Authentic fresh preissued ${kind} permit unavailable'; end if;
  ${[["funded_" + kind + "_actions", actions, "database"], ["permanent_ledger_bytes", ledger, "database"], ...extraUnits].map(([unit, units, dimension]) => `if not exists(select from erp_comm_cost.unit_hold h join erp_comm_cost.capacity c on c.id=h.capacity_id
    where h.permit_id=${sql(permit)}::uuid and c.unit=${sql(unit)} and c.dimension=${sql(dimension)} and c.enabled
      and c.valid_from<=clock_timestamp() and c.valid_until>=${sql(p.spec.until)}::timestamptz and h.units>=${units})
    then raise exception 'Missing pre-funded ${dimension}/${unit}'; end if;`).join("\n  ")}`;
}

export function renderEnrollmentSql(p) {
  validatePlan(p);
  const s = p.spec;
  const guards = p.workers.map(w => poolGuard(p, w.poolPermitId, w.command.kind, w.command.subject, w.maxActions, w.minimumLedgerBytes,
    ["railway", "database"].flatMap(d => [["funded_worker_registration_probes", w.prepaidProbes, d], ["funded_worker_delivery_lookups", w.maxLookups, d]])));
  if (s.notifications) guards.push(poolGuard(p, s.notifications.poolPermitId, "notification_tick", "mobile-notifications", s.notifications.ticks + 1,
    65536 + 32768 * (s.notifications.ticks + 1)));
  const rows = p.workers.map((w, i) => {
    const src = s.workers[i], chat = w.kind === "chat_stage";
    return `
${s.poolsAlreadyEnrolled?"-- Exact pre-enrolled funded control pool verified above.":`insert into erp_comm_cost.control_pool(permit_id,kind,subject,max_actions,valid_until,continuing_zero_evidence,poll_seconds,enabled)
 values(${sql(w.poolPermitId)}::uuid,${sql(w.command.kind)},${sql(src.workerId)},${w.maxActions},${sql(src.poolValidUntil)},${sql(p.evidence.retention.reference)},${src.pollSeconds},true);`}
insert into erp_comm_cost.worker_probe_plan(pool,max_replicas,max_restarts_per_deployment,max_deployments,valid_until,evidence_id,frozen_host_evidence,recovery_seconds,recovery_evidence)
 values(${sql(w.poolPermitId)},1,${s.host.maxRestartsPerDeployment},1,${sql(s.until)},${sql(w.evidenceId)},${sql(p.evidence.host.reference)},${s.host.recoverySeconds},${sql(p.evidence.recovery.reference)});
insert into erp_comm_cost.worker_lookup_plan(pool,max_lookups,valid_until,evidence_id)
 values(${sql(w.poolPermitId)},${w.maxLookups},${sql(s.until)},${sql(w.evidenceId)});
insert into erp_comm_cost.${chat ? "chat_stage_fleet" : "ptt_worker_fleet"}(singleton,max_instances,max_boots,${chat ? "busy_seconds,retry_seconds,registration_seconds,restart_seconds,valid_until,enabled,external_boot_and_retention_evidence" : "busy_tick_seconds,restart_seconds,valid_until,enabled,bounded_fleet_evidence,retry_seconds"})
 values(true,1,${w.prepaidProbes},${chat ? `${src.busySeconds},${src.retrySeconds},${src.registrationSeconds},${src.restartSeconds},${sql(s.until)},true,${sql(p.evidence.fleet.reference)}` : `${src.busySeconds},${src.restartSeconds},${sql(s.until)},true,${sql(p.evidence.fleet.reference)},${src.retrySeconds}`});
${src.bootIds.map(boot => `insert into erp_comm_cost.worker_launch_ticket(boot,pool,deployment_id,not_before,register_by,until_at,poll_limit)
 values(${sql(boot)},${sql(w.poolPermitId)},${sql(s.deploymentId)},${sql(s.notBefore)},${sql(s.until)},${sql(s.until)},${src.maxPolls});
${chat ? `insert into erp_comm_cost.chat_stage_boot(boot,worker,pool,until_at,poll_limit) values(${sql(boot)},${sql(src.workerId)},${sql(w.poolPermitId)},${sql(s.until)},${src.maxPolls});` : ""}`).join("\n")}`;
  });
  if (s.notifications && !s.poolsAlreadyEnrolled) rows.push(`insert into erp_comm_cost.control_pool(permit_id,kind,subject,max_actions,valid_until,continuing_zero_evidence,poll_seconds,enabled)
 values(${sql(s.notifications.poolPermitId)},'notification_tick','mobile-notifications',${s.notifications.ticks + 1},${sql(s.until)},${sql(p.evidence.retention.reference)},${s.notifications.pollSeconds},true);`);
  return `-- PREPARED ONLY; plan ${p.planHash}. Private designated operator; no new grants.
-- Requires reviewed lookup/signed-delivery hooks. Existing singleton fleets/pools deliberately conflict: no replacement/upsert.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
do $pilot$
begin
  perform 1 from erp_comm_cost.authority where singleton for update;
  if not exists(select from erp_comm_cost.approval a join erp_comm_cost.authority au on a.owner_auth_id=au.owner_auth_id
    join public.user_profiles u on u.auth_user_id=au.owner_auth_id
    where au.singleton and length(trim(au.owner_binding_evidence))>0 and u.status='active' and not u.must_change_password
      and a.id=${sql(s.approvalId)}::uuid and a.scope='communications' and a.currency='USD' and a.max_micros>0 and a.max_micros<=5000000
      and a.revoked_at is null and a.approved_at<=clock_timestamp() and a.ends_at>=${sql(s.until)}::timestamptz
      and a.ends_at<=${sql(PILOT_END)}::timestamptz
      and array[${[...new Set(p.workers.map(w => w.command.kind === "chat_stage_poll" ? "media_upload" : "ptt_live").concat(s.notifications ? ["push"] : []))].map(sql).join(",")}]::erp_comm_cost.feature[] <@ a.features)
    then raise exception 'Owner-authenticated pilot approval missing or out of bounds'; end if;
  ${guards.join("\n")}
end $pilot$;
${rows.join("\n")}
commit;
-- Capture psql exit status/output privately; this file does not attest execution or provider/host measurements.
`;
}

function notificationStartSql(p) {
  if (!p.spec.notifications) return "-- No notification scheduler requested.\n";
  const n = p.spec.notifications;
  return `-- SEPARATE ACTIVATION: review only. This calls the existing finite scheduler and can contact ERP/FCM.
-- Execute only after runtime configuration, funding, vault secret, hook and bounded host checks pass.
select erp_private.notification_start_scheduler(${sql(n.poolPermitId)}::uuid,${sql(p.spec.until)}::timestamptz,${n.ticks},${n.calendar},${n.push});
-- A returned UUID is a run identifier, not delivery proof. Null means no confirmed queued run.
`;
}
function filesFor(p) {
  const files={"enroll.sql": renderEnrollmentSql(p), "notification-start.sql": notificationStartSql(p),
    "runtime.env": Object.entries(p.runtime).map(([k, v]) => `${k}=${v}`).join("\n") + "\n",
    "review.md": `# Finite communication pilot plan\n\nState: prepared, not applied. Plan SHA-256: ${p.planHash}.\n\nDeployment: ${p.spec.deploymentId}. Until: ${p.spec.until}. Overall ceiling: USD 5 through ${PILOT_END}.\n\nThe configuration is a proposal for the existing Railway service. RAILWAY_DEPLOYMENT_ID must be supplied by Railway and must match; never set it manually. No new service, subscription or host is authorized. No user-facing communication feature flags are enabled here.\n\nInput evidence files are hashed for review, not certified by this utility. A reviewer must establish actual physical host bounds, provider prices, allocated retained bytes, stale-evidence cutoffs, crash recovery and cleanup capacity before enrollment. Never label synthetic measurements as operating evidence.\n\n${p.workers.map(w => `${w.kind}: ${w.prepaidProbes} unique boots, ${w.maxActions} control actions, ${w.maxLookups} lookup attempts in each of railway/database, at least ${w.minimumLedgerBytes} permanent ledger bytes.\n`).join("\n")}\nThe exact budget.fundControl commands are in plan.json. Reserve via the existing authenticated/verified owner and budget paths. This tool never creates proof, meters, capacity, holds, reservations or approvals. All permits must already be funded; enrollment rejects mismatches.\n\nRequired installed hooks: private worker_lookup_plan and worker_signed_delivery; private take_supervised_worker_delivery; explicit-boot consume-only erp_comm_worker_boot_delivery RPC; finite in-process supervisor with non-overlapping per-boot health lifecycle, no app issuer key, no repeat after ambiguous lookup. Every lookup, miss, retry and physical restart must fit the held lookup envelope.\n\nAfter reviewing/applying exact enrollment SQL separately, issue each planned boot once with issue. Use a pre-existing protected Windows directory permitting only the current SID and SYSTEM; the CLI validates directory/file ACLs before writing private receipts. Its publish SQL is bearer material. Apply that exact SQL separately and keep SQL exit/output receipts. After every boot has its committed receipt, use manifest to create the private signed supervisor configuration. The runtime makes zero lookups without that signature and exact matching env. Installing a manifest must preserve the exact deployment it authorizes; an env update that changes deployment ID invalidates it. Only after runtime commissioning and real bounds have been verified should feature admission gates be considered. Browser/device acceptance remains pending.\n\nnotification-start.sql is separate, effectful activation. No automatic recurring cron or automatic re-enrollment is created. Retain history and attachments; stop admission at the approved deadline/quota/evidence failure and honor prepaid drain obligations.\n`};
  files["review.md"]+="\nPost-deployment delivery: use publish-manifest with a funded supervisorDelivery specification after the actual stable Railway deployment ID is known. It emits private SQL for the exact capped pg_cron/net redelivery plan and fixed supervisor-launch POST; no env-manifest redeployment is needed. Preparation itself installs no job. Separately applying that reviewed SQL prepays retirement, installs only the bounded original-period redelivery, and never renews its pool or deadline.\n";
  return files;
}

export function writePlanBundle(p, directory) {
  validatePlan(p); const out = resolve(directory); mkdirSync(out, {recursive: true, mode: 0o700});
  const files = filesFor(p), hashes = Object.fromEntries(Object.entries(files).map(([name, contents]) => [name, hash(contents)]));
  for (const [name, contents] of Object.entries({...files, "plan.json": JSON.stringify(p, null, 2) + "\n", "bundle.json": JSON.stringify({planHash: p.planHash, files: hashes}, null, 2) + "\n"})) {
    writeFileSync(join(out, name), contents, {flag: "wx", mode: 0o600});
  }
  return out;
}
export function readPlanBundle(directory) {
  const out = resolve(directory), p = JSON.parse(readFileSync(join(out, "plan.json"), "utf8")); validatePlan(p);
  const manifest = JSON.parse(readFileSync(join(out, "bundle.json"), "utf8")), expected = filesFor(p);
  check(manifest.planHash === p.planHash, "Bundle plan hash changed");
  for (const name of artifacts) check(hash(readFileSync(join(out, name))) === manifest.files[name] && hash(expected[name]) === manifest.files[name], `Artifact hash changed: ${name}`);
  return p;
}

// Uses only the existing private libpq service/password-file setup. Never accepts or prints a connection string.
function debit(boot, attempt) {
  return execFileSync("psql", ["-X", "-qAt", "-w", "-v", "ON_ERROR_STOP=1", "-c",
    `select erp_comm_cost.take_worker_delivery('${boot}'::uuid,'${attempt}'::uuid)::text`],
  {encoding: "utf8", timeout: 5000, maxBuffer: 8192, stdio: ["ignore", "pipe", "ignore"]}).trim();
}
function supervisedDebit(boot, attempt) {
  return execFileSync("psql", ["-X", "-qAt", "-w", "-v", "ON_ERROR_STOP=1", "-c",
    `select erp_comm_cost.take_supervised_worker_delivery('${boot}'::uuid,'${attempt}'::uuid)::text`],
  {encoding: "utf8", timeout: 5000, maxBuffer: 8192, stdio: ["ignore", "pipe", "ignore"]}).trim();
}

/** Effectful commands require pre-existing private Windows custody. mode 0600 is not a Windows DACL.
 * Tests may explicitly supply nonsecret path-verification adapters; the CLI has no bypass flag.
 */
export function assertProtectedWindowsPath(path, directory = true) {
  check(process.platform === "win32", "Protected Windows ACL verification is required");
  const target = resolve(path);
  check(realpathSync(target).toLowerCase() === target.toLowerCase() && statSync(target).isDirectory() === directory, "Protected path must exist without a junction or symbolic link");
  const literal = target.replaceAll("'", "''");
  const script = `$ErrorActionPreference='Stop'
$target='${literal}'
$entry=Get-Item -LiteralPath $target -Force
if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Reparse point' }
$ancestor=if ($entry.PSIsContainer) { $entry } else { $entry.Directory }
while ($null -ne $ancestor) {
  if (($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Reparse ancestor' }
  $ancestor=$ancestor.Parent
}
$acl=Get-Acl -LiteralPath $target
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$allowed=@($sid,'S-1-5-18')
$owner=([Security.Principal.NTAccount]$acl.Owner).Translate([Security.Principal.SecurityIdentifier]).Value
if ($owner -notin $allowed) { throw 'Unexpected owner' }
if (${directory ? "$true" : "$false"} -and -not $acl.AreAccessRulesProtected) { throw 'Directory inheritance is enabled' }
$rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]) | Where-Object { $_.AccessControlType -eq 'Allow' })
if (@($rules | Where-Object { $_.IdentityReference.Value -notin $allowed }).Count -ne 0) { throw 'Unexpected allow principal' }
foreach ($principal in $allowed) {
  if (@($rules | Where-Object { $_.IdentityReference.Value -eq $principal -and ($_.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl }).Count -eq 0) { throw 'Private full-control principal missing' }
}
`;
  try {
    execFileSync("pwsh.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script,"utf16le").toString("base64")],
      {stdio: "ignore", timeout: 10000, windowsHide: true});
  } catch {throw Error("Private path ACL must allow only current SID and SYSTEM with full control; use an existing protected operator vault");}
  return true;
}
function bootContext(p, boot, keyBytes) {
  validatePlan(p); identifier(boot, "boot");
  const i = p.spec.workers.findIndex(w => w.bootIds.includes(boot)); check(i >= 0, "Unplanned boot");
  const w = p.spec.workers[i], bounds = p.workers[i], now = Date.now();
  check(Date.parse(p.spec.notBefore) <= now && Date.parse(p.spec.until) > now + 30000, "Boot window closed or not yet open");
  const key = createPrivateKey(keyBytes);
  check(key.asymmetricKeyType === "ed25519" && createPublicKey(key).export({format: "der", type: "spki"}).toString("base64") === p.spec.publicKeySpkiBase64, "Issuer key does not match reviewed public key");
  const expected = {v: 1, kind: w.kind, deploymentId: p.spec.deploymentId, worker: w.workerId, boot, notBefore: p.spec.notBefore,
    registerBy: p.spec.until, until: p.spec.until, maxPolls: w.maxPolls, maxReplicas: p.spec.host.maxReplicas,
    maxRestartsPerDeployment: p.spec.host.maxRestartsPerDeployment, maxDeployments: p.spec.host.maxDeployments,
    prepaidProbes: bounds.prepaidProbes, evidenceId: bounds.evidenceId};
  return {key, expected};
}
async function fundedAttempt(p, boot, keyBytes, directory, io, effect) {
  const out = resolve(directory);
  check((io.verifyPrivateDirectory ?? assertProtectedWindowsPath)(out, true) === true, "Protected private receipt directory required before debit");
  const verifyFile = io.verifyPrivateFile ?? assertProtectedWindowsPath;
  const ctx = bootContext(p, boot, keyBytes);
  // Exclusive write-ahead journal is durable BEFORE the SQL debit. A crash/lost response burns this attempt.
  const journalPath = join(out, boot + ".json"), fd = openSync(journalPath, "wx", 0o600);
  try {check(verifyFile(journalPath, false) === true, "Protected journal ACL required");} catch (error) {closeSync(fd); throw error;}
  const entry = {v: 1, planHash: p.planHash, boot, state: "attempt-started", startedAt: new Date().toISOString()};
  const persist = () => { const bytes = Buffer.from(JSON.stringify(entry, null, 2) + "\n"); ftruncateSync(fd, 0); writeSync(fd, bytes, 0, bytes.length, 0); fsyncSync(fd); };
  let attempted = false;
  try {
    persist();
    const checkedDebit = (id, attempt) => {
      check(!attempted && id === boot, "One debit only"); attempted = true;
      entry.deliveryAttempt = attempt; persist();
      const raw = (io.debit ?? debit)(id, attempt);
      check(typeof raw === "string" && Buffer.byteLength(raw) <= 2700 && raw.length > 0, "Delivery held");
      const receipt = JSON.parse(raw);
      check(canonical(receipt) === canonical(ctx.expected), "Committed receipt differs from reviewed plan");
      entry.receiptSha256 = hash(raw); entry.receipt = receipt; entry.deliveryAttempt = attempt;
      entry.state = "debit-committed"; entry.debitCommittedAt = new Date().toISOString(); persist();
      return raw;
    };
    const result = await effect({...ctx, checkedDebit, out, entry, persist, verifyFile});
    persist(); return result;
  } catch {
    entry.state = "discarded-unconfirmed"; entry.finishedAt = new Date().toISOString(); persist();
    throw Error("Delivery unconfirmed; discard this boot and do not retry it. Review the private journal.");
  } finally { closeSync(fd); }
}
export async function deliverPlannedBoot(p, boot, keyBytes, directory, io = {}) {
  return fundedAttempt(p, boot, keyBytes, directory, io, async ({checkedDebit, entry}) => {
    await launch(boot, keyBytes, {debit: checkedDebit, send: io.send ?? fetch});
    entry.state = "registration-confirmed"; entry.finishedAt = new Date().toISOString();
    return {state: entry.state};
  });
}
export async function issuePlannedBoot(p, boot, keyBytes, directory, io = {}) {
  return fundedAttempt(p, boot, keyBytes, directory, {debit: supervisedDebit, ...io}, async ({checkedDebit, key, out, entry, persist, verifyFile}) => {
    const raw = checkedDebit(boot, randomUUID()), bytes = Buffer.from(raw);
    const token = bytes.toString("base64url") + "." + sign(null, bytes, key).toString("base64url");
    const publishSqlPath = join(out, boot + ".publish.sql");
    const publication = `-- PRIVATE BEARER MATERIAL. Exact committed receipt SHA-256: ${hash(raw)}. Plan ${p.planHash}.
-- Apply separately using designated private operator; no upsert/replay or grants.
begin;
set local lock_timeout='3s';
set local statement_timeout='5s';
insert into erp_comm_cost.worker_signed_delivery(boot,token,receipt_sha256)
 values(${sql(boot)}::uuid,${sql(token)},${sql(hash(raw))});
commit;
`;
    const pub = openSync(publishSqlPath, "wx", 0o600);
    try {check(verifyFile(publishSqlPath, false) === true, "Protected publication ACL required"); writeSync(pub, publication); fsyncSync(pub);} finally {closeSync(pub);}
    entry.state = "signed-unpublished"; entry.publishSqlSha256 = hash(publication); entry.finishedAt = new Date().toISOString(); persist();
    return {state: entry.state, publishSqlPath};
  });
}

/** Sign supervisor configuration only after every exact boot has a committed funded delivery receipt.
 * No extra DB probe is needed: supervised receipt issuance checks lookup enrollment in the same funded call.
 */
export function createSupervisorManifest(p, keyBytes, directory, io = {}) {
  validatePlan(p);
  const out=resolve(directory), verifyFile=io.verifyPrivateFile??assertProtectedWindowsPath;
  check((io.verifyPrivateDirectory??assertProtectedWindowsPath)(out,true)===true,"Protected private receipt directory required");
  let issuer;
  for (const w of p.spec.workers) for (const boot of w.bootIds) {
    const ctx=bootContext(p,boot,keyBytes); issuer=ctx.key;
    const journalPath=join(out,boot+".json"), publicationPath=join(out,boot+".publish.sql");
    check(verifyFile(journalPath,false)===true && verifyFile(publicationPath,false)===true,"Protected issuance files required");
    const journal=JSON.parse(readFileSync(journalPath,"utf8")), publication=readFileSync(publicationPath,"utf8");
    check(journal.state==="signed-unpublished" && journal.planHash===p.planHash && journal.boot===boot &&
      canonical(journal.receipt)===canonical(ctx.expected) && hash(publication)===journal.publishSqlSha256,"Missing or changed committed issuance receipt");
    identifier(journal.deliveryAttempt,"committed delivery attempt");
    const match=publication.match(/values\('[a-f0-9-]+'::uuid,'([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)','([a-f0-9]{64})'\)/);
    check(match,"Signed publication missing");
    const [payload,signature]=match[1].split(".").map(value=>Buffer.from(value,"base64url"));
    check(signature.length===64 && verify(null,payload,createPublicKey(issuer),signature) && hash(payload)===journal.receiptSha256 &&
      hash(payload)===match[2] && canonical(JSON.parse(payload.toString("utf8")))===canonical(ctx.expected),"Signed publication receipt mismatch");
  }
  const s=p.spec, maxPhysicalStarts=s.host.maxReplicas*(1+s.host.maxRestartsPerDeployment)*s.host.maxDeployments;
  const manifest={v:1,purpose:"erp-communication-supervisor",deploymentId:s.deploymentId,until:s.until,planHash:p.planHash,
    maxReplicas:s.host.maxReplicas,maxRestartsPerDeployment:s.host.maxRestartsPerDeployment,maxDeployments:s.host.maxDeployments,maxPhysicalStarts,
    workers:s.workers.map((w,i)=>({kind:w.kind,worker:w.workerId,boots:w.bootIds,retries:s.host.supervisorLookupRetries,
      quarantineSeconds:srcQuarantine(w),maxLookups:p.workers[i].maxLookups,maxPolls:w.maxPolls,busySeconds:w.busySeconds,
      pollSeconds:w.pollSeconds,retrySeconds:w.retrySeconds,restartSeconds:w.restartSeconds,registrationSeconds:w.registrationSeconds??0,
      recoverySeconds:s.host.recoverySeconds}))};
  const body=Buffer.from(JSON.stringify(manifest));
  const token=body.toString("base64url")+"."+sign(null,body,issuer).toString("base64url");
  const manifestPath=join(out,p.planHash+".supervisor.env"), fd=openSync(manifestPath,"wx",0o600);
  try {check(verifyFile(manifestPath,false)===true,"Protected supervisor manifest required"); writeSync(fd,"ERP_COMM_WORKER_SUPERVISOR_MANIFEST="+token+"\n"); fsyncSync(fd);} finally {closeSync(fd);}
  let deliverySqlPath;
  if(s.supervisorDelivery) {
    const d=s.supervisorDelivery;
    const configHash=textHash({deploymentId:s.deploymentId,until:s.until,workers:manifest.workers.map(w=>({kind:w.kind,worker:w.worker,boots:w.boots,retries:w.retries,quarantineSeconds:w.quarantineSeconds})).sort((a,b)=>a.kind.localeCompare(b.kind))});
    const wakeRows=[];
    for(let ordinal=0;Date.parse(s.notBefore)+ordinal*d.cadenceSeconds*1000<Date.parse(s.until);ordinal++) {
      const scheduledAt=new Date(Date.parse(s.notBefore)+ordinal*d.cadenceSeconds*1000).toISOString();
      const expiresAt=new Date(Math.min(Date.parse(s.until),Date.parse(scheduledAt)+(d.cadenceSeconds+5)*1000)).toISOString();
      const nonce=randomUUID(),wake={v:1,purpose:"erp-communication-supervisor-wake",planId:d.planId,deploymentId:s.deploymentId,nonce,
        scheduledAt,expiresAt,cutoff:s.until,configHash,manifestHash:hash(token),maxClaimsPerProcess:d.maxClaimsPerProcess,maxPhysicalStarts};
      const wakeBody=Buffer.from(JSON.stringify(wake)),signedWake=wakeBody.toString("base64url")+"."+sign(null,wakeBody,issuer).toString("base64url");
      wakeRows.push(`insert into erp_comm_cost.supervisor_wake_ticket(nonce,plan,ordinal,scheduled_at,expires_at,wake) values(${sql(nonce)},${sql(d.planId)},${ordinal},${sql(scheduledAt)},${sql(expiresAt)},${sql(signedWake)});`);
    }
    const content=`-- PRIVATE signed supervisor manifest. Applies only to the already-funded exact pool; no new grants/approvals.
begin;
set local lock_timeout='3s';set local statement_timeout='15s';
insert into erp_comm_cost.supervisor_delivery_plan(id,pool,deployment_id,manifest,manifest_sha256,config_hash,max_claims_per_process,max_claims,not_before,deliver_until,retire_by,cadence_seconds,max_deliveries,evidence_id)
 values(${sql(d.planId)},${sql(d.poolPermitId)},${sql(s.deploymentId)},${sql(token)},${sql(hash(token))},${sql(configHash)},${d.maxClaimsPerProcess},${maxPhysicalStarts*d.maxClaimsPerProcess},${sql(s.notBefore)},${sql(s.until)},${sql(d.retireBy)},${d.cadenceSeconds},${d.maxActions-1},${sql(p.evidence.fleet.reference)});
${wakeRows.join("\n")}
select erp_comm_cost.start_supervisor_delivery(${sql(d.planId)}::uuid);
commit;
`;
    deliverySqlPath=join(out,p.planHash+".supervisor-delivery.sql");const deliveryFd=openSync(deliverySqlPath,"wx",0o600);
    try{check(verifyFile(deliverySqlPath,false)===true,"Protected delivery plan required");writeSync(deliveryFd,content);fsyncSync(deliveryFd);}finally{closeSync(deliveryFd);}
  }
  return {state:"manifest-prepared-not-installed",manifestPath,deliverySqlPath};
}

const help = `Offline: node tooling/local/commission-communication-pilot.mjs prepare --spec <absolute.json> --out <C:\\dev\\directory>
Offline: node tooling/local/commission-communication-pilot.mjs review --plan <bundle-directory>
Effectful one-use issuance: node tooling/local/commission-communication-pilot.mjs issue --plan <bundle-directory> --boot <UUID> --issuer-key <protected-file> --receipts <C:\\dev\\private-directory>
After issuing every boot: node tooling/local/commission-communication-pilot.mjs manifest --plan <bundle-directory> --issuer-key <protected-file> --receipts <existing-protected-directory>
Post-deployment scheduled delivery: same arguments with publish-manifest; requires supervisorDelivery spec and emits private bounded SQL.
Effectful direct registration: same arguments with deliver (operator diagnostics only; prefer presigned supervisor pool).
No SQL, flags, key generation, deployment, approval or provider changes are applied by prepare/review. Never put private issuer keys in app environment.\n`;
async function main(args) {
  const [mode, ...rest] = args;
  if (["--help", "help", undefined].includes(mode)) {process.stdout.write(help); return;}
  const allowed = mode === "prepare" ? ["--spec", "--out"] : mode === "review" ? ["--plan"] : ["manifest","publish-manifest"].includes(mode) ? ["--plan","--issuer-key","--receipts"] : ["--plan", "--boot", "--issuer-key", "--receipts"];
  check(["prepare", "review", "issue", "deliver", "manifest","publish-manifest"].includes(mode) && rest.length === allowed.length * 2, "Invalid command; use --help");
  const opts = {};
  for (let i = 0; i < rest.length; i += 2) {check(allowed.includes(rest[i]) && !Object.hasOwn(opts, rest[i]) && rest[i + 1], "Invalid or repeated option"); opts[rest[i]] = rest[i + 1];}
  if (mode === "prepare") {
    check(/^C:\\dev\\/i.test(resolve(opts["--out"])), "Output must be under C:\\dev");
    const p = preparePlan(JSON.parse(readFileSync(opts["--spec"], "utf8")));
    writePlanBundle(p, opts["--out"]); process.stdout.write(`Prepared, not applied. Plan SHA-256: ${p.planHash}\n`); return;
  }
  const p = readPlanBundle(opts["--plan"]);
  if (mode === "review") {process.stdout.write(`Artifacts and input-file hashes match. Prepared only; operating evidence requires human review. Plan SHA-256: ${p.planHash}\n`); return;}
  check(/^C:\\dev\\/i.test(resolve(opts["--receipts"])), "Private receipts must be under C:\\dev");
  assertProtectedWindowsPath(opts["--receipts"], true);
  assertProtectedWindowsPath(dirname(resolve(opts["--issuer-key"])), true);
  assertProtectedWindowsPath(opts["--issuer-key"], false);
  if (["manifest","publish-manifest"].includes(mode)) {
    if(mode==="publish-manifest")check(p.spec.supervisorDelivery,"A funded supervisorDelivery specification is required");
    const result=createSupervisorManifest(p,readFileSync(opts["--issuer-key"]),opts["--receipts"]);
    process.stdout.write(result.state+". Private signed configuration retained.\n"); return;
  }
  const operation = mode === "issue" ? issuePlannedBoot : deliverPlannedBoot;
  const result = await operation(p, opts["--boot"], readFileSync(opts["--issuer-key"]), opts["--receipts"]);
  process.stdout.write(`${result.state}. Private receipt retained. No retry for this boot.\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {await main(process.argv.slice(2));} catch (error) {process.stderr.write((error instanceof Error ? error.message : "Commissioning failed") + "\n"); process.exitCode = 1;}
}
