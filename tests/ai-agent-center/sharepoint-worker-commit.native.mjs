import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [psql, port, test = "green", workerRoot] = process.argv.slice(2);
assert.ok(psql && /^\d{4,5}$/.test(port ?? "") && Number(port) <= 65535);
const args = ["-X", "-w", "-qAt", "-h", "127.0.0.1", "-p", port, "-U", "postgres",
  "-d", "agent_center_controls_native", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"];
const options = { env: { ...process.env, PGHOSTADDR: "127.0.0.1" }, windowsHide: true };
const conn = "'10000000-0000-4000-8000-000000000001'";
const standard = "'10000000-0000-4000-8000-000000000002'";
const actor = (id = 101) => `set local role authenticated;
  set local fixture.session_active = 'yes'; set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000${id}';`;
const runtime = "set session authorization erp_agent_discovery_runtime;";
const body = "%PDF-1.0 EXT";
const hash = createHash("sha256").update(body).digest("hex");
const quote = value => value == null ? "null" : `'${String(value).replaceAll("'", "''")}'`;

function run(sql) {
  const result = spawnSync(psql, args, { ...options, input: sql, encoding: "utf8", timeout: 10000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim());
  return result.stdout.trim();
}

async function hold(sql) {
  const child = spawn(psql, args, options);
  let stdout = "";
  let stderr = "";
  const closed = new Promise(resolve => child.once("close", resolve));
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Fixture transaction did not reach the write")), 5000);
      const finish = callback => { clearTimeout(timer); callback(); };
      child.once("error", error => finish(() => reject(error)));
      child.once("close", () => finish(() => reject(new Error(stderr))));
      child.stderr.setEncoding("utf8").on("data", data => { stderr += data; });
      child.stdout.setEncoding("utf8").on("data", data => {
        stdout += data;
        if (stdout.includes("worker-commit-ready")) finish(resolve);
      });
      child.stdin.write(`begin;${sql}\n\\echo worker-commit-ready\n`);
    });
  } catch (error) {
    child.kill();
    throw error;
  }
  return async () => {
    child.stdin.end("commit;\n");
    assert.equal(await closed, 0, stderr);
  };
}

const req = (operationId, companyId = 1) => JSON.stringify({
  version: 1, operationId, authUserId: `00000000-0000-4000-8000-00000000010${companyId}`,
  context: null, scope: { companyId, branchId: null },
  metadata: { original_filename: "synthetic.pdf", mime_type: "application/pdf", file_size_bytes: 12, sha256_hash: hash },
});
const inTxn = sql => run(`begin;${sql} commit;`);
const claim = (connection = conn) => JSON.parse(run(`${runtime} select erp_private.claim_agent_pdf(${connection});`));
const prepare = (item, connection = conn) => run(`${runtime} select erp_private.advance_agent_pdf(
  ${connection},${quote(item.operation_id)},${quote(item.lease_token)},'prepare',${quote(hash)});`);
const admit = item => JSON.parse(inTxn(`${actor()} select public.f07_admit_sharepoint_upload(
  ${quote(req(item.operation_id))}::jsonb,${quote(item.lease_token)});`));
const control = (action, revision, correlation) => `${actor("003")} select public.dms_agent_center_control(
  1,null,'dms.intake',${quote(action)},${revision},${quote(`90000000-0000-4000-8000-0000000000${correlation}`)},'Synthetic worker test');`;
const worker = (item, id, step, claim = {}, result = null, connection = conn) =>
  `select erp_private.dms_sharepoint_worker_commit(${connection},${quote(item.operation_id)},${id},
    ${quote(item.lease_token)},${quote(step)},${quote(claim.attemptId)},${quote(claim.processingRevision)},
    ${quote(result == null ? null : JSON.stringify(result))}::jsonb);`;
const execute = (...params) => JSON.parse(run(`${runtime} ${worker(...params)}`));
const stage = (item, id) => JSON.parse(inTxn(`${actor()} select public.f07_stage_sharepoint_upload(
  ${quote(item.operation_id)},${id},${quote(item.lease_token)},convert_to(${quote(body)},'UTF8'));`));
const count = relation => Number(run(`select count(*) from ${relation};`));

assert.equal(run(`select current_database() = 'agent_center_controls_native'
  and inet_server_addr() = '127.0.0.1'::inet and to_regclass('erp_private.fixture_permissions') is not null;`), "t");

run(`insert into erp_private.agent_pdf_policy (connection_id,company_id,actor_id,officer_id,from_time,enabled)
  values (${conn},1,101,103,now()-interval '1 hour',true),(${standard},2,102,103,now()-interval '1 hour',true);
  insert into erp_private.dms_agent_center_controls(company_id,branch_id,agent_key,worker_bound,mode,enabled)
  values (1,null,'dms.intake',true,'execute',true);`);

const original = claim();
assert.equal(prepare(original), "ready");
const origin = admit(original);
assert.equal(origin.operationId, original.operation_id);
assert.equal(origin.replayed, false);

if (test === "red") {
  assert.throws(() => inTxn(`${actor()} update public.dms_upload_sessions
    set status='uploaded',intake_status='uploaded' where id=${origin.id};`), /42501/,
  "ordinary scoped table writers cannot complete a lease-owned SharePoint upload");
  process.exit(0);
}

assert.equal(count("erp_private.dms_sharepoint_intake_origins"), 1);
assert.equal(run(`select not has_function_privilege('authenticated',
  'erp_private.f07_admit_single_upload_fenced(jsonb,uuid)','execute')
  and not has_function_privilege('authenticated','erp_private.dms_sharepoint_admission_core(jsonb,uuid)','execute');`), "t");
assert.throws(() => inTxn(`${actor()} update public.dms_upload_sessions
  set status='uploaded',intake_status='uploaded' where id=${origin.id};`), /42501/);
assert.throws(() => inTxn(`${actor()} select public.f07_prepare_temp_upload(${origin.id});`), /42501/);
assert.throws(() => inTxn(`${actor()} select public.f07_complete_temp_upload(${origin.id});`), /42501/);
assert.throws(() => inTxn(`${actor()} select public.f07_acknowledge_single_upload(
  ${quote(req(original.operation_id))}::jsonb,${origin.id});`), /42501/);
assert.throws(() => inTxn(`${actor()} select public.f07_admit_single_upload(
  ${quote(req(original.operation_id))}::jsonb);`), /42501/);
assert.throws(() => inTxn(`${actor()} ${worker(original, origin.id, "resume")}`), /42501/);
assert.throws(() => run(`set session authorization service_role;
  insert into public.dms_ai_extraction_jobs values(1,${origin.id});`), /42501/);
assert.throws(() => run(`set session authorization service_role;
  insert into public.dms_ai_extraction_results (id,upload_session_id,job_id,ai_status)
  values(1,${origin.id},1,'pending_review');`), /42501/);

assert.equal(execute(original, origin.id, "resume").state, "admitted");
assert.throws(() => execute(original, origin.id, "complete"), /PT409/);
assert.throws(() => execute(original, origin.id + 1, "resume"), /42501/);
assert.throws(() => execute(original, origin.id, "resume", {}, null, standard), /42501/);
assert.equal(stage(original, origin.id).operationId, original.operation_id);
assert.throws(() => execute(original, origin.id, "start"), /PT409/);
run("update public.user_roles set is_active=false where id=40;");
assert.throws(() => stage(original, origin.id), /42501/);
assert.throws(() => execute(original, origin.id, "resume"), /42501/);
assert.throws(() => execute(original, origin.id, "complete"), /42501/);
assert.equal(count("erp_private.dms_sharepoint_intake_worker_jobs"), 0);
run("update public.user_roles set is_active=true where id=40; update public.user_profiles set must_change_password=true where id=101;");
assert.throws(() => execute(original, origin.id, "resume"), /42501/);
run("update public.user_profiles set must_change_password=false where id=101; update auth.sessions set not_after=clock_timestamp() where user_id='00000000-0000-4000-8000-000000000101';");
assert.throws(() => execute(original, origin.id, "resume"), /42501/);
run("update auth.sessions set not_after=null where user_id='00000000-0000-4000-8000-000000000101';");

const pauseFirst = await hold(control("pause", 0, 11));
try {
  assert.throws(() => run(`${runtime} set lock_timeout='250ms'; ${worker(original, origin.id, "complete")}`), /55P03/);
  assert.equal(count("erp_private.dms_sharepoint_intake_worker_jobs"), 0);
} finally {
  await pauseFirst();
}
assert.throws(() => execute(original, origin.id, "complete"), /55000/);
inTxn(control("resume", 1, 12));
const complete = execute(original, origin.id, "complete");
assert.deepEqual(complete, execute(original, origin.id, "complete"));
assert.equal(complete.state, "queued");
const first = execute(original, origin.id, "start");
assert.deepEqual(first, execute(original, origin.id, "start"));
assert.equal(first.state, "processing");
assert.ok(first.attemptId && first.processingRevision);
assert.equal(first.payload, Buffer.from(body).toString("base64"));
assert.throws(() => execute(original, origin.id, "publish", first, { typeCode: "test" }, standard), /42501/);

run(`update erp_private.agent_pdf_work set lease_until=clock_timestamp()-interval '1 second'
  where operation_id=${quote(original.operation_id)};`);
assert.throws(() => execute(original, origin.id, "publish", first, { typeCode: "test" }), /42501/);
const resumed = claim();
assert.equal(resumed.operation_id, original.operation_id);
assert.notEqual(resumed.lease_token, original.lease_token);
assert.equal(admit(resumed).id, origin.id);
assert.equal(execute(resumed, origin.id, "resume").needsStaging, true);
assert.throws(() => execute(resumed, origin.id, "start"), /PT409/);
assert.equal(stage(resumed, origin.id).replayed, false);
assert.equal(stage(resumed, origin.id).replayed, true);
const second = execute(resumed, origin.id, "start");
assert.notEqual(second.attemptId, first.attemptId);
assert.notEqual(second.processingRevision, first.processingRevision);
assert.throws(() => execute(resumed, origin.id, "publish", first, { typeCode: "test" }), /PT409/);
assert.throws(() => execute(original, origin.id, "publish", second, { typeCode: "test" }), /42501/);
run("delete from public.role_permissions where id=32;");
assert.throws(() => execute(resumed, origin.id, "publish", second, { typeCode: "test" }), /42501/);
run("insert into public.role_permissions values (32,10,22);");
assert.equal(count("erp_private.dms_sharepoint_intake_publications"), 0);

run(`create function erp_private.fixture_fail_publication() returns trigger language plpgsql
  as $$ begin raise exception 'Synthetic publication write failure'; end $$;
  create trigger fixture_fail_publication after insert on erp_private.dms_sharepoint_intake_publications
  for each row execute function erp_private.fixture_fail_publication();`);
const output = { typeCode: "test", fields: { reference: "SYNTH-1" } };
assert.throws(() => execute(resumed, origin.id, "publish", second, output), /Synthetic publication write failure/);
assert.equal(count("erp_private.dms_sharepoint_intake_publications"), 0);
assert.equal(execute(resumed, origin.id, "resume").state, "processing");
run("drop trigger fixture_fail_publication on erp_private.dms_sharepoint_intake_publications;");

const publishPaused = await hold(control("pause", 2, 13));
try {
  assert.throws(() => run(`${runtime} set lock_timeout='250ms'; ${worker(resumed, origin.id, "publish", second, output)}`), /55P03/);
} finally {
  await publishPaused();
}
assert.throws(() => execute(resumed, origin.id, "publish", second, output), /55000/);
assert.equal(count("erp_private.dms_sharepoint_intake_publications"), 0);
inTxn(control("resume", 3, 14));

const publishFirst = await hold(`${runtime} ${worker(resumed, origin.id, "publish", second, output)}`);
try {
  assert.throws(() => inTxn(`set local lock_timeout='250ms'; ${control("pause", 4, 15)}`), /55P03/);
  assert.equal(count("erp_private.dms_sharepoint_intake_publications"), 0);
} finally {
  await publishFirst();
}
inTxn(control("pause", 4, 15));
assert.throws(() => execute(resumed, origin.id, "publish", second, output), /55000/);
inTxn(control("resume", 5, 16));
const receipt = execute(resumed, origin.id, "publish", second, output);
assert.equal(receipt.replayed, true);
assert.equal(receipt.state, "published_held");
assert.equal(receipt.operationId, original.operation_id);
assert.equal(receipt.sessionId, origin.id);
assert.throws(() => execute(resumed, origin.id, "publish", second, { typeCode: "changed" }), /PT409/);
assert.equal(count("erp_private.dms_sharepoint_intake_worker_jobs"), 1);
assert.equal(count("erp_private.dms_sharepoint_intake_publications"), 1);
assert.equal(count("public.dms_ai_extraction_jobs"), 0);
assert.equal(count("public.dms_ai_extraction_results"), 0);
assert.equal(count("public.dms_review_queue"), 0);
assert.equal(count("public.dms_documents"), 0);
assert.equal(run(`select status||':'||intake_status from public.dms_upload_sessions where id=${origin.id};`), "uploading:uploaded");

run("update erp_private.dms_agent_center_controls set enabled=false,worker_bound=false where company_id=1;");
assert.throws(() => inTxn(`${actor()} select public.f07_admit_single_upload(
  ${quote(req(original.operation_id))}::jsonb);`), /42501/);

const legacy = claim(standard);
assert.equal(prepare(legacy, standard), "ready");
const legacyRequest = quote(req(legacy.operation_id, 2));
const legacyReceipt = JSON.parse(inTxn(`${actor(102)} select public.f07_admit_single_upload(${legacyRequest}::jsonb);`));
const legacyId = legacyReceipt.session.id;
const identity = JSON.parse(inTxn(`${actor(102)} select public.f07_prepare_temp_upload(${legacyId});`));
const storageId = "40000000-0000-4000-8000-000000000001";
const storageTime = "2026-11-23T00:00:00Z";
run(`insert into storage.objects values (${quote(storageId)},'v1',${quote(storageTime)},
  '{"size":12,"mimetype":"application/pdf"}','dms-temp',${quote(identity.source.path)});`);
inTxn(`set local role service_role; set local request.jwt.claim.role = 'service_role';
  select public.f07_attest_temp_upload(${legacyId},102,'20000000-0000-4000-8000-000000000101',
    ${quote(JSON.stringify(identity.source))}::jsonb,${quote(storageId)},'v1',${quote(storageTime)},${quote(hash)});`);
assert.equal(JSON.parse(inTxn(`${actor(102)} select public.f07_complete_temp_upload(${legacyId});`)).status, "uploaded");
assert.throws(() => {
  run(`insert into erp_private.dms_agent_center_controls(company_id,branch_id,agent_key,worker_bound,mode,enabled)
    values (2,null,'dms.intake',true,'execute',true);`);
  inTxn(`${actor(102)} select public.f07_admit_sharepoint_upload(${legacyRequest}::jsonb,${quote(legacy.lease_token)});`);
}, /42501/);
assert.equal(count("erp_private.dms_sharepoint_intake_origins"), 1);
console.log("PASS isolated worker completion, queued claim, stale generation, exact replay, pause ordering, atomic rollback, and legacy completion");

if (workerRoot) {
  const workerUrl = (file) => pathToFileURL(resolve(workerRoot,"workers","sharepoint-agent",file)).href;
  const { runContinuousIntake } = await import(workerUrl("continuous.mjs"));
  const { runDmsPilot } = await import(workerUrl("dms-pilot.mjs"));
  const connection = "'10000000-0000-4000-8000-000000000003'";
  const source = { name: "connected.pdf", bytes: Buffer.from("%PDF-1.0 LINK") };
  const authUserId = "00000000-0000-4000-8000-000000000101";
  const config = { companyId:1, authUserId, agentCenterAdmission:true, oneFileSession:true };
  let providerCalls = 0;
  const claims = [];
  const receipts = [];

  run(`update erp_private.dms_agent_center_controls set enabled=true,worker_bound=true where company_id=1;
    insert into erp_private.agent_connections values (${connection},'erp_agent_discovery_runtime');
    insert into erp_private.agent_sync_checkpoints values (${connection},false);
    insert into erp_private.agent_source_versions(connection_id,item_id,version,mime,size_bytes)
      values (${connection},'connected','version-1','application/pdf',${source.bytes.length});
    insert into erp_private.agent_source_items values (${connection},'connected','version-1','connected.pdf',true);
    insert into erp_private.agent_pdf_policy(connection_id,company_id,actor_id,officer_id,from_time,enabled)
      values (${connection},1,101,103,now()-interval '1 hour',true);`);

  const ledger = {
    claimPdf() {
      const row = run(`${runtime} select erp_private.claim_agent_pdf(${connection});`);
      const item = row ? JSON.parse(row) : null;
      if (item) claims.push(item);
      return item;
    },
    advancePdf(item, step, hash = null) {
      return run(`${runtime} select erp_private.advance_agent_pdf(
        ${connection},${quote(item.operation_id)},${quote(item.lease_token)},${quote(step)},${quote(hash)});`);
    },
  };
  const client = {
    profile: () => ({ userId:authUserId, capabilities:{ upload:true, preview:true, review:true, numbering:false } }),
    scopes: () => [{ companyId:1, branchId:null }],
    admitSharePoint(request, lease) {
      const receipt = JSON.parse(inTxn(`${actor()} select public.f07_admit_sharepoint_upload(
        ${quote(JSON.stringify(request))}::jsonb,${quote(lease)});`));
      receipts.push(receipt);
      return receipt;
    },
  };
  const graph = {
    readDiscoveredPdf(item, version) {
      assert.equal(item,"connected");
      assert.equal(version,"version-1");
      return source;
    },
  };

  // This adapter is available only to the disposable fixture. The normal
  // continuous worker and mobile admission implementations run unchanged.
  const runPilot = async context => {
    const admission = await runDmsPilot(context);
    assert.equal(admission.status,"admission_retained");
    const item = claims.at(-1);
    const id = admission.sessionId;
    const resume = execute(item,id,"resume",{},null,connection);
    const current = resume.needsStaging
      ? JSON.parse(inTxn(`${actor()} select public.f07_stage_sharepoint_upload(
          ${quote(item.operation_id)},${id},${quote(item.lease_token)},decode('${source.bytes.toString("hex")}','hex'));`))
      : resume;
    assert.equal(current.operationId,item.operation_id);
    if (resume.state === "published_held") return admission;

    assert.equal(execute(item,id,"complete",{},null,connection).state,"queued");
    const claim = execute(item,id,"start",{},null,connection);
    assert.deepEqual(Buffer.from(claim.payload,"base64"),source.bytes);
    providerCalls++;
    assert.equal(execute(item,id,"publish",claim,{ typeCode:"synthetic_connected" },connection).state,"published_held");
    throw new Error("Synthetic lost acknowledgement after native commit");
  };

  assert.deepEqual(await runContinuousIntake({ config,client,graph,ledger,runPilot }),["deferred"]);
  run(`update erp_private.agent_pdf_work set next_attempt_at=clock_timestamp()
    where operation_id=${quote(claims[0].operation_id)};`);
  assert.deepEqual(await runContinuousIntake({ config,client,graph,ledger,runPilot }),["admission_retained"]);
  assert.equal(providerCalls,1);
  assert.equal(claims.length,2);
  assert.equal(claims[1].operation_id,claims[0].operation_id);
  assert.notEqual(claims[1].lease_token,claims[0].lease_token);
  assert.equal(receipts[1].id,receipts[0].id);
  assert.equal(receipts[1].replayed,true);
  assert.equal(run(`select count(*) from erp_private.dms_sharepoint_intake_publications
    where operation_id=${quote(claims[0].operation_id)};`),"1");
  assert.equal(count("public.dms_ai_extraction_results"),0);
  console.log("PASS real continuous worker admission and retry against native SQL with a fixture-only completion adapter");
}
