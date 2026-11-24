import assert from "node:assert/strict";
import { runWorker, snapshot, sql } from "./sharepoint-telemetry.native.mjs";

const connectionId = "10000000-0000-0000-0000-000000000003";
const user = "agent_heartbeat_fixture_b";
const worker = options => runWorker({ connectionId, user, ...options });
const branch = (principal = "branch") => snapshot(principal, 1, 11);

assert.equal(branch().workerHeartbeatAt, undefined);
assert.equal(branch().intakeProgress, null);

const firstRun = await worker();
const healthy = branch();
assert.equal(Date.parse(healthy.workerHeartbeatAt), Date.parse(firstRun.at(-1).recordedAt));
assert.deepEqual(healthy.intakeProgress, { completedUnits: 0, totalUnits: 1 },
  "Only the exact approved source contributes to the denominator");
assert.equal(healthy.checkpoint.paused, false);
assert.equal(branch("company").workerHeartbeatAt, healthy.workerHeartbeatAt);
assert.equal(branch("viewer").workerHeartbeatAt, undefined);
assert.equal(branch("viewer").intakeProgress, null);
assert.equal(snapshot("company", 1, 12).workerHeartbeatAt, undefined);
assert.notEqual(snapshot("company").workerHeartbeatAt, healthy.workerHeartbeatAt);

sql(`update erp_private.agent_pdf_work set actor_id=103, sha256=null, status='retry',
  lease_until=now()+interval '10 minutes' where connection_id='${connectionId}' and item_id='a';`);
assert.equal(branch().intakeProgress, null, "An active attempt hides the measurement");

sql(`update erp_private.agent_pdf_work set lease_until=null,sha256=repeat('a',64) where connection_id='${connectionId}' and item_id='a';
  insert into public.dms_upload_sessions
    (id,uploaded_by,owning_company_id,owning_branch_id,sha256_hash,status,intake_status,ai_job_id,ai_result_id)
  values (203,103,1,11,repeat('a',64),'uploaded','ai_processing',203,203);
  insert into erp_private.f07_single_upload_admissions(actor_id,operation_id,upload_session_id)
    select 103,operation_id,203 from erp_private.agent_pdf_work where connection_id='${connectionId}' and item_id='a';`);
assert.equal(branch().intakeProgress, null, "A retained in-flight intake also hides the measurement");

sql(`update public.dms_upload_sessions set intake_status='review_pending' where id=203;
  insert into public.dms_ai_extraction_jobs(id,upload_session_id,status) values (203,203,'complete');
  insert into public.dms_ai_extraction_results(id,upload_session_id,job_id) values (203,203,203);
  insert into public.dms_review_queue(id,upload_session_id,status,ai_result_id,assigned_to)
    values (203,203,'assigned',203,104);
  update erp_private.agent_pdf_work set status='review_pending',session_id=203,review_id=203
    where connection_id='${connectionId}' and item_id='a';
  insert into erp_private.dms_sharepoint_br1_review_state(operation_id,upload_session_id,officer_id,result_id,review_id)
    select operation_id,203,104,203,203 from erp_private.agent_pdf_work where connection_id='${connectionId}' and item_id='a';`);
assert.deepEqual(branch().intakeProgress, { completedUnits: 0, totalUnits: 1 },
  "A tentative result and queue cannot count without the durable notification receipt");
sql("update erp_private.dms_sharepoint_br1_review_state set notification_event_id=203;");
assert.deepEqual(branch().intakeProgress, { completedUnits: 1, totalUnits: 1 });

sql("update public.dms_upload_sessions set subject_visible=false where id=203;");
assert.equal(branch().intakeProgress, null, "A hidden intake cannot produce an aggregate receipt");
sql("update public.dms_upload_sessions set subject_visible=true where id=203;");
sql("update erp_private.dms_agent_center_controls set revision=revision+1,paused=true where company_id=1 and branch_id=11;");
await worker();
assert.equal(branch().checkpoint.paused, true);
assert.equal(branch().intakeProgress, null);
const pausedHeartbeat = branch().workerHeartbeatAt;
assert.ok(Date.parse(pausedHeartbeat) >= Date.parse(healthy.workerHeartbeatAt));
sql("update erp_private.dms_agent_center_controls set revision=revision+1,paused=false where company_id=1 and branch_id=11;");
assert.equal(branch().intakeProgress, null, "A resumed lane requires a fresh committed scan");
await worker({ scenario: "wait", onWaiting() {
  assert.equal(branch().intakeProgress, null);
  assert.equal(branch().workerHeartbeatAt, pausedHeartbeat);
} });
assert.deepEqual(branch().intakeProgress, { completedUnits: 1, totalUnits: 1 });

const competingConnection = "10000000-0000-0000-0000-000000000004";
sql(`insert into erp_private.agent_connections(id,runtime_login) values ('${competingConnection}','${user}');
  insert into erp_private.agent_pdf_policy(connection_id,company_id,enabled,actor_id,officer_id)
    values ('${competingConnection}',1,true,103,104);
  insert into erp_private.agent_sync_checkpoints(connection_id,updated_at,paused,revision)
    values ('${competingConnection}',now(),false,1);
  insert into erp_private.dms_sharepoint_br1_review_scope
    select '${competingConnection}',company_id,branch_id,actor_id,officer_id,item_id,source_version,sha256,expires_at
    from erp_private.dms_sharepoint_br1_review_scope where connection_id='${connectionId}';`);
assert.equal(branch().workerHeartbeatAt, undefined, "Ambiguous branch enrollment must remain unmeasured");
assert.equal(branch().intakeProgress, null);
sql(`update erp_private.dms_sharepoint_br1_review_scope set expires_at=now()-interval '1 minute'
  where connection_id='${competingConnection}';`);

const newerHeartbeat = branch().workerHeartbeatAt;
const forgedPulse = sql(`select erp_private.record_agent_center_sharepoint_worker_cycle('${connectionId}',1,
  '00000000-0000-0000-0000-000000000101',null,false);`, "agent_heartbeat_fixture_a");
assert.equal(forgedPulse, "");
assert.equal(branch().workerHeartbeatAt, newerHeartbeat);
assert.deepEqual(branch().intakeProgress, { completedUnits: 1, totalUnits: 1 });
sql(`update erp_private.dms_sharepoint_br1_review_scope set expires_at=now()-interval '1 minute'
  where connection_id='${connectionId}';`);
assert.equal(branch().workerHeartbeatAt, undefined);
assert.equal(branch().intakeProgress, null);
console.log("PASSED BR1 actual worker heartbeat, exact-source progress and scoped review receipts");
