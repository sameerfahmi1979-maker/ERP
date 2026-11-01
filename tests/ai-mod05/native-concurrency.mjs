import {execFileSync,spawn}from 'node:child_process';import {readFileSync,writeFileSync,existsSync}from 'node:fs';import {resolve}from 'node:path';import {createHash}from 'node:crypto';
const out='CODEX_AUDIT_13_09_2026/IMPLEMENTATION/AI_MOD_05_20261101/',container='agt-ai-mod05-20261101',database=process.argv[2],receipt=process.argv[3];
if(resolve('.').toLowerCase()!=='c:\\dev\\agt-erp'||!/^ai_mod05_\d{2}$/.test(database??'')||!/^\d{2}$/.test(receipt??'')||existsSync(out+`CONCURRENCY_${receipt}.json`))throw Error('Owned resource/new receipt required');
const docker=(args,input)=>execFileSync('docker',['--context','desktop-linux',...args],{input,encoding:'utf8',windowsHide:true,maxBuffer:8e6});
const identity=JSON.parse(readFileSync(out+'NATIVE_CONTAINER.json')),info=JSON.parse(docker(['inspect',container]))[0];if(info.Id!==identity.cid||info.HostConfig.NetworkMode!=='none'||info.Mounts.length||Object.keys(info.HostConfig.PortBindings??{}).length)throw Error('Isolation guard');
const args=['--context','desktop-linux','exec','-i',container,'psql','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-Atq'];
const sql=s=>execFileSync('docker',args,{input:"\\set VERBOSITY verbose\nSET statement_timeout='6s';\n"+s,encoding:'utf8',windowsHide:true,maxBuffer:8e6});
const claims=n=>`SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000100${n}","role":"authenticated","session_id":"00000000-0000-4000-8000-00000000200${n}"}',false);`;
const auth=n=>claims(n)+'SET ROLE authenticated;';
const json=s=>JSON.parse(s.split(/\r?\n/).findLast(x=>x.trim().startsWith('{')));
let fixture=readFileSync('tests/ai-mod04/native-acceptance.sql','utf8').split('SET ROLE authenticated;')[0]+readFileSync('tests/ai-mod05/native-acceptance.sql','utf8').split("SELECT jsonb_build_object('result','passed'")[0]+'COMMIT;';
const results=[],ok=(v,label)=>{if(!v)throw Error(label);results.push({label,status:'passed'});};
async function held(prefix,work){const child=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='',ready;const marker=new Promise(r=>ready=r),done=new Promise((r,j)=>{child.stdout.on('data',b=>{stdout+=b;if(stdout.includes('TASK_LOCK_READY'))ready();});child.stderr.on('data',b=>stderr+=b);child.on('error',j);child.on('close',c=>c===0?r(stdout):j(Error(stderr)));});child.stdin.end(`SET statement_timeout='6s';BEGIN;${prefix};SELECT 'TASK_LOCK_READY';SELECT pg_sleep(0.6);COMMIT;`);await Promise.race([marker,done.then(()=>{throw Error('Expected acquired lock marker');})]);try{const result=await work();await done;return{stdout,result};}catch(e){await done.catch(()=>{});throw e;}}
const rejected=(statement,code)=>{try{sql(statement);return false;}catch(e){return String(e.stderr).includes(code);}};
const key=n=>'00000000-0000-4000-8000-000000005'+String(n).padStart(3,'0');
try{
 sql(fixture);
 const payload=JSON.stringify({source:{kind:'extraction',id:2101,documentId:1001},requestId:key(1),category:'missing_result',correction:'SYNTHETIC concurrent correction',shareForReview:true});
 const statement=`SELECT public.ai_mod05_feedback('submit','${payload}');`;
 const a=await held(auth(1)+statement,()=>json(sql(auth(1)+statement)));
 ok(json(a.stdout).id===a.result.id&&a.result.replayed,'two connections recover exactly one feedback receipt');
 const review=n=>`SELECT public.ai_mod05_feedback('review','${JSON.stringify({id:a.result.id,decision:n===2?'accepted':'disagreed',note:'SYNTHETIC independent finding',requestId:key(n)})}');`;
 const b=await held(auth(2)+review(2),()=>rejected(auth(3)+review(3),'PT409'));
 ok(b.result,'competing reviewers cannot replace the first immutable decision');
 const control=n=>`SELECT public.ai_mod05_control('${JSON.stringify({feature:'dms_jobs',companyId:null,expectedRevision:2,paused:n===1,dailyLimit:5,dailyUsd:null,reason:'SYNTHETIC CAS race',requestId:key(n+10)})}');`;
 const c=await held(auth(1)+control(1),()=>rejected(auth(2)+control(2),'PT409'));
 ok(c.result,'two operators cannot overwrite the same control revision');
 const turn=`SELECT public.ai_mod05_turn('begin',2101,'${key(20)}',repeat('e',64));`;
 const t=await held(auth(1)+turn,()=>json(sql(auth(1)+turn)));
 ok(json(t.stdout).state==='started'&&t.result.replayed,'same concurrent turn admits only one provider owner');
 const edited=await held(claims(2)+"UPDATE public.dms_documents SET title='SYNTHETIC concurrent edit'WHERE id=1001",()=>rejected(auth(1)+`SELECT public.ai_mod05_feedback('submit','${JSON.stringify({...JSON.parse(payload),requestId:key(22),category:'unsupported_answer'})}');`,'55P03'));
 ok(edited.result,'a concurrent source edit fences feedback submission until its reviewed source is reconciled');
 const revoked=await held(claims(2)+'UPDATE public.user_roles SET is_active=false WHERE user_profile_id=1004',()=>rejected(auth(4)+`SELECT public.ai_mod05_feedback('source','{"source":{"kind":"extraction","id":2101,"documentId":1001}}');`,'55P03'));
 ok(revoked.result,'in-flight role revocation fences source-bound feedback admission');
 ok(rejected(auth(4)+`SELECT public.ai_mod05_feedback('source','{"source":{"kind":"extraction","id":2101,"documentId":1001}}');`,'42501'),'committed revocation denies the next feedback source request');
 const result={status:'passed',assertions:results.length,results,cid:identity.cid,database,fixtureSha256:createHash('sha256').update(fixture).digest('hex'),migrationSha256:createHash('sha256').update(readFileSync('supabase/migrations/20261101070000_ai_mod05_quality_operations.sql')).digest('hex'),providerCalls:0,browserUsed:false,productionChanges:false};writeFileSync(out+`CONCURRENCY_${receipt}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({status:'passed',assertions:results.length}));
}catch(e){writeFileSync(out+`CONCURRENCY_${receipt}_FAILURE.txt`,String(e.stack??e));console.error(String(e.message??e).slice(-1800));process.exitCode=1;}
