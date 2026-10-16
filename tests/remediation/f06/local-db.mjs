import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
export const root=path.resolve(import.meta.dirname,'../../..');
assert.ok(process.env.ALGT_F06_LOCAL_TARGET===undefined||process.env.ALGT_F06_LOCAL_TARGET==='candidate-replay','Unknown F06 local target');
assert.ok(process.env.ALGT_F06_NATIVE_TARGET===undefined||['native77b','native77c'].includes(process.env.ALGT_F06_NATIVE_TARGET),'Unknown F06 native target');
export const native77=process.env.ALGT_F06_NATIVE_TARGET!==undefined;
const corrected=process.env.ALGT_F06_NATIVE_TARGET==='native77c';
assert.ok(!native77||process.env.ALGT_F06_LOCAL_TARGET===undefined,'Never mix native and replay targets');
const replay=process.env.ALGT_F06_LOCAL_TARGET==='candidate-replay';
export const runtime=path.join(root,'CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06',corrected?'native77c':native77?'native77b':replay?'replay':'local');
export const evidence=corrected?'C:/dev/agt-erp/CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06/W38_NATIVE77C':native77?'C:/dev/agt-erp/CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06/W37_NATIVE77B':'C:/dev/agt-erp/CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06';
export const apiOrigin=corrected?'http://127.0.0.1:16881':native77?'http://127.0.0.1:16781':replay?'http://127.0.0.1:16661':'http://127.0.0.1:16621';
export const project=corrected?'algt-f06-native77c':native77?'algt-f06-native77b':replay?'algt-f06-replay':'algt-f06-local';
export const container='supabase_db_'+project;
export function guard(){
 assert.equal(root.replaceAll('\\','/'),'C:/dev/agt-erp-f06');
 assert.ok(!fs.existsSync(path.join(runtime,'supabase/.temp/project-ref')));
 const c=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
 assert.equal(c.Config.Labels['com.supabase.cli.project'],project);
 assert.equal(c.HostConfig.PortBindings['5432/tcp'][0].HostIp,'127.0.0.1');
 assert.equal(c.HostConfig.PortBindings['5432/tcp'][0].HostPort,corrected?'16882':native77?'16782':replay?'16662':'16622');
 assert.equal(c.State.Running,true);
 assert.match(c.Id,/^[a-f0-9]{64}$/);
 if(native77){
  const receipt=JSON.parse(fs.readFileSync(path.join(runtime,corrected?'startup-qualified.json':'startup-resources.json'),'utf8'));
  assert.equal(receipt.code,0);assert.equal(receipt.resources.find(r=>r.name==='/'+container)?.id,c.Id,'Native startup identity changed');
  const network=project+'-loopback';
  assert.deepEqual(Object.keys(c.NetworkSettings.Networks),[network]);
  const net=JSON.parse(execFileSync('docker',['network','inspect',network],{encoding:'utf8',timeout:10000}))[0];
  assert.equal(net.Id,JSON.parse(fs.readFileSync(path.join(runtime,'startup-intent.json'),'utf8')).networkId);
  assert.equal(net.Internal,false);assert.equal(net.Labels['algt.owner'],'f06');
  if(corrected){
   assert.equal(c.Image,'sha256:4c39816ce8d9303a3aba1161c842929c73a40c7109a9ef1b644582478e31832e');
   assert.deepEqual(c.HostConfig.PortBindings['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'16882'}]);
   assert.equal(net.Options['com.docker.network.bridge.host_binding_ipv4'],'127.0.0.1');
  }
 }
 return c.Id;
}
let pinnedSqlContainer;
export function sql(input){
 // Validate once per process, then address the immutable Docker identity,
 // never the reusable name. If removed/replaced, exec fails instead of silently
 // targeting a new container. Explicit guard() calls still re-inspect names.
 pinnedSqlContainer??=guard();
 const r=spawnSync('docker',['exec','-i','-e','PGPASSWORD=postgres',pinnedSqlContainer,'psql','-X','-q','-A','-t','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],
  {input,encoding:'utf8',maxBuffer:32*1024*1024,windowsHide:true});
 if(r.status!==0)throw Error(r.stderr.slice(-3500));return r.stdout.trim();
}
const command=process.argv[1]&&path.resolve(process.argv[1])===import.meta.filename?process.argv[2]:undefined;
assert.ok(!native77||command===undefined||['inspect','catalog'].includes(command),'Native77 bootstrap must use its separately reviewed write-once driver');
if(command==='restore'){
 guard();assert.equal(sql("select count(*) from pg_tables where schemaname='public';"),'0','Restore requires empty F06 schema');
 const baseline='C:/dev/agt-erp/CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F02_FINAL/private/current-schema-baseline.dump';
 const bytes=fs.readFileSync(baseline),hash=crypto.createHash('sha256').update(bytes).digest('hex');
 assert.equal(hash,'7e2263cb4869d93c58e502b455ad181348615e9b794432afeacf49852c83ce4c');
 const run=(args,input)=>execFileSync('docker',['exec','-i',container,...args],{input,maxBuffer:40*1024*1024,windowsHide:true});
 const list=run(['pg_restore','--list'],bytes).toString();assert.ok(!list.includes(' TABLE DATA '));
 const chosen=list.split('\n').filter(l=>!l.startsWith(';')&&(
  / (?:TABLE|SEQUENCE|FUNCTION|VIEW|INDEX|CONSTRAINT|FK CONSTRAINT|TRIGGER|POLICY|ROW SECURITY|ACL|DEFAULT ACL|COMMENT|TYPE|SEQUENCE OWNED BY) public /.test(l)
  || / TRIGGER auth /.test(l)|| / POLICY storage /.test(l)|| / ACL - SCHEMA public /.test(l))).join('\n');
 fs.writeFileSync(path.join(runtime,'baseline-restore.list'),chosen);
 execFileSync('docker',['cp',path.join(runtime,'baseline-restore.list'),container+':/tmp/f06-baseline.list'],{windowsHide:true});
 const source=run(['pg_restore','--file=-','--use-list=/tmp/f06-baseline.list'],bytes).toString();
 assert.ok(!/net\.http_|cron\.schedule\(|sb_secret_|BEGIN PRIVATE KEY/.test(source),'Schema side-effect review required');
 sql('begin; create extension if not exists pg_trgm with schema public; create extension if not exists vector with schema public;\n'+source+'\ncommit;');
 const files=fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>/^2026092[3-9].*\.sql$/.test(f)||/^20260930.*f05_.*\.sql$/.test(f)).sort();
 const applied=[];
 for(const file of files){
  assert.ok(!file.includes('f09_'));sql(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));applied.push(file);
  fs.writeFileSync(path.join(runtime,'prerequisite-progress.json'),JSON.stringify(applied,null,2));
  console.log('Applied prerequisite '+file);
 }
 sql("notify pgrst,'reload schema';");
 const counts=JSON.parse(sql("select json_build_object('tables',(select count(*) from pg_tables where schemaname='public'),'policies',(select count(*) from pg_policies where schemaname='public'),'auth_users',(select count(*) from auth.users),'queue_rows',(select count(*) from public.erp_email_queue));"));
 const receipt={at:new Date().toISOString(),baselineHash:hash,prerequisites:applied,...counts,productionRowsCopied:0};
 fs.writeFileSync(path.join(evidence,replay?'CLEAN_CANDIDATE_BASELINE_20261003.json':'SCHEMA_BASELINE_REPLAY.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(counts));
}
if(command==='inspect'){
 const result=JSON.parse(sql("select json_build_object('policies',(select json_agg(p) from pg_policies p where schemaname='public' and tablename in ('departments','work_calendars','work_shifts','hr_grades')),'functions',(select json_agg(json_build_object('name',p.oid::regprocedure::text,'body',pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','erp_private') and (p.proname like '%common_md%' or p.proname like '%hr_settings%' or p.proname in ('has_scoped_permission','business_principal_is_active','has_global_permission','current_user_has_permission','is_global_admin'))));"));
 fs.writeFileSync(path.join(runtime,'master-policy-baseline.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
if(command==='catalog'){
 console.log(sql("select jsonb_pretty(jsonb_build_object('columns',(select jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',data_type)) from information_schema.columns where table_schema='public' and table_name in ('work_calendars','work_shifts','hr_grades')),'dependencies',(select jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'definition',pg_get_constraintdef(oid))) from pg_constraint where contype='f' and confrelid in ('public.departments'::regclass,'public.work_calendars'::regclass,'public.work_shifts'::regclass)),'triggers',(select jsonb_agg(pg_get_triggerdef(oid)) from pg_trigger where not tgisinternal and tgrelid in ('public.departments'::regclass,'public.work_calendars'::regclass,'public.work_shifts'::regclass))));"));
}
if(command==='apply'){
 const file=process.argv[3];assert.match(file,/^202610\d{8}_f06_[a-z_]+\.sql$/);
 sql(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));console.log('Applied to F06 local only: '+file);
}
if(command==='refresh-hr-lookup'){
 const source=fs.readFileSync(path.join(root,'supabase/migrations/20261003200805_f06_hr_lookup_atomic_saves.sql'),'utf8');
 const body=source.match(/create function erp_private\.save_hr_lookup\([\s\S]*?end\$\$;/)?.[0];
 assert.ok(body);sql('begin;'+body.replace('create function','create or replace function')+'commit;');
 console.log('Refreshed unpublished HR transaction locally; full clean replay remains required');
}
if(command==='refresh-hr-archive'){
 const source=fs.readFileSync(path.join(root,'supabase/migrations/20261003213546_f06_hr_archive_recovery.sql'),'utf8');
 sql(source.replaceAll('create function','create or replace function'));
 console.log('Refreshed unpublished HR recovery projection locally; clean replay required');
}
if(command==='refresh-uom-integrity'){
 const source=fs.readFileSync(path.join(root,'supabase/migrations/20261003164204_f06_uom_relationship_integrity.sql'),'utf8');
 const functions=[...source.matchAll(/create function erp_private\.[\s\S]*?end\$\$;/g)].map(x=>x[0].replace('create function','create or replace function'));
 assert.equal(functions.length,2);sql('begin;'+functions.join('\n')+'commit;');console.log('Refreshed two unpublished UOM guards locally; exact clean replay required');
}
if(command==='refresh-provider-save'){
 // Local iteration only. Final replay must execute the whole migration.
 const source=fs.readFileSync(path.join(root,'supabase/migrations/20261003053109_f06_provider_atomic_saves.sql'),'utf8');
 const bodies=[...source.matchAll(/create function (?:public|erp_private)\.[\s\S]*?\$\$;/g)].map(m=>m[0].replace('create function','create or replace function'));
 assert.equal(bodies.length,2);sql('begin;\n'+bodies.join('\n')+'\ncommit;');console.log('Refreshed two unpublished F06 provider save functions locally; full replay remains required');
}
if(command==='refresh-template-history'){
 const source=fs.readFileSync(path.join(root,'supabase/migrations/20261003111253_f06_template_branding_read_boundary.sql'),'utf8');
 const boundary=source.slice(source.indexOf('alter policy template_events_select'),source.indexOf("notify pgrst,'reload schema';"));
 assert.ok(boundary.includes('drop policy template_events_insert'));
 sql('begin;'+boundary+"notify pgrst,'reload schema';commit;");
 console.log('Applied unpublished template history boundary locally; clean migration replay remains required');
}
if(command==='refresh-currency-save'){
 const source=fs.readFileSync(path.join(root,'supabase/migrations/20261003101926_f06_currency_integrity.sql'),'utf8');
 const body=source.match(/create function erp_private\.save_currency_record[\s\S]*?end\$\$;/)?.[0];
 const policy=source.match(/alter policy select_currencies_authenticated[\s\S]*?\);/)?.[0];
 assert.ok(body&&policy);
 sql('begin;'+body.replace('create function','create or replace function')+policy+"notify pgrst,'reload schema';commit;");
 console.log('Refreshed unpublished currency function and read policy on F06 local only; clean full replay remains required');
}
if(command==='refresh-branding-save'){
 // Unpublished candidate iteration only; clean baseline replay remains required.
 const source=fs.readFileSync(path.join(root,'supabase/migrations/20261003075328_f06_branding_versioned_saves.sql'),'utf8');
 const bodies=[...source.matchAll(/create function (?:public|erp_private)\.[\s\S]*?\$\$;/g)].map(m=>m[0].replace('create function','create or replace function'));
 const acl=source.split('\n').filter(l=>/^(alter function|revoke all on function|grant execute on function|alter table erp_private.branding_version_history owner)/.test(l));
 assert.equal(bodies.length,4);sql('begin;\n'+bodies.join('\n')+'\n'+acl.join('\n')+'\ncommit;');console.log('Refreshed unpublished branding functions and exact ownership locally; clean replay remains required');
}
if(command==='refresh-branding-assets'){
 const source=fs.readFileSync(path.join(root,'supabase/migrations/20261003082507_f06_branding_asset_lifecycle.sql'),'utf8');
 const bodies=[...source.matchAll(/create function (?:public|erp_private)\.[\s\S]*?\$\$;/g)].map(m=>m[0].replace('create function','create or replace function'));
 const acl=source.split('\n').filter(l=>/^(alter function|revoke all on function|grant execute on function)/.test(l));
 assert.equal(bodies.length,5);sql('begin;\n'+bodies.join('\n')+'\n'+acl.join('\n')+"\nnotify pgrst,'reload schema';commit;");console.log('Refreshed unpublished asset transaction functions locally; clean replay remains required');
}
if(command==='refresh-provider-secret'){
 const source=fs.readFileSync(path.join(root,'supabase/migrations/20261003063636_f06_provider_secret_transaction.sql'),'utf8');
 const bodies=[...source.matchAll(/create function (?:public|erp_private)\.[\s\S]*?\$\$;/g)].map(m=>m[0].replace('create function','create or replace function'));
 const acl=source.split('\n').filter(l=>/^(alter function|revoke all on function|grant execute on function)/.test(l));
 assert.equal(bodies.length,2);sql('begin;\n'+bodies.join('\n')+'\n'+acl.join('\n')+'\ncommit;');console.log('Refreshed two unpublished credential functions and exact ACLs locally; clean replay remains required');
}
if(command==='refresh-validation'){
 // Isolated iterative DDL only, not a production migration replay. Final replay
 // must use the complete candidate migration against the clean baseline.
 const source=fs.readFileSync(path.join(root,'supabase/migrations/20261001140544_f06_master_relationship_validation.sql'),'utf8');
 const bodies=[...source.matchAll(/create function erp_private\.validate_[a-z_]+\([\s\S]*?\$\$;/g)].map(m=>m[0].replace('create function','create or replace function'));
 assert.equal(bodies.length,4);sql('begin;\n'+bodies.join('\n')+'\ncommit;');console.log('Refreshed four unpublished F06 validation functions locally');
}
if(command==='refresh-party-relations'){
 const source=fs.readFileSync(path.join(root,'supabase/migrations/20261004014535_f06_party_relationship_integrity.sql'),'utf8');
 const bodies=[...source.matchAll(/create function erp_private\.[\s\S]*?end\$\$;/g)].map(m=>m[0].replace('create function','create or replace function'));
 assert.equal(bodies.length,3);sql('begin;'+bodies.join('\n')+'commit;');
 console.log('Refreshed three unpublished relationship guards locally; full exact replay required');
}
if(command==='refresh-numbering'){
 const source=fs.readFileSync(path.join(root,'supabase/migrations/20261003041704_f06_numbering_integrity.sql'),'utf8');
 const bodies=[...source.matchAll(/create (?:or replace )?function [\s\S]*?\$\$;/g)].map(m=>m[0].replace(/^create (?:or replace )?function/,'create or replace function'));
 const owners=[...source.matchAll(/^alter (?:function|table) [^;]+ owner to postgres;/gm)].map(m=>m[0]);
 assert.equal(bodies.length,12);sql('begin;\n'+bodies.join('\n')+'\n'+owners.join('\n')+'\ncommit;');console.log('Refreshed twelve unpublished F06 numbering functions/owners locally; clean replay remains required');
}
if(command==='refresh-numbering-save'){
 const source=fs.readFileSync(path.join(root,'supabase/migrations/20261003043129_f06_numbering_rule_saves.sql'),'utf8');
 const body=source.match(/create function public\.save_numbering_rule[\s\S]*?\$\$;/)?.[0];
 const constraint=source.match(/alter table erp_private\.master_lifecycle_receipts drop constraint[\s\S]*?check\(entity in [^;]+;/)?.[0];
 const writeAcl=source.match(/revoke insert,update,delete on public\.global_numbering_rules from public,anon,authenticated;/)?.[0];
 assert.ok(body&&constraint&&writeAcl);sql('begin;\n'+constraint+'\n'+body.replace('create function','create or replace function')+'\n'+writeAcl+'\ncommit;');console.log('Refreshed unpublished numbering save function/receipt constraint/write ACL locally; clean replay required');
}
