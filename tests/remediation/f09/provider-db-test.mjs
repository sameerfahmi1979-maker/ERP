// Component quota tests; full-schema/API rehearsal is separately recorded.
import './adapters-db-test.mjs';
import {execFileSync,spawn} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const container='algt-f09-synthetic', database='f09_integration';
const inspected=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
assert.equal(inspected.HostConfig.NetworkMode,'none');
assert.equal(Object.keys(inspected.HostConfig.PortBindings??{}).length,0);
const args=['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',database];
const sql=s=>execFileSync('docker',args,{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const parallel=s=>new Promise((resolve,reject)=>{
 const p=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let out='',err='';
 p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('error',reject);
 p.on('exit',c=>c?reject(Error(err)):resolve(out.trim()));p.stdin.end(s);
});
const ddl=fs.readFileSync('supabase/migrations/20260614230415_erp_settings_2_email_provider_microsoft_graph.sql','utf8')
 .match(/CREATE TABLE IF NOT EXISTS public.erp_email_provider_configs \([\s\S]*?\n\);/)[0]
 .replace(/ REFERENCES public.user_profiles\(id\)/g,'');
sql(ddl+'grant select,insert,update on public.erp_email_provider_configs to service_role;');
sql(fs.readFileSync('supabase/migrations/20260930111612_f09_provider_admission.sql','utf8'));
const owner='00000000-0000-4000-8000-000000000009';
const machine=s=>'set role service_role;'+s;
const p=+sql("insert into public.erp_email_provider_configs(provider_code,provider_type,provider_name,is_default,is_enabled,throttle_per_minute,daily_send_limit) values('F09_TEST','microsoft_graph','Synthetic',true,true,2,20) returning id;");
const snapshot=()=>sql('select to_jsonb(p) from public.erp_email_provider_configs p where id='+p);
function claim(max=3){
 const id=sql("insert into public.erp_email_queue(source_module,to_emails,subject,text_body,max_attempts) values('SYSTEM',array['f09@example.invalid'],'Synthetic','Synthetic',"+max+") returning id;");
 return JSON.parse(sql(machine("select row_to_json(q) from public.f09_claim_email('"+owner+"',"+id+",null) q;")));
}
const admitSql=(q,expected=snapshot())=>machine("select public.f09_admit_email_dispatch("+q.id+",'"+owner+"','"+q.lease_token+"',"+p+",'"+expected.replaceAll("'","''")+"');");
const admit=q=>sql(admitSql(q));
const finish=(q,kind,after='null')=>sql(machine("select public.f09_finish_provider_email("+q.id+",'"+owner+"','"+q.lease_token+"','"+kind+"',"+after+");"));
const row=q=>JSON.parse(sql('select row_to_json(q) from public.erp_email_queue q where id='+q.id));
let checks=0;
async function check(name,fn){await fn();checks++;console.log('PASS '+name);}
await check('ordinary roles cannot read/write quota state or execute admission',()=>{
 for(const r of ['anon','authenticated'])assert.equal(sql("select has_table_privilege('"+r+"','public.erp_email_provider_dispatches','select') or has_table_privilege('"+r+"','public.erp_email_provider_cooldowns','update') or has_function_privilege('"+r+"','public.f09_admit_email_dispatch(bigint,uuid,uuid,bigint,jsonb)','execute');"),'f');
});
await check('old dispatch RPC fails closed',()=>{const q=claim();assert.equal(sql(machine("select public.f09_begin_email_dispatch("+q.id+",'"+owner+"','"+q.lease_token+"');")),'f');finish(q,'cancelled');});
await check('12 parallel admissions respect exact rolling-minute capacity',async()=>{
 const qs=Array.from({length:12},()=>claim());const results=await Promise.all(qs.map(q=>parallel(admitSql(q))));
 assert.equal(results.filter(r=>r==='allowed').length,2);assert.equal(results.filter(r=>r==='deferred').length,10);
 qs.forEach((q,i)=>{const state=row(q);if(results[i]==='deferred'){assert.equal(state.attempt_count,0);assert.equal(state.status,'pending');assert.equal(state.dispatch_started_at,null);assert.ok(state.next_retry_at);}else finish(q,'accepted');});
});
await check('rolling-day limit prevents send and refunds only its own claim',()=>{
 sql("update public.erp_email_provider_configs set throttle_per_minute=null,daily_send_limit=2 where id="+p);
 const q=claim(1);assert.equal(admit(q),'deferred');assert.equal(row(q).attempt_count,0);
 assert.equal(sql('select count(*) from public.erp_email_attempt_events where queue_id='+q.id+" and event='quota_deferred';"),'1');
 assert.equal(admit(q),'lease_lost');assert.equal(row(q).attempt_count,0);
});
await check('aged admissions release rolling capacity',()=>{
 sql("update public.erp_email_provider_dispatches set admitted_at=clock_timestamp()-interval '25 hours';");
 const q=claim();assert.equal(admit(q),'allowed');finish(q,'accepted');
});
await check('changed provider snapshot denies dispatch',()=>{
 const q=claim(),old=snapshot();sql("update public.erp_email_provider_configs set sender_email='changed@example.invalid' where id="+p);
 assert.equal(sql(admitSql(q,old)),'rejected');assert.equal(row(q).dispatch_started_at,null);finish(q,'cancelled');
});
await check('disabled and invalid-limit providers fail closed',()=>{
 for(const change of ['is_enabled=false','is_enabled=true,throttle_per_minute=0']){
 sql('update public.erp_email_provider_configs set '+change+' where id='+p);
 const q=claim();assert.equal(admit(q),'rejected');finish(q,'cancelled');
 }
 sql('update public.erp_email_provider_configs set throttle_per_minute=null,daily_send_limit=null where id='+p);
});
await check('last-attempt provider throttling still cools down the entire provider',()=>{
 const q=claim(1);assert.equal(admit(q),'allowed');assert.equal(finish(q,'retry',"clock_timestamp()+interval '20 minutes'"),'t');
 assert.equal(row(q).status,'failed');const next=claim();assert.equal(admit(next),'deferred');
 assert.ok(Date.parse(row(next).next_retry_at)>Date.now()+19*60000);
});
await check('stale completion cannot extend cooldown',()=>{
 const before=sql('select retry_at from public.erp_email_provider_cooldowns where provider_id='+p);
 const q=claim();assert.equal(finish({...q,lease_token:owner},'retry',"clock_timestamp()+interval '2 days'"),'f');
 assert.equal(sql('select retry_at from public.erp_email_provider_cooldowns where provider_id='+p),before);finish(q,'cancelled');
});
await check('unlimited valid provider works after cooldown; duplicate dispatch denied',()=>{
 sql('delete from public.erp_email_provider_cooldowns;');
 const q=claim();assert.equal(admit(q),'allowed');assert.equal(admit(q),'lease_lost');finish(q,'unknown');
 assert.equal(row(q).status,'delivery_unknown');
});
await check('confirmed future retry can be cancelled, active or uncertain dispatch cannot',()=>{
 const retry=claim();assert.equal(admit(retry),'allowed');finish(retry,'retry');
 assert.equal(sql(machine('select public.f09_cancel_email('+retry.id+');')),'t');
 assert.equal(row(retry).status,'cancelled');assert.equal(row(retry).attempt_count,1);
 sql('delete from public.erp_email_provider_cooldowns;');
 const active=claim();assert.equal(admit(active),'allowed');
 assert.equal(sql(machine('select public.f09_cancel_email('+active.id+');')),'f');
 finish(active,'unknown');assert.equal(sql(machine('select public.f09_cancel_email('+active.id+');')),'f');
});
sql('truncate public.erp_email_provider_cooldowns,public.erp_email_provider_dispatches,public.erp_notification_delivery_logs,public.erp_report_delivery_logs,public.erp_email_attempt_events,public.erp_email_queue,public.erp_report_schedule_runs,public.erp_report_schedules,public.erp_email_provider_configs restart identity;');
console.log(JSON.stringify({quotaChecks:checks,remainingRecords:0,realEmailsSent:0}));
