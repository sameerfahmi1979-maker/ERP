// Only this network-isolated, disposable container/database is accepted.
import {execFileSync,spawn} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const container='algt-f09-synthetic', database='f09_synthetic';
const inspected=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
assert.equal(inspected.Name,'/'+container);
assert.equal(inspected.HostConfig.NetworkMode,'none','Refuse network-connected DB');
assert.equal(Object.keys(inspected.HostConfig.PortBindings??{}).length,0,'Refuse published DB');
const args=(db=database)=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db];
function sql(s,db=database){return execFileSync('docker',args(db),{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();}
function parallelSql(s){return new Promise((resolve,reject)=>{
 const child=spawn('docker',args(),{stdio:['pipe','pipe','pipe']});let out='',err='';
 child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);
 child.on('error',reject);child.on('exit',code=>code?reject(Error(err)):resolve(out.trim()));child.stdin.end(s);
});}
const owner='00000000-0000-4000-8000-000000000001', other='00000000-0000-4000-8000-000000000002';
const checks=[];
function check(name,fn){fn();checks.push(name);console.log('PASS '+name);}
function add(extra=''){return +sql(`insert into public.erp_email_queue(source_module,to_emails,subject,text_body${extra?', '+extra.split('|')[0]:''}) values('F09_TEST',array['synthetic@example.invalid'],'F09 synthetic','No delivery'${extra?', '+extra.split('|')[1]:''}) returning id;`);}
function claim(id){const s=sql(`set role service_role;select row_to_json(q) from public.f09_claim_email('${owner}',${id},null) q;`);return s?JSON.parse(s):null;}
function finish(q,outcome,token=q.lease_token,retry='null'){return sql(`set role service_role;select public.f09_finish_email(${q.id},'${owner}','${token}','${outcome}',${retry});`);}
function dispatch(q){return sql(`set role service_role;select public.f09_begin_email_dispatch(${q.id},'${owner}','${q.lease_token}');`);}
function row(id){return JSON.parse(sql(`select row_to_json(q) from public.erp_email_queue q where id=${id};`));}
function expire(id){sql(`update public.erp_email_queue set lease_expires_at=clock_timestamp()-interval '1 second' where id=${id};set role service_role;select public.f09_reap_email_leases(100);`);}
function cleanup(){sql('truncate public.erp_email_attempt_events,public.erp_email_queue restart identity;');}

(async()=>{
 if(sql(`select count(*) from pg_database where datname='${database}';`,'postgres')==='0')sql(`create database ${database};`,'postgres');
 if(sql("select to_regclass('public.erp_email_queue') is null;")==='t'){
   sql(`do $$begin if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls;end if;
    if not exists(select from pg_roles where rolname='anon') then create role anon nologin;end if;
    if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;end$$;`);
   const baseline=fs.readFileSync('supabase/migrations/20260615001626_erp_notifications_1_global_notification_email_delivery_engine.sql','utf8');
   // Use actual historical queue DDL; unrelated foreign keys alone are omitted.
   const queue=baseline.match(/CREATE TABLE IF NOT EXISTS public\.erp_email_queue \([\s\S]*?\n\);/)[0].replace(/ REFERENCES public\.\w+\(id\)/g,'');
   sql(queue+`\nalter table public.erp_email_queue enable row level security;grant usage on schema public to service_role;grant select,insert,update on public.erp_email_queue to service_role;grant usage on sequence public.erp_email_queue_id_seq to service_role;
     alter default privileges in schema public grant all on tables to anon,authenticated,service_role;`);
   sql(fs.readFileSync('supabase/migrations/20260930095218_f09_email_queue_leases.sql','utf8'));
 }
 cleanup();
 check('machine-only RPC privileges and event RLS',()=>{
   const values=JSON.parse(sql(`select json_build_object('anon',has_function_privilege('anon','public.f09_claim_email(uuid,bigint,text)','execute'),'user',has_function_privilege('authenticated','public.f09_finish_email(bigint,uuid,uuid,text,timestamp with time zone)','execute'),'service',has_function_privilege('service_role','public.f09_claim_email(uuid,bigint,text)','execute'),'rls',(select relrowsecurity from pg_class where oid='public.erp_email_attempt_events'::regclass),'definer',(select bool_or(prosecdef) from pg_proc where proname like 'f09_%'));`));
   assert.deepEqual(values,{anon:false,user:false,service:true,rls:true,definer:false});
   assert.throws(()=>sql(`set role authenticated;select public.f09_claim_email('${owner}',null,null);`));
   assert.throws(()=>sql('set role service_role;delete from public.erp_email_attempt_events;'));
 });
 check('future, backoff, paused, deleted, cancelled, exhausted and failed rows are ineligible',()=>{
   for(const extra of ["scheduled_for|now()+interval '1 day'","next_retry_at|now()+interval '1 hour'","paused_at|now()","deleted_at|now()","cancelled_at|now()","attempt_count,max_attempts|3,3","status|'failed'"]){assert.equal(claim(add(extra)),null);}
 });
 cleanup();
 const one=add(); const claimSql=`begin;set role service_role;select row_to_json(q) from public.f09_claim_email('${owner}',${one},null) q;select pg_sleep(0.2);commit;`;
 const competing=await Promise.all(Array.from({length:8},()=>parallelSql(claimSql)));
 check('eight independent DB sessions acquire exactly one claim for one row',()=>{
   assert.equal(competing.filter(Boolean).length,1);assert.equal(row(one).attempt_count,1);
 });
 cleanup(); for(let i=0;i<5;i++)add();
 const batch=await Promise.all(Array.from({length:8},()=>parallelSql(`begin;set role service_role;select id from public.f09_claim_email('${owner}',null,'F09_TEST');select pg_sleep(0.2);commit;`)));
 check('SKIP LOCKED distributes five rows across competing workers without duplicates',()=>{
   const ids=batch.filter(Boolean);assert.equal(ids.length,5);assert.equal(new Set(ids).size,5);
 });
 cleanup();
 check('stale token and wrong owner cannot dispatch or complete',()=>{
   const q=claim(add()); assert.equal(finish(q,'retry',other),'f');
   assert.equal(sql(`set role service_role;select public.f09_begin_email_dispatch(${q.id},'${other}','${q.lease_token}');`),'f');
   assert.equal(row(q.id).status,'processing');
 });
 check('dispatch marker is one-shot; accepted outcome and events commit atomically',()=>{
   const q=claim(add());assert.equal(dispatch(q),'t');assert.equal(dispatch(q),'f');assert.equal(finish(q,'accepted'),'t');
   assert.equal(row(q.id).delivery_state,'provider_accepted');assert.equal(claim(q.id),null);
   assert.equal(sql(`select string_agg(event,',' order by id) from public.erp_email_attempt_events where queue_id=${q.id};`),'claimed,dispatching,accepted');
 });
 check('acceptance without dispatch is refused and does not mutate state',()=>{
   const q=claim(add());assert.throws(()=>finish(q,'accepted'));assert.equal(row(q.id).status,'processing');
 });
 check('Retry-After is honoured above backoff; immediate retry is denied',()=>{
   const q=claim(add());const future='2099-01-01T00:00:00Z';assert.equal(finish(q,'retry',q.lease_token,`'${future}'`),'t');
   assert.equal(Date.parse(row(q.id).next_retry_at),Date.parse(future));assert.equal(claim(q.id),null);
 });
 check('exhausted attempt becomes terminal, not an unbounded pending retry',()=>{
   const q=claim(add('max_attempts|1'));assert.equal(finish(q,'retry'),'t');assert.equal(row(q.id).status,'failed');assert.equal(claim(q.id),null);
 });
 check('pre-dispatch crash consumes budget and fences stale completion after reclaim',()=>{
   const q=claim(add());expire(q.id);assert.equal(row(q.id).status,'pending');assert.equal(claim(q.id),null);
   sql(`update public.erp_email_queue set next_retry_at=now()-interval '1 second' where id=${q.id};`);
   const newer=claim(q.id);assert.equal(newer.attempt_count,2);assert.notEqual(newer.lease_token,q.lease_token);assert.equal(finish(q,'retry'),'f');
 });
 check('repeated pre-dispatch crashes exhaust the fixed claim budget',()=>{
   const q=claim(add('max_attempts|1'));expire(q.id);assert.equal(row(q.id).status,'failed');assert.equal(claim(q.id),null);
 });
 check('post-dispatch crash is unknown and cannot be automatically reclaimed',()=>{
   const q=claim(add());dispatch(q);expire(q.id);assert.equal(row(q.id).status,'delivery_unknown');assert.equal(claim(q.id),null);assert.equal(finish(q,'accepted'),'f');
 });
 check('expired worker cannot begin dispatch even before the reaper runs',()=>{
   const q=claim(add());sql(`update public.erp_email_queue set lease_expires_at=now()-interval '1 second' where id=${q.id};`);assert.equal(dispatch(q),'f');
 });
 check('cancellation before dispatch blocks provider call and cancels cleanly',()=>{
   const q=claim(add());sql(`update public.erp_email_queue set cancelled_at=now() where id=${q.id};`);assert.equal(dispatch(q),'f');assert.equal(finish(q,'cancelled'),'t');
 });
 check('cancel after dispatch is refused; unknown remains nonretryable',()=>{
   const q=claim(add());dispatch(q);assert.throws(()=>finish(q,'cancelled'));assert.equal(finish(q,'unknown'),'t');assert.equal(claim(q.id),null);
 });
 check('invalid outcome and null/out-of-range reaper limit fail closed',()=>{
   const q=claim(add());assert.throws(()=>finish(q,'bogus'));
   for(const n of ['null','0','501'])assert.throws(()=>sql(`set role service_role;select public.f09_reap_email_leases(${n});`));
 });
 check('logical intent key deduplicates even across soft deletion',()=>{
   const id=add("intent_key|'F09-intent'");sql(`update public.erp_email_queue set deleted_at=now() where id=${id};`);assert.throws(()=>add("intent_key|'F09-intent'"));
 });
 check('terminal rows do not starve an eligible later row',()=>{
   cleanup();for(let i=0;i<10;i++)add('attempt_count,max_attempts|3,3');const id=add();assert.equal(claim(null).id,id);
 });
 cleanup();
 if(sql("select to_regclass('public.erp_report_schedules') is null;")==='t'){
   const text=fs.readFileSync('supabase/migrations/20260619160000_report_5_email_scheduling_history_security_uat.sql','utf8');
   const ddl=text.match(/CREATE TABLE IF NOT EXISTS public\.erp_report_schedules \([\s\S]*?\n\);/)[0];
   const withoutFks=s=>s.replace(/\s+REFERENCES (?:public\.)?\w+\(id\)(?: ON DELETE CASCADE)?/g,'');
   sql(withoutFks(ddl));
   sql(withoutFks(fs.readFileSync('supabase/migrations/20260726180000_output_7_schedule_runs.sql','utf8')));
   sql('grant select,insert,update on public.erp_report_schedules,public.erp_report_schedule_runs to service_role;grant usage on sequence public.erp_report_schedule_runs_id_seq to service_role;');
   sql(fs.readFileSync('supabase/migrations/20260930100400_f09_atomic_schedule_slot.sql','utf8'));
 }
 sql('truncate public.erp_report_schedule_runs,public.erp_report_schedules restart identity;');
 const schedule=(name='F09 synthetic')=>JSON.parse(sql(`insert into public.erp_report_schedules(report_id,created_by,schedule_name,frequency,next_run_at) values(1,1,'${name}','daily','2026-01-01T07:00:00Z') returning row_to_json(erp_report_schedules);`));
 const reserveSql=(s,next="'2026-01-02T07:00:00Z'")=>`set role service_role;select public.f09_reserve_schedule_slot(${s.id},'${s.next_run_at}','${s.updated_at}',${next});`;
 check('schedule slot RPC denied to ordinary users',()=>{
   assert.equal(sql("select has_function_privilege('authenticated','public.f09_reserve_schedule_slot(bigint,timestamptz,timestamptz,timestamptz)','execute');"),'f');
 });
 const scheduled=schedule();
 const slotResults=await Promise.all(Array.from({length:6},()=>parallelSql(reserveSql(scheduled))));
 check('six competing schedule reservations create and advance exactly one slot',()=>{
   assert.equal(slotResults.filter(Boolean).length,1);
   assert.equal(sql(`select count(*) from public.erp_report_schedule_runs where schedule_id=${scheduled.id};`),'1');
   assert.equal(Date.parse(sql(`select next_run_at from public.erp_report_schedules where id=${scheduled.id};`)),Date.parse('2026-01-02T07:00:00Z'));
 });
 check('stale schedule snapshot and invalid next pointer cannot reserve',()=>{
   const s=schedule();sql(`update public.erp_report_schedules set updated_at=now()+interval '1 second' where id=${s.id};`);
   assert.equal(sql(reserveSql(s)),'');assert.throws(()=>sql(reserveSql(s,'null')));
   assert.throws(()=>sql(reserveSql(s,"'2026-01-01T07:00:00Z'")));
 });
 check('pointer update failure rolls back run insertion; other schedules still reserve',()=>{
   sql(`create or replace function public.f09_test_reject_pointer() returns trigger language plpgsql as $$begin if new.schedule_name='F09 reject' then raise exception 'synthetic pointer write failure';end if;return new;end$$;
     create trigger f09_test_reject_pointer before update on public.erp_report_schedules for each row execute function public.f09_test_reject_pointer();`);
   try{
     const s=schedule('F09 reject');assert.throws(()=>sql(reserveSql(s)));
     assert.equal(sql(`select count(*) from public.erp_report_schedule_runs where schedule_id=${s.id};`),'0');
     assert.ok(sql(reserveSql(schedule())));
   }finally{sql('drop trigger f09_test_reject_pointer on public.erp_report_schedules;drop function public.f09_test_reject_pointer();');}
 });
 check('legacy pointer failure reconciles without rewriting a succeeded run',()=>{
   const s=schedule(),key=`sched-${s.id}-${Date.parse(s.next_run_at)}`;
   const prior=sql(`insert into public.erp_report_schedule_runs(schedule_id,scheduled_for,run_key,status) values(${s.id},'${s.next_run_at}','${key}','succeeded') returning id;`);
   assert.equal(sql(reserveSql(s)),prior);
   assert.equal(sql(`select status from public.erp_report_schedule_runs where id=${prior};`),'succeeded');
   assert.equal(sql(`select count(*) from public.erp_report_schedule_runs where schedule_id=${s.id};`),'1');
 });
 sql('truncate public.erp_report_schedule_runs,public.erp_report_schedules restart identity;');
 console.log(JSON.stringify({database,container,passed:checks.length,remainingSyntheticQueueRows:+sql('select count(*) from public.erp_email_queue;'),remainingSyntheticSchedules:+sql('select count(*) from public.erp_report_schedules;'),network:'none',realEmailsSent:0}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
