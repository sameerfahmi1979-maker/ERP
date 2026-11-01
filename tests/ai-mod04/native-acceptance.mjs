import {readFileSync,writeFileSync,existsSync} from 'node:fs';import {execFileSync} from 'node:child_process';import {resolve,join} from 'node:path';import {createHash} from 'node:crypto';
if(resolve('.').toLowerCase()!=='c:\\dev\\agt-erp')throw Error('Canonical checkout required');
const out='CODEX_AUDIT_13_09_2026/IMPLEMENTATION/AI_MOD_04_20261031',container='agt-ai-mod04-20261031',run=process.argv[2],database=process.argv[3];
if(!/^\d{2}$/.test(run??'')||!/^ai_mod04_\d{2}$/.test(database??''))throw Error('Explicit new receipt and rehearsed task database required');
const expected=JSON.parse(readFileSync(join(out,'NATIVE_CONTAINER.json'),'utf8'));
const info=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8',windowsHide:true}))[0];
if(info.Id!==expected.cid||info.Config.Labels['algt.task']!=='ai-mod04-20261031'||info.HostConfig.NetworkMode!=='none'||info.Mounts.length||Object.keys(info.HostConfig.PortBindings??{}).length)throw Error('Isolated resource guard failed');
const log=join(out,`ACCEPTANCE_${run}.log`);if(existsSync(log))throw Error('Preserve prior acceptance receipt');
const base=readFileSync('tests/ai-mod04/native-acceptance.sql','utf8');
let extended=readFileSync('tests/ai-mod04/extended-acceptance.sql','utf8');
if(process.argv[4]==='cutover')extended=extended.replace("='held_historical_cycle_collision'","='reconciled'").replace('legacy uniqueness collision is visible, never silently replayed','matching app/database cutover creates the new cycle while retaining history')+readFileSync('tests/ai-mod04/reminder-cycle-acceptance.sql','utf8');
const input=base.replace("SELECT jsonb_build_object('result','passed'",()=>extended+"\nSELECT jsonb_build_object('result','passed'");
try{const result=execFileSync('docker',['exec','-i',container,'psql','-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1','-At'],{input,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});writeFileSync(log,result);
 const receipt=JSON.parse(result.trim().split('\n').findLast(x=>x.startsWith('{"result"')));writeFileSync(join(out,`ACCEPTANCE_${run}_RESULT.json`),JSON.stringify({...receipt,cid:expected.cid,database,fixtureSha256:createHash('sha256').update(input).digest('hex'),productionChanges:false},null,2));console.log(JSON.stringify(receipt));
}catch(e){writeFileSync(log,String(e.stdout??'')+'\n'+String(e.stderr??e));console.log(String(e.stderr??e).split('\n').slice(-12).join('\n'));process.exitCode=1;}
