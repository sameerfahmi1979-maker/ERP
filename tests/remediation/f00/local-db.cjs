'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const g=require('./target-guard.cjs');
const evidence=path.resolve(g.LOCAL,'..');
const container='supabase_db_'+g.PROJECT;
function assertDatabase(){
 g.assertWorkdir();g.assertManifest(JSON.parse(fs.readFileSync(path.join(g.LOCAL,'environment.json'),'utf8')));
 const c=JSON.parse(cp.execFileSync('docker',['inspect',container],{encoding:'utf8',windowsHide:true}))[0];
 if(c.Name!=='/'+container||c.Config.Labels['com.supabase.cli.project']!==g.PROJECT||!c.State.Running)throw Error('Wrong/stopped database container');
 const b=c.HostConfig.PortBindings['5432/tcp'];if(b.length!==1||b[0].HostIp!=='127.0.0.1'||b[0].HostPort!==String(g.PORTS.db))throw Error('Unsafe DB binding');
}
function sql(input,{json=false,transaction=false}={}){
 assertDatabase();
 const r=cp.spawnSync('docker',['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1',...(transaction?['-1']:[]),...(json?['-A','-t']:[]),'--quiet'],{input,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
 if(r.status!==0)throw Error('LOCAL psql failed: '+r.stderr.slice(-3000));
 return json?JSON.parse(r.stdout.trim()):r.stdout;
}
function schemaImport(){
 const file=path.join(g.LOCAL,'generated/production-public-schema.sql');const s=fs.readFileSync(file,'utf8');
 if(/(?:eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.|sb_secret_|BEGIN PRIVATE KEY|mmiefuieduzdiiwnqpie|net\.http_|cron\.schedule)/.test(s))throw Error('Schema requires additional secret/side-effect review');
 if(sql("select to_json(count(*)) from pg_tables where schemaname='public';",{json:true})!==0)throw Error('Schema import requires empty local public schema');
 sql('create extension if not exists pg_trgm with schema public; create extension if not exists vector with schema public;\n'+s,{transaction:true});
 const extra=JSON.parse(fs.readFileSync(path.join(evidence,'STORAGE_AUTH_SCHEMA_BASELINE.json'),'utf8'));
 const qi=x=>'"'+x.replaceAll('"','""')+'"';
 const auth=extra.auth_triggers.map(t=>t.definition+';').join('\n');
 const policies=extra.storage_policies.map(p=>'CREATE POLICY '+qi(p.name)+' ON storage.'+qi(p.table)+' AS '+p.permissive+' FOR '+p.command+' TO '+p.roles.map(qi).join(',')+(p.using?' USING ('+p.using+')':'')+(p.check?' WITH CHECK ('+p.check+')':'')+';').join('\n');
 sql('SET search_path=public,extensions;\n'+auth+'\n'+policies,{transaction:true});
 const counts=sql("select json_build_object('public_tables',(select count(*) from pg_tables where schemaname='public'),'public_views',(select count(*) from pg_views where schemaname='public'),'public_policies',(select count(*) from pg_policies where schemaname='public'),'storage_policies',(select count(*) from pg_policies where schemaname='storage'),'auth_users',(select count(*) from auth.users));",{json:true});
 const result={at:new Date().toISOString(),schema_sha256:crypto.createHash('sha256').update(s).digest('hex'),schema_only:true,production_rows_copied:0,...counts};
 fs.writeFileSync(path.join(evidence,'LOCAL_SCHEMA_IMPORT.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
module.exports={sql,assertDatabase,evidence};
if(require.main===module){try{if(process.argv[2]!=='import')throw Error('Use import');schemaImport();}catch(e){console.error(e.message);process.exitCode=1;}}
