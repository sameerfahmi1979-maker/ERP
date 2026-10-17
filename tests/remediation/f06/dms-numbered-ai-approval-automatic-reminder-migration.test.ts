// Source-only contracts. Never import an actual harness, DB/storage helper or application runtime.
// These checks do not establish SQL compilation, RLS behavior, races or platform ACL safety.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';

const basePath='supabase/migrations/20261004193518_f06_numbered_ai_intake_approval.sql';
const migrationPath='supabase/migrations/20261004220907_f06_ai_approval_automatic_reminders.sql';
const baseBytes=fs.readFileSync(basePath);
const normalize=(value:string)=>value.replaceAll('\r\n','\n');
const compact=(value:string)=>value.replace(/\s+/g,' ').trim();
const base=normalize(baseBytes.toString('utf8'));
const sql=normalize(fs.readFileSync(migrationPath,'utf8'));
const executable=sql.replace(/--[^\n]*/g,'');
function body(source:string,name:string){
 const escaped=name.replaceAll('.','\\.');
 const found=source.match(new RegExp(`create (?:or replace )?function ${escaped}\\([\\s\\S]*?end \\$\\$;`,'i'));
 if(!found)throw new Error(`Missing source function: ${name}`);
 return found[0];
}
function between(source:string,start:string,end:string){
 const first=source.indexOf(start),last=source.indexOf(end,first+start.length);
 if(first<0||last<0)throw new Error(`Missing source anchors: ${start} / ${end}`);
 return source.slice(first,last);
}
const complete=body(sql,'erp_private.complete_ai_approval');
const finish=body(sql,'public.finish_numbered_ai_intake');
const oldComplete=body(base,'erp_private.complete_ai_approval');
const oldFinish=body(base,'public.finish_numbered_ai_intake');
const proofLoop=between(complete,' for proof_pass in 1..2 loop',' end loop;');
const nonReminderProof=between(proofLoop,'  select id,document_no','  if proof_pass=1 then');

describe('reviewed automatic-reminder correction against frozen SQL71',()=>{
 it('leaves the accepted SQL71 bytes unchanged and replaces only two existing bodies',()=>{
  expect(createHash('sha256').update(baseBytes).digest('hex')).toBe('af63a8897a38aaf02485f659d29133bdab1f7b53a13e184b2bd087de3ffae31b');
  expect([...sql.matchAll(/create or replace function ([\w.]+)\(/gi)].map(match=>match[1])).toEqual([
   'erp_private.complete_ai_approval','public.finish_numbered_ai_intake',
  ]);
  expect(executable).not.toMatch(/\b(?:create|alter|drop)\s+(?:table|policy|trigger|role|schema|sequence)\b/i);
  expect(sql).toContain("set local lock_timeout='5s';");
  expect(sql).toContain("set local statement_timeout='60s';");
  expect(sql.trim()).toMatch(/^begin;[\s\S]+notify pgrst,'reload schema';\ncommit;$/);
 });

 it('changes effective finish only by the reviewed removal of its reminder loop',()=>{
  const removed=` if nullif(p_request->>'expiryDate','') is not null then
  foreach days in array array[90,60,30,14,7,1] loop
   insert into public.dms_expiry_reminders(document_id,reminder_days_before,reminder_date,status)
    values(target,days,(p_request->>'expiryDate')::date-days,'pending');
  end loop;
 end if;`;
  expect(oldFinish.split(removed)).toHaveLength(2);
  const expected=oldFinish
   .replace('create function public.finish_numbered_ai_intake','create or replace function public.finish_numbered_ai_intake')
   .replace('item jsonb; days integer; metadata jsonb;','item jsonb; metadata jsonb;')
   .replace(removed,' -- The proof-bound completion verifier adds only the fixed automatic\n -- expiry defaults after every other invoker completion fact exists.');
  expect(finish).toBe(expected);
  expect(finish).toContain("security invoker set search_path='' as $$");
  expect(finish).not.toContain('insert into public.dms_expiry_reminders');
  expect(finish).toContain('return erp_private.complete_ai_approval(p_operation,p_request);');
 });

 it('retains private completion ownership and the existing execution boundaries only',()=>{
  expect(complete).toContain("security definer set search_path='' as $$");
  expect(sql).toContain('alter function erp_private.complete_ai_approval(uuid,jsonb) owner to postgres;');
  const grants=[...executable.matchAll(/grant execute on function ([\w.]+)\([^;]+to authenticated;/g)].map(match=>match[1]);
  expect(grants).toEqual(['erp_private.complete_ai_approval','public.finish_numbered_ai_intake']);
  for(const signature of ['erp_private.complete_ai_approval(uuid,jsonb)','public.finish_numbered_ai_intake(uuid,jsonb,text)']){
   expect(sql).toContain(`revoke all on function ${signature} from public,anon,service_role;`);
  }
  expect(executable).not.toMatch(/grant\s+(?:all|insert|update|delete|select)|grant[^;]+to\s+(?:public|anon|service_role)/i);
  expect(executable).not.toMatch(/dms\.admin|dms\.expiry\.(?:manage|dismiss)/);
 });

 it('has no top-level mutation or privilege change outside the reviewed replacements and ACLs',()=>{
  const remaining=sql.replace(complete,'').replace(finish,'').replace(/--[^\n]*/g,'');
  expect(compact(remaining)).toBe(compact(`begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
alter function erp_private.complete_ai_approval(uuid,jsonb) owner to postgres;
revoke all on function erp_private.complete_ai_approval(uuid,jsonb) from public,anon,service_role;
grant execute on function erp_private.complete_ai_approval(uuid,jsonb) to authenticated;
revoke all on function public.finish_numbered_ai_intake(uuid,jsonb,text) from public,anon,service_role;
grant execute on function public.finish_numbered_ai_intake(uuid,jsonb,text) to authenticated;
notify pgrst,'reload schema';
commit;`));
 });

 it('binds the original actor, request JSON and SHA256 before selecting a resource lock',()=>{
  const beforeLock=complete.slice(0,complete.indexOf(' perform id from public.dms_upload_sessions'));
  expect(beforeLock).toContain('actor bigint:=public.current_user_profile_id()');
  expect(beforeLock).toContain('validate_ai_approval_request(p_request,true)');
  expect(beforeLock).toContain('assert_ai_approval_authority(p_request)');
  expect(beforeLock).toContain("h:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex')");
  expect(beforeLock).toContain('where actor_id=actor and operation_id=p_operation');
  expect(beforeLock).toContain('plan.request_json is distinct from p_request or plan.request_hash is distinct from h');
  expect(beforeLock).toContain('source_id:=plan.upload_session_id;');
  expect(complete).not.toMatch(/current_setting|set_config|request\.jwt|auth\.jwt|\bxmin\b|execute\s+format/i);
 });

 it('keeps source before plan locking and current authority/principal after the wait',()=>{
  const sourceLock=complete.indexOf('perform id from public.dms_upload_sessions where id=source_id and deleted_at is null for update;');
  const planLock=complete.indexOf('where actor_id=actor and operation_id=p_operation for update;');
  const replay=complete.indexOf('if plan.result is not null then');
  expect(sourceLock).toBeGreaterThan(-1);expect(planLock).toBeGreaterThan(sourceLock);
  expect(complete.slice(sourceLock,planLock)).toContain('assert_ai_approval_authority(p_request)');
  const afterPlan=complete.slice(planLock,replay);
  expect(afterPlan).toContain('plan.upload_session_id is distinct from source_id');
  expect(afterPlan).toContain('plan.request_json is distinct from p_request or plan.request_hash is distinct from h');
  expect(afterPlan).toContain('assert_ai_approval_authority(p_request)');
  expect(afterPlan).toContain('public.current_user_profile_id() is distinct from actor');
 });

 it('completed replay checks current document visibility without regenerating any child',()=>{
  const replay=between(complete,' if plan.result is not null then',' select * into proof');
  expect(replay).toContain('not coalesce(public.current_user_can_view_dms_document(plan.document_id),false)');
  expect(replay).toContain("return plan.result||jsonb_build_object('replayed',true);");
  expect(replay).not.toMatch(/\b(?:insert|update|delete)\b|from public\.dms_expiry_reminders/i);
  expect(complete.indexOf("return plan.result||jsonb_build_object('replayed',true)")).toBeLessThan(complete.indexOf('insert into public.dms_expiry_reminders'));
 });

 it('locks the exact document after retained copy proof, never replacing subject authority with a definer read',()=>{
  const copy=complete.indexOf('perform erp_private.assert_ai_approval_copy(p_operation,p_request,proof.file_name);');
  const document=complete.indexOf('perform id from public.dms_documents where id=plan.document_id and deleted_at is null for update;');
  expect(copy).toBeGreaterThan(-1);expect(document).toBeGreaterThan(copy);
  expect(document).toBeLessThan(complete.indexOf('for proof_pass in 1..2 loop'));
  expect(proofLoop).toContain('not coalesce(public.current_user_can_view_dms_document(plan.document_id),false)');
  for(const capability of ['upload','edit','preview']){
   expect(proofLoop).toContain(`not coalesce(public.f03_has_document_permission(plan.document_id,'dms.documents.${capability}'),false)`);
  }
  expect(proofLoop.indexOf('current_user_can_view_dms_document')).toBeLessThan(proofLoop.indexOf('select id,document_no'));
  // The predicate must remain the real F03 linked-subject guard, not a copied tenant-only approximation.
  const scope=fs.readFileSync('supabase/migrations/20260923071412_f03_document_scope_and_content_policy.sql','utf8');
  const evidence=fs.readFileSync('supabase/migrations/20260923084150_f03_medical_insurance_and_linked_evidence.sql','utf8');
  expect(scope).toContain("SELECT erp_private.document_permission($1,'dms.documents.view')");
  expect(evidence).toContain('IF NOT erp_private.hr_document_evidence_allowed($1) THEN RETURN false; END IF;');
 });

 it('preserves every non-reminder full completion proof inside both passes',()=>{
  const ranges=[
   [' select x.id,x.version_id into f',' metadata:=erp_private.ai_approval_metadata'],
   [' metadata:=erp_private.ai_approval_metadata'," select coalesce(jsonb_agg(jsonb_build_object('days'"],
   [' if not exists(select 1 from public.dms_upload_sessions',' receipt:=jsonb_build_object'],
  ] as const;
  for(const [start,end] of ranges)expect(compact(nonReminderProof)).toContain(compact(between(oldComplete,start,end)));
  const originalDocument=between(oldComplete,' select id,document_no',' select x.id,x.version_id into f')
   .replace('current_version_id into d','current_version_id,is_archived,expiry_tracking_override into d')
   .replace('if not found or row(', 'if not found or d.is_archived or d.expiry_tracking_override is not null\n   or row(');
  expect(compact(nonReminderProof)).toContain(compact(originalDocument));
  expect(proofLoop).toContain('perform erp_private.assert_ai_approval_copy(p_operation,p_request,proof.file_name);');
  expect(proofLoop).toContain('public.current_user_profile_id() is distinct from actor');
  expect(nonReminderProof).toContain("generation_reason='F06 AI approval '||plan.request_hash");
 });

 it('adds only four fixed reminder columns after every non-reminder fact, never arbitrary browser rows',()=>{
  const insertion=complete.match(/insert into public\.dms_expiry_reminders\(([^)]+)\)\s*([^;]+);/);
  expect(insertion?.[1]).toBe('document_id,reminder_days_before,reminder_date,status');
  expect(compact(insertion?.[2]??'')).toBe("select d.id,schedule.day_offset,d.expiry_date-schedule.day_offset,'pending' from unnest(array[90,60,30,14,7,1]) as schedule(day_offset)");
  expect(complete.match(/insert into public\.dms_expiry_reminders/g)).toHaveLength(1);
  expect(complete.indexOf('insert into public.dms_expiry_reminders')).toBeGreaterThan(complete.indexOf("raise exception 'Approval completion facts incomplete'"));
  expect(complete).not.toMatch(/p_request\s*->>?\s*'(?:reminders|reminder_date|recipients|assigned_to|status)'/);
  expect(complete).not.toMatch(/on conflict|update public\.dms_expiry_reminders|delete from public\.dms_expiry_reminders|exception when/i);
 });

 it('rejects all pre-existing pending schedules and manual suppression rather than repairing or adopting them',()=>{
  const firstPass=between(proofLoop,'  if proof_pass=1 then','  else\n');
  expect(firstPass).toContain('if exists(select 1 from public.dms_expiry_reminders where document_id=d.id) then');
  expect(firstPass).toContain("raise exception 'Approval reminders already exist' using errcode='PT409'");
  expect(firstPass).toContain('if d.expiry_date is not null then');
  expect(nonReminderProof).toContain('d.is_archived or d.expiry_tracking_override is not null');
  expect(firstPass.indexOf('assert_ai_approval_authority')).toBeLessThan(firstPass.indexOf('insert into public.dms_expiry_reminders'));
  expect(firstPass).toContain('public.current_user_profile_id() is distinct from actor');
  expect(firstPass).toContain('not coalesce(public.current_user_can_view_dms_document(d.id),false)');
 });

 it('repeats the full proof after an insertion wait then checks the exact six-or-zero set',()=>{
  expect(complete).toContain('for proof_pass in 1..2 loop');
  const secondPass=proofLoop.slice(proofLoop.indexOf('  else\n')+7);
  const originalReminder=between(oldComplete," select coalesce(jsonb_agg(jsonb_build_object('days'",' if not exists(select 1 from public.dms_upload_sessions');
  expect(compact(secondPass)).toContain(compact(originalReminder));
  expect(complete.indexOf('end loop;')).toBeLessThan(complete.indexOf("receipt:=jsonb_build_object('documentId'"));
 });

 it('writes only automatic defaults and private receipt bookkeeping with late actor and subject rechecks',()=>{
  const targets=[...complete.matchAll(/\b(?:insert into|update|delete from)\s+((?:public|erp_private)\.[a-z_]+)/gi)].map(match=>match[1]);
  expect(targets).toEqual(['public.dms_expiry_reminders','erp_private.ai_approval_plans']);
  const late=complete.slice(complete.indexOf('update erp_private.ai_approval_plans'));
  expect(late).toContain('where actor_id=actor and operation_id=p_operation and request_hash=h and result is null');
  expect(late).toContain("if affected<>1 then raise exception 'Approval receipt unavailable'");
  expect(late).toContain('assert_ai_approval_authority(p_request)');
  expect(late).toContain('public.current_user_profile_id() is distinct from actor');
  expect(late).toContain('not coalesce(public.current_user_can_view_dms_document(d.id),false)');
  expect(late.indexOf('current_user_can_view_dms_document')).toBeLessThan(late.indexOf('return receipt;'));
 });

 it('does not change legacy batch approval, request validation, allocator, storage attestation or notification policy',()=>{
  for(const unchanged of ['approve_dms_ai_intake','validate_ai_approval_request','ai_approval_plan','allocate_numbering_reference','attest_numbered_ai_intake','assert_ai_approval_authority']){
   expect(sql).not.toMatch(new RegExp(`create (?:or replace )?function (?:public|erp_private)\\.${unchanged}\\(`,'i'));
  }
  expect(executable).not.toMatch(/erp_dms_notification_settings|dms_notification_queue|recipients_json|notification_status|assigned_to/);
  expect(executable).not.toMatch(/grant[^;]+(?:dms\.admin|dms\.expiry)/);
 });
});
