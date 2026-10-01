import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
export const root=path.resolve(import.meta.dirname,'../../..');
export const runtime=path.join(root,'CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F09/local');
export const container='supabase_db_algt-f09-local';
export function guard(){
 assert.equal(root.replaceAll('\\','/'),'C:/dev/agt-erp-f09');
 const c=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
 assert.equal(c.Config.Labels['com.supabase.cli.project'],'algt-f09-local');
 assert.equal(c.HostConfig.PortBindings['5432/tcp'][0].HostIp,'127.0.0.1');
 assert.equal(c.HostConfig.PortBindings['5432/tcp'][0].HostPort,'16522');
 assert.equal(c.State.Running,true);
 assert.ok(!fs.existsSync(path.join(runtime,'supabase/.temp/project-ref')));
}
export function sql(input){
 guard();
 const r=spawnSync('docker',['exec','-i','-e','PGPASSWORD=postgres',container,'psql','-X','-q','-A','-t','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',maxBuffer:32*1024*1024,windowsHide:true});
 if(r.status)throw Error(r.stderr.slice(-2500));return r.stdout.trim();
}
if(['restore','resume-rls'].includes(process.argv[2])){
 guard();
 const resume=process.argv[2]==='resume-rls';
 if(!resume)assert.equal(sql("select count(*) from pg_tables where schemaname='public';"),'0','Restore requires an empty F09 public schema');
 else assert.equal(sql('select (select count(*) from auth.users)+(select count(*) from public.erp_email_queue);'),'0');
 const baseline='C:/dev/agt-erp/CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F02_FINAL/private/current-schema-baseline.dump';
 const bytes=fs.readFileSync(baseline),hash=crypto.createHash('sha256').update(bytes).digest('hex');
 assert.equal(hash,'7e2263cb4869d93c58e502b455ad181348615e9b794432afeacf49852c83ce4c');
 const run=(args,input)=>execFileSync('docker',['exec','-i',container,...args],{input,maxBuffer:40*1024*1024});
 // Schema-only archive is fingerprinted. No business rows or provider keys copied.
 const list=run(['pg_restore','--list'],bytes).toString();
 assert.ok(!list.includes(' TABLE DATA '));
 const chosen=list.split('\n').filter(l=>!l.startsWith(';')&&(
 / (?:TABLE|SEQUENCE|FUNCTION|VIEW|INDEX|CONSTRAINT|FK CONSTRAINT|TRIGGER|POLICY|ROW SECURITY|ACL|DEFAULT ACL|COMMENT|TYPE|SEQUENCE OWNED BY) public /.test(l)
 || / TRIGGER auth /.test(l) || / POLICY storage /.test(l)
 || / ACL - SCHEMA public /.test(l)
 )&&(!resume||l.includes(' ROW SECURITY public '))).join('\n');
 fs.writeFileSync(path.join(runtime,'baseline-restore.list'),chosen);
 execFileSync('docker',['cp',path.join(runtime,'baseline-restore.list'),container+':/tmp/f09-baseline.list']);
 const source=run(['pg_restore','--file=-','--use-list=/tmp/f09-baseline.list'],bytes).toString();
 assert.ok(!/net\.http_|cron\.schedule\(|sb_secret_|BEGIN PRIVATE KEY/.test(source),'Schema side-effect review required');
 sql('begin; create extension if not exists pg_trgm with schema public; create extension if not exists vector with schema public;\n'+source+'\ncommit;');
 // Forward-only reviewed F03/F04 migrations, not the divergent legacy directory.
 const files=fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>/^2026092[3-9].*\.sql$/.test(f)).sort();
 for(const file of files.filter(f=>!resume||f>='20260923071412')){sql(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));console.log('Applied prerequisite '+file);}
 for(const file of fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>/^20260930.*f09_.*\.sql$/.test(f)).sort()){
  sql(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));console.log('Applied '+file);
 }
 sql("notify pgrst,'reload schema';");
 const counts=JSON.parse(sql("select json_build_object('tables',(select count(*) from pg_tables where schemaname='public'),'policies',(select count(*) from pg_policies where schemaname='public'),'auth_users',(select count(*) from auth.users),'queue_rows',(select count(*) from public.erp_email_queue));"));
 fs.writeFileSync(path.join(runtime,'schema-rehearsal.json'),JSON.stringify({at:new Date().toISOString(),hash,prerequisites:files,...counts,productionRowsCopied:0},null,2));
 console.log(JSON.stringify(counts));
}
