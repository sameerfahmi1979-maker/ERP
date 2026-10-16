// MAIN ONLY. Supplemental, exact-resource, read-only automatic-reminder checks.
// Run AFTER the unchanged dms-numbered-ai-approval-resource-check.mjs. This does
// not replace that historical checker, execute RPCs, repair data or infer cases.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {guard,sql,runtime,evidence} from './local-db.mjs';

assert.equal(process.argv.length,2);assert.equal(process.env.ALGT_F06_LOCAL_TARGET,undefined);
const containerId=guard();
const expectedReminderColumns=["assigned_to","created_at","department_code","dismissal_reason","dismissed_at","dismissed_by","document_id","escalation_level","id","last_notification_at","notification_status","recipients_json","reminder_date","reminder_days_before","retry_count","sent_at","status","updated_at"];
const schema=JSON.parse(sql(`begin transaction read only;set local statement_timeout='20s';select jsonb_build_object('reminderColumns',(select coalesce(jsonb_agg(column_name order by column_name),'[]'::jsonb) from information_schema.columns where table_schema='public' and table_name='dms_expiry_reminders'),'profileStateType',(select data_type from information_schema.columns where table_schema='public' and table_name='user_profiles' and column_name='status'),'profileHasLegacyActive',exists(select 1 from information_schema.columns where table_schema='public' and table_name='user_profiles' and column_name='is_active'));rollback;`));
assert.deepEqual(schema.reminderColumns,expectedReminderColumns);assert.equal(schema.profileStateType,'text');assert.equal(schema.profileHasLegacyActive,false);
const ledger=JSON.parse(fs.readFileSync(path.join(runtime,'fixtures-private.json'),'utf8'));
assert.ok(Array.isArray(ledger.rows)&&Array.isArray(ledger.intents));
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const positive=value=>assert.ok(Number.isSafeInteger(value)&&value>0,'Exact positive resource ID required');
const uuid=value=>assert.match(value,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i);
const files=fs.readdirSync(evidence).filter(file=>/^DMS_NUMBERED_AI_APPROVAL_RESOURCES_FDAI[A-Z0-9]+\.json$/.test(file)).sort();
const runs=[],historicalFiles=[];
for(const file of files){
 const bytes=fs.readFileSync(path.join(evidence,file)),m=JSON.parse(bytes.toString('utf8'));
 if(!Object.hasOwn(m,'automaticReminderProbes')){historicalFiles.push(file);continue;}
 assert.match(m.marker,/^FDAI[A-Z0-9]+$/);assert.equal(file,`DMS_NUMBERED_AI_APPROVAL_RESOURCES_${m.marker}.json`);
 for(const field of ['owned','operations','requests','automaticReminderProbes','automaticReminderRaces','reminderAdminGrants','authSessions','cleanupFailures'])assert.ok(Array.isArray(m[field]),field);
 const intents=ledger.intents.filter(value=>value.marker===m.marker),owned=ledger.rows.filter(value=>value.marker===m.marker);
 assert.ok(intents.length);assert.deepEqual(m.reminderAdminGrants,[],'Automatic reminder run must never open an administration window');
 assert.equal(intents.filter(value=>/case-local reminder-admin/.test(value.operation)).length,0);
 const exact=(table,id)=>{positive(id);assert.ok(m.owned.some(row=>row.table===table&&row.id===id));assert.ok(owned.some(row=>row.table===table&&row.id===id));};
 const checks=[],add=(name,predicate)=>checks.push(`select ${quote(name)}::text as name,(${predicate})::boolean as ok`);
 const roles=m.owned.filter(row=>row.table==='roles').map(row=>row.id);roles.forEach(positive);
 if(roles.length)add('owned role definitions/pairs do not contain reminder-admin grants',`not exists(select 1 from public.roles where id in (${roles.join(',')}) and role_code in ('system_admin','group_admin')) and not exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id where rp.role_id in (${roles.join(',')}) and p.permission_code in ('dms.admin','dms.expiry.manage','dms.expiry.dismiss'))`);
 const probeIntents=intents.filter(value=>value.operation==='Automatic reminder explicit rollback-only probe; no committed repair');
 assert.equal(probeIntents.length,m.automaticReminderProbes.length,'Unreturned rollback observation is not presumed safe');
 const probeKeys=[];
 for(const probe of m.automaticReminderProbes){
  exact('dms_upload_sessions',probe.sourceId);positive(probe.documentId);uuid(probe.operationId);assert.ok(m.operations.includes(probe.operationId));
  assert.match(probe.caseName,/^AR(?:[0-9]{2}|_REPLAY)_[A-Za-z0-9_]+$/);assert.match(probe.before,/^[a-f0-9]{64}$/);assert.match(probe.after,/^[a-f0-9]{64}$/);
  assert.equal(probe.unchanged,true);assert.equal(probe.before,probe.after);
  const key=probe.caseName+':'+probe.operationId;assert.ok(!probeKeys.includes(key));probeKeys.push(key);
  assert.equal(probeIntents.filter(value=>value.caseName===probe.caseName&&value.documentId===probe.documentId&&value.sourceId===probe.sourceId&&value.operationId===probe.operationId).length,1);
 }
 assert.ok(m.proofHistory&&Array.isArray(m.proofHistory.plans));
 for(const plan of m.proofHistory.plans.filter(value=>value.completed)){
  exact('dms_documents',plan.document_id);uuid(plan.operation_id);const request=m.requests.find(value=>value.operationId===plan.operation_id);assert.ok(request);
  const doc=plan.document_id,expiry=request.input.expiryDate;
  const expected=expiry?`(select jsonb_agg(jsonb_build_object('days',n,'date',${quote(expiry)}::date-n,'status','pending') order by n) from unnest(array[90,60,30,14,7,1]) n)`:`'[]'::jsonb`;
  add(`document ${doc}: exact original automatic schedule`,`(select coalesce(jsonb_agg(jsonb_build_object('days',reminder_days_before,'date',reminder_date,'status',status) order by reminder_days_before),'[]'::jsonb) from public.dms_expiry_reminders where document_id=${doc})=${expected}`);
  add(`document ${doc}: no optional notification/recipient state was fabricated`,`not exists(select 1 from public.dms_expiry_reminders where document_id=${doc} and (notification_status is distinct from 'pending' or retry_count is distinct from 0 or escalation_level is distinct from 0 or sent_at is not null or last_notification_at is not null or dismissed_by is not null or dismissed_at is not null or dismissal_reason is not null or assigned_to is not null or department_code is not null or recipients_json is not null))`);
 }
 for(const change of intents.filter(value=>value.operation==='Temporarily narrow exact owned DMS assignment to owned branch; restore original null finally')){
  exact('user_roles',change.assignment);exact('roles',change.role);exact('branches',change.branch);assert.equal(change.actor,ledger.actors.companyA.profileId);
  add(`assignment ${change.assignment}: original scope restored and retired`,`exists(select 1 from public.user_roles where id=${change.assignment} and role_id=${change.role} and user_profile_id=${change.actor} and owner_company_id=${ledger.companyIds[0]} and branch_id is null and not is_active)`);
 }
 const financeWindows=intents.filter(value=>value.operation==='Open exact automatic-reminder finance-view-only company window');
 assert.equal(intents.filter(value=>value.operation==='Close exact automatic-reminder finance-view-only window').length,financeWindows.length);
 for(const opened of financeWindows){
  positive(opened.permission);assert.equal(opened.profileId,ledger.actors.reader.profileId);assert.equal(opened.companyId,ledger.companyIds[0]);assert.equal(typeof opened.originalActive,'boolean');assert.equal(typeof opened.created,'boolean');
  const closed=intents.filter(value=>value.operation==='Close exact automatic-reminder finance-view-only window'&&value.permission===opened.permission),bound=intents.filter(value=>value.operation==='Bind exact automatic-reminder finance-view-only window'&&value.permission===opened.permission);
  assert.equal(closed.length,1);assert.equal(closed[0].originalActive,opened.originalActive);
  if(opened.created)exact('permissions',opened.permission);
  if(!opened.originalActive)assert.ok(ledger.rows.some(row=>row.table==='permissions'&&row.id===opened.permission),'Inactive finance definition lacks synthetic ownership');
  add(`finance-view definition ${opened.permission}: original active flag restored`,`exists(select 1 from public.permissions where id=${opened.permission} and permission_code='dms.documents.view.finance' and is_active=${opened.originalActive})`);
  if(closed[0].role!==null){exact('roles',closed[0].role);add(`finance-view role ${closed[0].role}: exact one-permission role retired`,`exists(select 1 from public.roles where id=${closed[0].role} and not is_active) and (select count(*) from public.role_permissions where role_id=${closed[0].role})=1 and exists(select 1 from public.role_permissions where role_id=${closed[0].role} and permission_id=${opened.permission})`);}
  if(closed[0].assignment!==null){
   assert.equal(bound.length,1);assert.equal(bound[0].role,closed[0].role);assert.equal(bound[0].assignment,closed[0].assignment);exact('user_roles',closed[0].assignment);
   add(`finance-view assignment ${closed[0].assignment}: exact company-only binding retired`,`exists(select 1 from public.user_roles where id=${closed[0].assignment} and role_id=${closed[0].role} and user_profile_id=${opened.profileId} and owner_company_id=${opened.companyId} and branch_id is null and not is_active)`);
  }else assert.equal(bound.length,0);
 }
 for(const change of intents.filter(value=>value.operation==='Automatic reminder wait revokes only exact tracked principal/session; restore original field finally')){
  const session=m.authSessions.find(value=>value.actor==='reader'&&value.profileId===change.profileId&&value.sessionId===change.sessionId&&value.authUserId===change.authUserId);assert.ok(session);uuid(change.sessionId);uuid(change.authUserId);positive(change.profileId);
  assert.ok(['session','principal'].includes(change.kind));
  if(change.kind==='principal'){assert.equal(change.original,'active');add(`principal ${change.profileId}: original status restored`,`exists(select 1 from public.user_profiles where id=${change.profileId} and auth_user_id=${quote(change.authUserId)}::uuid and status=${quote(change.original)})`);}
  add(`session ${change.sessionId}: retired by final exact Auth cleanup`,`not exists(select 1 from auth.sessions where id=${quote(change.sessionId)}::uuid) and not exists(select 1 from auth.refresh_tokens where session_id=${quote(change.sessionId)}::uuid)`);
 }
 for(const change of intents.filter(value=>value.operation==='Change only exact own completion audit fact during reminder wait; restore original JSON finally')){
  exact('audit_logs',change.auditId);exact('dms_documents',change.documentId);uuid(change.operationId);assert.equal(change.original.operation_id,change.operationId);assert.equal(change.original.event,'single_file_ai_approval_completed');
  add(`audit ${change.auditId}: original completion fact restored`,`exists(select 1 from public.audit_logs where id=${change.auditId} and entity_name='dms_documents' and entity_id=${change.documentId} and new_values=${quote(JSON.stringify(change.original))}::jsonb)`);
 }
 for(const change of intents.filter(value=>value.operation==='Rollback-only synthetic employee evidence rows; no committed HR fixture')){
  assert.equal(change.employeeCode,m.marker+'ROLLBACKMEDICAL');exact('dms_documents',change.documentId);
  add('rollback-only employee evidence: exact synthetic employee remains absent',`not exists(select 1 from public.employees where employee_code=${quote(change.employeeCode)})`);
 }
 const raceIntents=intents.filter(value=>value.operation==='Automatic reminder exact staged-race observation').map(value=>{const event={...value};delete event.marker;delete event.operation;return event;});
 assert.deepEqual(m.automaticReminderRaces,raceIntents);
 const tags=[...new Set(m.automaticReminderRaces.map(event=>event.tag))];
 for(const tag of tags){
  assert.match(tag,/^f06-(?:auto-reminder|ar)-[a-f0-9-]{36}$/);const events=m.automaticReminderRaces.filter(event=>event.tag===tag);
  assert.equal(events.filter(event=>event.stage==='intent').length,1);assert.ok(events.every(event=>event.containerId===containerId),'Race container differs from current guarded target');
  for(const side of ['holder','contender']){
   const identity=events.filter(event=>event.stage==='identity'&&event.side===side),cleanup=events.filter(event=>event.stage==='cleanup'&&event.side===side);assert.equal(identity.length,1);assert.equal(cleanup.length,1);
   const entry=identity[0];positive(entry.pid);assert.equal(entry.applicationName,tag+'-'+side);assert.equal(typeof entry.backendStart,'string');assert.equal(cleanup[0].absent,true);
   for(const key of ['pid','backendStart','applicationName'])assert.equal(cleanup[0][key],entry[key]);
   if(tag.startsWith('f06-ar-')){assert.equal(entry.actualApplicationName,entry.applicationName);assert.ok(Buffer.byteLength(entry.applicationName,'utf8')<=63);assert.equal(cleanup[0].actualApplicationName,entry.actualApplicationName);}
   else assert.equal(Object.hasOwn(entry,'actualApplicationName'),false,'Historical long tags recorded only expected application names');
   add(`race ${side} ${entry.pid}: exact backend absent`,`not exists(select 1 from pg_stat_activity where pid=${entry.pid} and backend_start=${quote(entry.backendStart)}::timestamptz)`);
  }
 }
 const observations=checks.length?JSON.parse(sql(`begin transaction read only;set local statement_timeout='20s';select json_agg(result) from (${checks.join(' union all ')}) result;rollback;`)):[];
 assert.equal(observations.length,checks.length);const failures=[...m.cleanupFailures,...observations.filter(value=>value.ok!==true).map(value=>value.name)];
 runs.push({file,marker:m.marker,manifestSha256:createHash('sha256').update(bytes).digest('hex'),rollbackProbes:m.automaticReminderProbes.length,rollbackFingerprintClaims:'Historical exact before/after observations only, not independently reconstructed',stagedRaces:tags.length,raceNameAttribution:tags.map(tag=>({tag,kind:tag.startsWith('f06-ar-')?'echoed-actual-name':'historical-expected-name-only'})),observations,failures,verified:failures.length===0,casePassClaim:false});
}
assert.ok(runs.length,'No automatic-reminder manifests; historical reports are not new acceptance');
const result={at:new Date().toISOString(),containerId,runs,historicalFiles,allVerified:runs.every(run=>run.verified),repairs:0,businessWrites:0,providerCalls:0,storageCalls:0,limitations:[
 'Supplement only. Run the unchanged original AI resource checker for allocation/proof/history/roles/Storage/session and older-manifest reconciliation.',
 'No source test, catalogue ACL observation or resource reconciliation establishes actual case success, the original main-runtime direct-denial case, full runtime image safety, browser acceptance, or publication approval.',
 'Rollback fingerprints and race checkpoint events are matched historical observations. Exact current schedule/restoration/backend absence is checked independently; no claim reconstructs past authority.',
 'Older manifests are listed, never rewritten or exempted from the historical checker. Failed and partial runs remain evidence and cannot become passing cases from current absence.',
 'Staged-race absence uses exact PID/backend_start, never a potentially truncated application_name. Old f06-auto-reminder tags recorded expected names only and do not prove actual name attribution or a passing AR20. New f06-ar tags require echoed actualApplicationName equality and the PostgreSQL 63-byte limit. Legacy wait helpers retain their separate weaker SQL-fragment cleanup limitations.'
]};
const output=`AUTOMATIC_REMINDER_RESOURCE_CHECK_${Date.now()}_${randomUUID()}.json`;
fs.writeFileSync(path.join(evidence,output),JSON.stringify(result,null,2),{flag:'wx'});
console.log(JSON.stringify({output,runs:runs.length,allVerified:result.allVerified,repairs:0,casePassClaim:false}));
assert.equal(result.allVerified,true,'Automatic reminder resource reconciliation failed; no repair attempted');
