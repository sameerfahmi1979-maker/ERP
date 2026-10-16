// MAIN ONLY. Staged source -> plan lock-order acceptance. Never import in offline
// tests: authoring tests read this file as text. Exact synthetic fixture SQL only.
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {guard,sql} from './local-db.mjs';
import {automaticReminderRaceNames} from './automatic-reminder-race-identity.mjs';

export async function runAutomaticReminderSourceRace(sourceLockSql,completionSql,directSql,observe){
 const containerId=guard(),names=automaticReminderRaceNames(randomUUID()),tag=names.tag,identities=[];
 observe({stage:'intent',tag,containerId});
 const args=['exec','-i','-e','PGPASSWORD=postgres',containerId,'psql','-w','-X','-q','-A','-t','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'];
 function launch(side){
  const applicationName=names[side];assert.ok(Buffer.byteLength(applicationName,'utf8')<=63);
  const process=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let output='',error='';const listeners=[];
  process.stdout.on('data',chunk=>{output+=chunk;for(const listener of listeners)listener(output);});
  process.stderr.on('data',chunk=>{error+=chunk;});
  const done=new Promise((resolve,reject)=>{process.once('error',reject);process.once('close',code=>resolve({code,output,error}));});
  const waitFor=(pattern)=>new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('Exact staged race process did not reach its checkpoint')),12000);
   const inspect=text=>{const match=text.match(pattern);if(match){clearTimeout(timeout);resolve(match);}};
   listeners.push(inspect);inspect(output);done.then(result=>{inspect(result.output);if(!pattern.test(result.output)){clearTimeout(timeout);reject(Error('Exact staged race process exited before checkpoint'));}},reject);
  });
  process.stdin.write(`\\set VERBOSITY verbose\nbegin;set local application_name='${applicationName}';set local statement_timeout='20s';set local lock_timeout='15s';set local idle_in_transaction_session_timeout='25s';select 'F06_RACE_ID '||json_build_object('pid',pg_backend_pid(),'backendStart',(select backend_start::text from pg_stat_activity where pid=pg_backend_pid()),'actualApplicationName',current_setting('application_name'))::text;\n`);
  const identity=waitFor(/F06_RACE_ID (\{[^\r\n]+\})/).then(match=>{
   const value=JSON.parse(match[1]);assert.ok(Number.isSafeInteger(value.pid)&&value.pid>0);assert.equal(typeof value.backendStart,'string');
   assert.equal(value.actualApplicationName,applicationName,'Database must retain the exact observed application identity');
   const recorded={side,applicationName,...value};identities.push(recorded);observe({stage:'identity',tag,containerId,...recorded});return recorded;
  });
  return {process,done,identity,ready:()=>waitFor(/F06_SOURCE_LOCK_READY/)};
 }
 const holder=launch('holder');let contender;
 try{
  holder.process.stdin.write(sourceLockSql+';\n\\echo F06_SOURCE_LOCK_READY\n');
  const holderIdentity=await holder.identity;await holder.ready();
  contender=launch('contender');contender.process.stdin.end(directSql+';commit;\n');
  const contenderIdentity=await contender.identity;let blocked=false;
  for(let attempt=0;attempt<30;attempt++){
   const count=sql(`select count(*) from pg_stat_activity where pid=${contenderIdentity.pid} and backend_start=${quote(contenderIdentity.backendStart)}::timestamptz and application_name=${quote(contenderIdentity.applicationName)} and wait_event_type='Lock' and ${holderIdentity.pid}=any(pg_blocking_pids(pid))`);
   if(count==='1'){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.ok(blocked,'Direct completion must wait on the holder that owns only the source lock');
  // Crucial ordering proof: only NOW let the source holder acquire the plan via
  // normal finish. A contender retaining the plan while waiting cannot pass.
  observe({stage:'source-only-block-observed',tag,containerId,holderPid:holderIdentity.pid,contenderPid:contenderIdentity.pid});
  holder.process.stdin.end(completionSql+';commit;\n');
  const [first,second]=await Promise.all([holder.done,contender.done]);
  assert.equal(first.code,0,'Source holder failed to finish after the direct caller blocked');
  return {blocked,first,second};
 }finally{
  if(!holder.process.stdin.writableEnded)holder.process.stdin.end('rollback;\n');
  if(contender&&!contender.process.stdin.writableEnded)contender.process.stdin.end('rollback;\n');
  await Promise.allSettled([holder.done,...(contender?[contender.done]:[])]);
  for(const identity of identities){
   const absent=sql(`select count(*) from pg_stat_activity where pid=${identity.pid} and backend_start=${quote(identity.backendStart)}::timestamptz`)==='0';
   observe({stage:'cleanup',tag,containerId,...identity,absent});assert.ok(absent,'Exact staged race backend remains');
  }
 }
}
function quote(value){return "'"+String(value).replaceAll("'","''")+"'";}
