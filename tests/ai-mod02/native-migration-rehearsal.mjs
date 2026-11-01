// Exact migration/history rehearsal; production guard values come from its own fresh catalog.
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {buildPacket,evidence,migration,version} from '../../tooling/ai/search-migration-packet.mjs';
const container='agt-ai-mod02-20261030';
const info=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
if(info.Id!=='306cf76688ee138a86332c419545fa4ca01594191727a79d0ff71acc96911155'||info.Config.Labels['algt.task']!=='ai-mod02-20261030'||info.HostConfig.NetworkMode!=='none')throw Error('Wrong isolated target');
const database='ai_mod02_rehearsal_'+Date.now();
const checks=[];const check=(pass,label)=>{if(!pass)throw Error(label);checks.push(label);};
const run=(sql,ok=true)=>{try{return execFileSync('docker',['exec','-i',container,'psql','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-At'],{input:sql,encoding:'utf8',maxBuffer:8*1024*1024,stdio:['pipe','pipe','pipe']});}catch(e){if(ok)throw e;return {failed:true,text:String(e.stderr)};}};
execFileSync('docker',['exec',container,'psql','-U','postgres','-d','postgres','-c',`CREATE DATABASE ${database}`],{encoding:'utf8'});
const source=readFileSync(migration,'utf8'),nativePacket=readFileSync(`${evidence}/NATIVE_SEARCH_PACKET.sql`,'utf8');const start=nativePacket.indexOf(source);if(start<1)throw Error('Missing exact migration in native packet');
run(nativePacket.slice(0,start)+`CREATE SCHEMA supabase_migrations;CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);INSERT INTO supabase_migrations.schema_migrations VALUES('20990101000000','SYNTHETIC_FOREIGN_HISTORY',ARRAY['SELECT 1;']);CREATE TABLE erp_ai_feature_flags(feature_code text,is_enabled boolean);INSERT INTO erp_ai_feature_flags VALUES('DMS_AI_AUTO_START',false),('ERP_AI_SEARCH',false);`);
const preflight=readFileSync(`${evidence}/refresh-preflight.sql`,'utf8');
const parse=out=>JSON.parse(out.split('\n').find(line=>line.startsWith('{')));
const baseline=parse(run(preflight));const g=buildPacket(baseline);
writeFileSync(`${evidence}/NATIVE_REHEARSAL_BASELINE.json`,JSON.stringify(baseline,null,2)+'\n');
// A concurrent unrelated policy change must reject before any new function/history row.
run('CREATE POLICY synthetic_drift ON dms_documents FOR SELECT TO authenticated USING(false);');
const denied=run(g.packet,false);check(denied.failed&&denied.text.includes('policies drifted'),'policy drift rejected before DDL');
check(run("SELECT count(*) FROM pg_proc WHERE proname LIKE 'ai_mod02_%';").trim()==='0','guard failure left no partial functions');
run('DROP POLICY synthetic_drift ON dms_documents;');
const partial=run(g.packet.replace(g.parts[5],()=>g.parts[5]+'\nSELECT 1/0;'),false);
writeFileSync(`${evidence}/NATIVE_REHEARSAL_EXPECTED_FAILURES.json`,JSON.stringify({drift:denied,partial},null,2)+'\n');
check(partial.failed&&partial.text.includes('division by zero'),'mid-migration failure rejected: '+String(partial.text??partial).slice(0,300));
check(run("SELECT (SELECT count(*) FROM pg_proc WHERE proname LIKE 'ai_mod02_%')+(SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='"+version+"');").trim()==='0','mid-migration failure rolls back functions and history');
const applied=run(g.packet);const after=parse(run(preflight));
for(const key of ['columns','policies','indexes','table_grants','flags'])check(JSON.stringify(baseline[key])===JSON.stringify(after[key]),'unchanged '+key);
check(after.functions.filter(f=>f.name.startsWith('ai_mod02_')).length===6,'exactly six new functions');
check(JSON.stringify(baseline.functions)===JSON.stringify(after.functions.filter(f=>!f.name.startsWith('ai_mod02_'))),'existing functions and ACLs unchanged');
const checkHistory=parse(run(`SELECT jsonb_build_object('statements',statements,'name',name) FROM supabase_migrations.schema_migrations WHERE version='${version}';`));
check(JSON.stringify(checkHistory.statements)===JSON.stringify(g.parts)&&checkHistory.name==='ai_mod02_shared_document_search','exact migration statements retained');
const duplicate=run(g.packet,false);check(duplicate.failed&&duplicate.text.includes('already exists'),'duplicate migration rejected');
check(run("SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20990101000000' AND name='SYNTHETIC_FOREIGN_HISTORY';").trim()==='1','foreign history preserved');
// Simulate loss of the apply response: reconcile from exact history rather than re-run.
check(run(`SELECT cardinality(statements) FROM supabase_migrations.schema_migrations WHERE version='${version}';`).trim()===String(g.parts.length),'response loss reconciled without replay');
const result={result:'passed',assertions:checks.length,checks,database,container:info.Id,sha256:createHash('sha256').update(source).digest('hex'),generatorSha256:createHash('sha256').update(readFileSync('tooling/ai/search-migration-packet.mjs')).digest('hex'),statementCount:g.parts.length,driftRejected:true,atomicHistory:true,duplicateRejected:true,responseLossReconciled:true,priorPoliciesColumnsGrantsFlagsUnchanged:true,foreignHistoryPreserved:true,scope:'exact migration statements and same guarded packet generator; guard expected values are isolated-catalog-specific, not a production restore'};
writeFileSync(`${evidence}/NATIVE_MIGRATION_REHEARSAL.json`,JSON.stringify(result,null,2)+'\n');writeFileSync(`${evidence}/NATIVE_MIGRATION_APPLY.log`,applied);console.log(JSON.stringify(result));
