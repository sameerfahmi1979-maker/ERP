import {execFileSync,spawn} from 'node:child_process';import {readFileSync,writeFileSync,existsSync} from 'node:fs';import {resolve} from 'node:path';import {createHash} from 'node:crypto';
const out='CODEX_AUDIT_13_09_2026/IMPLEMENTATION/AI_MOD_04_20261031/',container='agt-ai-mod04-20261031',database=process.argv[2],receipt=process.argv[3];
if(resolve('.').toLowerCase()!=='c:\\dev\\agt-erp'||!/^ai_mod04_\d{2}$/.test(database??'')||!/^\d{2}$/.test(receipt??'')||existsSync(out+`CONCURRENCY_${receipt}.json`))throw Error('Owned resource/receipt guard');
const d=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});const i=JSON.parse(d(['inspect',container]))[0],expected=JSON.parse(readFileSync(out+'NATIVE_CONTAINER.json','utf8'));if(i.Id!==expected.cid||i.HostConfig.NetworkMode!=='none'||i.Mounts.length||Object.keys(i.HostConfig.PortBindings??{}).length)throw Error('Disconnected isolation guard');
const args=['exec','-i',container,'psql','-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1','-Atq'];
const sql=s=>d(args,"\\set VERBOSITY verbose\nSET statement_timeout='6s';\n"+s);
const claims=n=>`SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000100${n}","role":"authenticated","session_id":"00000000-0000-4000-8000-00000000200${n}"}',false);`;
const auth=claims(1)+'SET ROLE authenticated;';
const lines=s=>s.split(/\r?\n/).map(x=>x.trim());const json=s=>JSON.parse(lines(s).findLast(x=>x.startsWith('{"jobId"')||x.startsWith('{"documentId"')));
let fixture=readFileSync('tests/ai-mod04/native-acceptance.sql','utf8');fixture=fixture.slice(0,fixture.indexOf("SELECT jsonb_build_object('result','passed'"))+'COMMIT;';
const results=[];const assert=(ok,label)=>{if(!ok)throw Error(label);results.push({label,status:'passed'});};
const request=(snapshot,key)=>`jsonb_build_object('documentId',1003,'requestId','00000000-0000-4000-8000-0000000090${key}','snapshot','${snapshot}','mode','reuse_text','fileIds',jsonb_build_array(1003))`;
const snapshot=()=>lines(sql(auth+`SELECT public.ai_mod04_preparation('snapshot','{"documentId":1003}')->>'snapshot';`)).findLast(x=>/^[a-f0-9]{64}$/.test(x));
async function held(prefix,body){
 const child=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';let markResolve;const marker=new Promise(r=>markResolve=r);const done=new Promise((r,j)=>{child.stdout.on('data',b=>{stdout+=b;if(stdout.includes('TASK_LOCK_READY'))markResolve();});child.stderr.on('data',b=>stderr+=b);child.on('error',j);child.on('close',code=>code===0?r(stdout):j(Error(stderr)));});
 child.stdin.end(`SET statement_timeout='6s';BEGIN;${prefix};SELECT 'TASK_LOCK_READY';SELECT pg_sleep(0.6);COMMIT;`);
 await Promise.race([marker,done.then(()=>{throw Error('Lock marker missing');})]);
 try{const result=await body();await done;return {stdout,result};}catch(e){await done.catch(()=>{});throw e;}
}
const rejected=(statement,code)=>{try{sql(statement);return false;}catch(e){return String(e.stderr).includes(code);}};
try{
 sql(fixture);
 let snap=snapshot(),req=request(snap,'01');
 const first=await held(auth+`SELECT public.ai_mod04_preparation('start',${req});`,()=>json(sql(auth+`SELECT public.ai_mod04_preparation('start',${req});`)));
 const one=json(first.stdout);assert(one.jobId===first.result.jobId&&first.result.replayed===true,'two connections recover one original job for the same request');
 assert(rejected(auth+`SELECT public.ai_mod04_preparation('start',${request(snap,'02')});`,'PT409'),'a competing request cannot create a second active preparation');
 sql(auth+`SELECT public.ai_mod04_preparation('cancel',jsonb_build_object('documentId',1003,'jobId',${one.jobId}));`);
 snap=snapshot();
 const changed=await held(claims(1)+`UPDATE public.dms_documents SET title='SYNTHETIC concurrent source edit' WHERE id=1003`,()=>rejected(auth+`SELECT public.ai_mod04_preparation('start',${request(snap,'03')});`,'PT409'));
 assert(changed.result,'a stale source cannot be admitted after a concurrent header commit');
 snap=snapshot();
 const revoked=await held(claims(2)+`UPDATE public.user_roles SET is_active=false WHERE id=1001`,()=>rejected(auth+`SELECT public.ai_mod04_preparation('start',${request(snap,'04')});`,'55P03'));
 assert(revoked.result,'an in-flight membership revocation prevents AI admission with a retryable lock rejection');
 assert(rejected(auth+`SELECT public.ai_mod04_preparation('start',${request(snap,'04')});`,'42501'),'committed membership revocation denies subsequent requests');
 sql(claims(2)+`UPDATE public.user_roles SET is_active=true WHERE id=1001`);
 snap=snapshot();
 const type=await held(claims(1)+`UPDATE public.dms_document_types SET name_en='SYNTHETIC concurrently reviewed type' WHERE id=1001`,()=>rejected(auth+`SELECT public.ai_mod04_preparation('start',${request(snap,'05')});`,'55P03'));
 assert(type.result,'a concurrent type/profile change cannot race a paid-stage source admission');
 assert(rejected(auth+`SELECT public.ai_mod04_preparation('start',${request(snap,'05')});`,'PT409'),'the committed type/schema fingerprint retires the earlier review');
 const result={status:'passed',assertions:results.length,results,database,cid:expected.cid,fixtureSha256:createHash('sha256').update(fixture).digest('hex'),browserUsed:false,providerCalls:0,productionChanges:false};writeFileSync(out+`CONCURRENCY_${receipt}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,assertions:result.assertions}));
}catch(e){writeFileSync(out+`CONCURRENCY_${receipt}_FAILURE.txt`,String(e.stack??e));console.error(String(e.message??e).slice(-1500));process.exitCode=1;}
