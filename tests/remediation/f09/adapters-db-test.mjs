// Component integration only: historical DDL, unrelated foreign keys omitted.
// Never runs against a remote DB or another application's local stack.
import {execFileSync,spawn} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const container='algt-f09-synthetic', database='f09_integration';
const inspected=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
assert.equal(inspected.Name,'/'+container);
assert.equal(inspected.HostConfig.NetworkMode,'none');
assert.equal(Object.keys(inspected.HostConfig.PortBindings??{}).length,0);
const args=(db=database)=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db];
const sql=(s,db=database)=>execFileSync('docker',args(db),{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const parallel=s=>new Promise((resolve,reject)=>{
 const p=spawn('docker',args(),{stdio:['pipe','pipe','pipe']});let out='',err='';
 p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('error',reject);
 p.on('exit',c=>c?reject(Error(err)):resolve(out.trim()));p.stdin.end(s);
});
if(sql(`select count(*) from pg_database where datname='${database}';`,'postgres')==='0')sql(`create database ${database};`,'postgres');
// Exact dedicated test DB, verified network isolation; no production/user records.
sql('drop schema public cascade; create schema public; grant usage on schema public to service_role,anon,authenticated;');
function ddl(file,name){
 const source=fs.readFileSync('supabase/migrations/'+file,'utf8');
 const match=source.match(new RegExp('CREATE TABLE (?:IF NOT EXISTS )?(?:public\\.)?'+name+' \\([\\s\\S]*?\\n\\);'));
 assert.ok(match,'Historical DDL '+name);
 return match[0].replace(/ REFERENCES (?:public\.)?\w+\(id\)(?: ON DELETE (?:CASCADE|SET NULL))?/gi,'');
}
sql(ddl('20260615001626_erp_notifications_1_global_notification_email_delivery_engine.sql','erp_email_queue'));
sql(ddl('20260619160000_report_5_email_scheduling_history_security_uat.sql','erp_report_schedules'));
sql(ddl('20260726180000_output_7_schedule_runs.sql','erp_report_schedule_runs'));
sql(ddl('20260619130000_report_2_global_report_engine_registry_security_foundation.sql','erp_report_delivery_logs'));
sql(ddl('20260615001626_erp_notifications_1_global_notification_email_delivery_engine.sql','erp_notification_delivery_logs'));
sql('grant select,insert,update on all tables in schema public to service_role; grant usage on all sequences in schema public to service_role; grant all on public.erp_email_queue to authenticated; alter default privileges in schema public grant all on tables to anon,authenticated,service_role;');
let legacyQueueId;
for(const f of ['20260930095218_f09_email_queue_leases.sql','20260930100400_f09_atomic_schedule_slot.sql','20260930102553_f09_delivery_adapter_integration.sql']){
 if(f.includes('delivery_adapter_integration'))legacyQueueId=+sql("insert into public.erp_email_queue(source_module,to_emails,subject) values('F09_TEST',array['synthetic@example.invalid'],'Unreconciled synthetic legacy mail') returning id;");
 sql(fs.readFileSync('supabase/migrations/'+f,'utf8'));
}
const owner='00000000-0000-4000-8000-000000000001',request='00000000-0000-4000-8000-000000000099';
let checks=0;
const check=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
const machine=s=>sql('set role service_role;'+s);
const schedule=()=>+sql(`insert into public.erp_report_schedules(report_id,created_by,schedule_name,frequency,next_run_at,recipient_to)
 values(1,1,'F09 synthetic','daily',now()-interval '1 day',array['synthetic@example.invalid']) returning id;`);
const reserve=id=>+machine(`select public.f09_manual_schedule_run(${id},'${request}');`);
const enqueue=id=>+machine(`select public.f09_enqueue_schedule_run(${id});`);
const row=id=>JSON.parse(sql(`select row_to_json(q) from public.erp_email_queue q where id=${id};`));
const run=id=>JSON.parse(sql(`select row_to_json(r) from public.erp_report_schedule_runs r where id=${id};`));
const claim=id=>JSON.parse(machine(`select row_to_json(q) from public.f09_claim_email('${owner}',${id},null) q;`));
const dispatch=q=>machine(`select public.f09_begin_email_dispatch(${q.id},'${owner}','${q.lease_token}');`);
const finish=(q,outcome)=>machine(`select public.f09_finish_email(${q.id},'${owner}','${q.lease_token}','${outcome}',null);`);
const expire=q=>{sql(`update public.erp_email_queue set lease_expires_at=now()-interval '1 second' where id=${q.id};`);machine('select public.f09_reap_email_leases(100);');};
check('cutover holds unresolved legacy mail without replay or history deletion',()=>{
 assert.ok(row(legacyQueueId).paused_at);assert.equal(row(legacyQueueId).status,'pending');
 assert.equal(machine(`select id from public.f09_claim_email('${owner}',${legacyQueueId},null);`),'');
});
check('browser writes and every F09 RPC denied, including column grants',()=>{
 assert.equal(sql("select has_table_privilege('authenticated','public.erp_email_queue','insert') or has_column_privilege('authenticated','public.erp_email_queue','status','update');"),'f');
 assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'f09_%' and has_function_privilege('authenticated',p.oid,'execute');"),'0');
 assert.throws(()=>sql("set role authenticated;insert into public.erp_email_queue(source_module,to_emails,subject) values('F09_TEST',array['synthetic@example.invalid'],'forged');"));
});
const s=schedule();
const concurrent=await Promise.all(Array.from({length:6},()=>parallel(`set role service_role;select public.f09_manual_schedule_run(${s},'${request}');`)));
check('six simultaneous run-now requests share one durable run',()=>{assert.equal(new Set(concurrent).size,1);});
const rid=+concurrent[0];
const queues=await Promise.all(Array.from({length:6},()=>parallel(`set role service_role;select public.f09_enqueue_schedule_run(${rid});`)));
check('six enqueue attempts create one queue intent and retain creator/source',()=>{
 assert.equal(new Set(queues).size,1);const q=row(+queues[0]);assert.equal(q.created_by,1);assert.equal(q.source_entity_id,s);assert.equal(run(rid).status,'queued');
});
check('legacy unresolved/succeeded runs are never adopted or replayed',()=>{
 for(const status of ['failed_retryable','succeeded','running']){
 const legacy=sql(`insert into public.erp_report_schedule_runs(schedule_id,scheduled_for,run_key,status,delivery_engine) values(${s},now(),'legacy-${status}','${status}',null) returning id;`);
 assert.equal(enqueue(legacy),0);assert.equal(run(legacy).status,status);
 }
});
check('queued payload and creator cannot be changed, even by a service writer',()=>{
 for(const patch of ["created_by=2","to_emails=array['changed@example.invalid']","subject='changed'","max_attempts=99"]){
 assert.throws(()=>machine(`update public.erp_email_queue set ${patch} where id=${queues[0]};`));
 }
});
check('recipient/config change after preparation blocks dispatch',()=>{
 const q=claim(+queues[0]);sql(`update public.erp_report_schedules set recipient_to=array['changed@example.invalid'] where id=${s};`);
 assert.equal(dispatch(q),'f');assert.equal(row(q.id).dispatch_started_at,null);finish(q,'cancelled');
});
check('deactivated schedule cannot dispatch or create a new run',()=>{
 const id=schedule(),r=reserve(id),q=claim(enqueue(r));sql(`update public.erp_report_schedules set is_active=false where id=${id};`);
 assert.equal(dispatch(q),'f');assert.equal(reserve(id),0);finish(q,'cancelled');
});
check('prepared report metadata is lease-fenced and acceptance is atomic with history',()=>{
 const r=reserve(schedule()),q=claim(enqueue(r));
 assert.equal(machine(`select public.f09_record_report_preparation(${q.id},'${owner}','${request}',77,'synthetic.csv',3);`),'f');
 assert.equal(machine(`select public.f09_record_report_preparation(${q.id},'${owner}','${q.lease_token}',77,'synthetic.csv',3);`),'t');
 assert.equal(dispatch(q),'t');assert.equal(finish(q,'accepted'),'t');
 assert.equal(run(r).status,'succeeded');assert.ok(run(r).delivery_log_id);
 assert.equal(sql(`select last_status from public.erp_report_schedules where id=${run(r).schedule_id};`),'success');
 assert.equal(sql(`select delivery_status from public.erp_report_delivery_logs where email_queue_id=${q.id};`),'provider_accepted');
 assert.equal(sql(`select status from public.erp_notification_delivery_logs where email_queue_id=${q.id};`),'provider_accepted');
 assert.equal(sql(`select count(*) from public.erp_email_attempt_events where queue_id=${q.id} and event='accepted';`),'1');
 assert.equal(finish(q,'accepted'),'f');
});
check('history write failure after dispatch rolls back completion; recovery holds unknown',()=>{
 const r=reserve(schedule()),q=claim(enqueue(r));dispatch(q);
 sql("create function public.reject_f09_log() returns trigger language plpgsql as $$begin raise exception 'synthetic log fault';end$$;create trigger reject_f09_log before insert on public.erp_report_delivery_logs for each row execute function public.reject_f09_log();");
 try{assert.throws(()=>finish(q,'accepted'));assert.equal(row(q.id).status,'processing');}
 finally{sql('drop trigger reject_f09_log on public.erp_report_delivery_logs;drop function public.reject_f09_log();');}
 expire(q);assert.equal(row(q.id).status,'delivery_unknown');assert.equal(run(r).status,'failed_terminal');
 assert.equal(sql(`select delivery_status from public.erp_report_delivery_logs where email_queue_id=${q.id};`),'delivery_unknown');
 assert.equal(machine(`select public.f09_retry_email(${q.id});`),'f');
});
check('cancellation fences a preparing worker, but cannot cancel dispatched mail',()=>{
 const first=claim(enqueue(reserve(schedule())));
 assert.equal(machine(`select public.f09_cancel_email(${first.id});`),'t');assert.equal(dispatch(first),'f');
 const second=claim(enqueue(reserve(schedule())));dispatch(second);
 assert.equal(machine(`select public.f09_cancel_email(${second.id});`),'f');finish(second,'unknown');
});
check('manual retry preserves cooldown, consumed budget and terminal state',()=>{
 const q=claim(enqueue(reserve(schedule())));finish(q,'retry');
 const before=row(q.id);assert.equal(machine(`select public.f09_retry_email(${q.id});`),'t');
 const after=row(q.id);assert.equal(after.next_retry_at,before.next_retry_at);assert.equal(after.attempt_count,before.attempt_count);
 assert.equal(machine(`select id from public.f09_claim_email('${owner}',${q.id},null);`),'');
});
check('soft-deleted intents still deduplicate and are never silently recreated',()=>{
 const r=reserve(schedule()),id=enqueue(r);sql(`update public.erp_email_queue set deleted_at=now() where id=${id};`);
 assert.equal(enqueue(r),id);assert.equal(machine(`select id from public.f09_claim_email('${owner}',${id},null);`),'');
});
check('reservation response loss repairs into one intent without a second pointer advance',()=>{
 const id=schedule();const s=JSON.parse(sql(`select row_to_json(s) from public.erp_report_schedules s where id=${id};`));
 const r=machine(`select public.f09_reserve_schedule_slot(${id},'${s.next_run_at}','${s.updated_at}',now()+interval '1 day');`);
 const first=enqueue(r);assert.ok(first);assert.equal(enqueue(r),first);
 assert.equal(sql(`select delivery_engine from public.erp_report_schedule_runs where id=${r};`),'f09');
});
sql('truncate public.erp_notification_delivery_logs,public.erp_report_delivery_logs,public.erp_email_attempt_events,public.erp_email_queue,public.erp_report_schedule_runs,public.erp_report_schedules restart identity;');
console.log(JSON.stringify({checks,database,container,network:'none',remainingRecords:0,realEmailsSent:0}));
