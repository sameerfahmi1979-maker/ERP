// MAIN ONLY factory. Importing this module performs no runtime I/O.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {n01,commands,fixtureOwner,ownerSql,ownedRule,ruleSql,quote,uuid} from './n01-browser-contract.mjs';
export const sha=value=>createHash('sha256').update(value).digest('hex');
export function openN01Runtime({readOnly=false}={}){
  const root=path.resolve(import.meta.dirname,'../../..'),normalize=p=>p.replaceAll('\\','/').toLowerCase();
  assert.equal(normalize(root),'c:/dev/agt-erp-f06');assert.equal(normalize(path.resolve(process.cwd())),normalize(root));
  assert.equal(process.env.ALGT_F06_LOCAL_TARGET,'main-local');assert.equal(process.env.ALGT_F06_N01_MARKER,n01.marker);
  assert.equal(process.env.ALGT_F06_PRIVATE_ACL_CONFIRMED,'protected-local-parent');
  const runtime=path.join(root,'CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06/local'),parent=path.join(runtime,'browser-acceptance-private');
  const directory=path.join(parent,'n01-browser-'+n01.marker),lifetimeLock=path.join(parent,'scoped-browser-lifetime-lock-private.json');
  for(const p of [runtime,parent]){assert.equal(fs.lstatSync(p).isSymbolicLink(),false);assert.equal(normalize(fs.realpathSync(p)),normalize(p));}
  assert.ok(fs.readFileSync(path.join(root,'.gitignore'),'utf8').includes('/CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06/'));
  const files=['n01-browser-contract.mjs','n01-browser-runtime.mjs','n01-browser-fixture.mjs','n01-browser-resource-check.mjs','scoped-browser-contract.mjs'];
  const sourceHashes=Object.fromEntries(files.map(name=>[name,sha(fs.readFileSync(path.join(import.meta.dirname,name)))]));
  const sourceSha256=sha(JSON.stringify(sourceHashes));assert.equal(process.env.ALGT_F06_N01_SOURCE_SHA256,sourceSha256,'REVIEWED_N01_SOURCE_REQUIRED');
  const containerId='68ba17ecef10f3f77ae563b68d68bd146331bf844eeb735a3dae0d7831fd1d0c',apiUrl='http://127.0.0.1:16621';
  // Independently inspected and supplied by main; never learned from a mutable name.
  const image='sha256:21ab971149317ea9cd12a8126fe4ebb34def08c8972956b0958cba0924409dab';
  const startedAt='2026-10-04T09:36:19.169643508Z';
  const dockerConfig=path.join(runtime,n01.marker+'_ABSENT_DOCKER_CONFIG');
  function docker(args,input,timeout=15000){
    assert.equal(fs.existsSync(dockerConfig),false);const env={};
    for(const key of ['SystemRoot','WINDIR','PATH','Path','TEMP','TMP'])if(process.env[key]!==undefined)env[key]=process.env[key];
    const result=spawnSync('C:/Program Files/Docker/Docker/resources/bin/docker.exe',
      ['--config',dockerConfig,'--host','npipe:////./pipe/dockerDesktopLinuxEngine',...args],
      {input,encoding:'utf8',env,shell:false,windowsHide:true,timeout,killSignal:'SIGTERM',maxBuffer:16*1024*1024});
    if(result.error||result.signal||result.status!==0)throw Error('BOUNDED_LOCAL_PROCESS_FAILED');
    return result.stdout.trim();
  }
  const ledgerPath=path.join(runtime,'fixtures-private.json');
  assert.equal(fs.lstatSync(ledgerPath).isSymbolicLink(),false);const ledgerBytes=fs.readFileSync(ledgerPath),ledgerSha256=sha(ledgerBytes);
  // Original private ledger is read once, exclusively at main runtime, never modified.
  const ledger=JSON.parse(ledgerBytes),owner=fixtureOwner(ledger);
  function guard(){
    assert.equal(sha(fs.readFileSync(ledgerPath)),ledgerSha256,'ORIGINAL_LEDGER_CHANGED');
    assert.equal(fs.existsSync(path.join(runtime,'supabase/.temp/project-ref')),false);
    const actual=JSON.parse(docker(['container','inspect',containerId,'--format',
      '{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"startedAt":{{json .State.StartedAt}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"running":{{json .State.Running}},"restarting":{{json .State.Restarting}},"ports":{{json .HostConfig.PortBindings}}}']));
    assert.equal(actual.id,containerId);assert.equal(actual.name,'/supabase_db_algt-f06-local');assert.equal(actual.project,'algt-f06-local');
    assert.equal(actual.image,image);assert.equal(actual.startedAt,startedAt);assert.equal(actual.running,true);assert.equal(actual.restarting,false);
    assert.deepEqual(actual.ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'16622'}]);
  }
  function sql(body,write=false){
    assert.ok(!readOnly||!write,'N01_OBSERVER_CHECKER_IS_READ_ONLY');guard();
    const input=`begin ${write?'read write':'read only'};set local statement_timeout='20s';set local lock_timeout='5s';set local idle_in_transaction_session_timeout='25s';set local transaction_timeout='30s';\n${body}\n${write?'commit':'rollback'};\n`;
    return docker(['exec','-i','-e','PGPASSWORD=postgres',containerId,'psql','-X','-w','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],input,35000);
  }
  const query=body=>JSON.parse(sql(body));
  guard();assert.deepEqual(query(ownerSql(owner)),{company:true,branch:true,admin:true});
  const rule=ownedRule(ledger,query(ruleSql()));
  function providersOff(){assert.equal(sql(`select ((select count(*) from public.erp_email_provider_configs where is_enabled is distinct from false)+(select count(*) from public.erp_ai_provider_configs where is_enabled is distinct from false))::text;`),'0','PROVIDER_ENABLED');}
  function noOtherActor(authId){uuid(authId);assert.equal(sql(`select count(*)::text from public.user_profiles p join auth.users u on u.id=p.auth_user_id where p.status='active' and p.auth_user_id<>${quote(authId)}::uuid and (u.raw_app_meta_data->>'f06_marker') like 'F06%';`),'0','ANOTHER_BROWSER_ACTOR_ACTIVE');}
  providersOff();
  const localFile=name=>{assert.match(name,/^[a-z-]+-private\.(json|jsonl)$/);return path.join(directory,name);};
  function read(name){const p=localFile(name);assert.equal(fs.lstatSync(p).isSymbolicLink(),false);assert.equal(fs.lstatSync(p).isFile(),true);return JSON.parse(fs.readFileSync(p,'utf8'));}
  function durable(fd,value){const bytes=Buffer.from(value);let offset=0;while(offset<bytes.length){const written=fs.writeSync(fd,bytes,offset,bytes.length-offset);assert.ok(written>0);offset+=written;}fs.fsyncSync(fd);}
  function exclusive(name,value){const fd=fs.openSync(localFile(name),'wx',0o600);try{durable(fd,JSON.stringify(value,null,2)+'\n');}finally{fs.closeSync(fd);}}
  let fd,sequence=0,previousEventHash=null,command,commandNonce;
  const events=[];
  function append(event,details={}){const line=JSON.stringify({sequence:++sequence,previousEventHash,at:new Date().toISOString(),command,event,details})+'\n';durable(fd,line);previousEventHash=sha(line);events.push(JSON.parse(line));}
  function validateStored(){
    assert.equal(fs.lstatSync(directory).isSymbolicLink(),false);assert.equal(normalize(fs.realpathSync(directory)),normalize(directory));
    const base=read('reservation-private.json');assert.equal(base.marker,n01.marker);assert.equal(base.email,n01.email);uuid(base.authId);uuid(base.nonce);
    assert.equal(base.sourceSha256,sourceSha256);assert.deepEqual(base.sourceHashes,sourceHashes);assert.equal(base.containerId,containerId);
    assert.equal(base.image,image);assert.equal(base.startedAt,startedAt);assert.equal(base.apiUrl,apiUrl);assert.equal(base.ledgerSha256,ledgerSha256);assert.deepEqual(base.owner,owner);
    const p=localFile('intents-private.jsonl');assert.equal(fs.lstatSync(p).isSymbolicLink(),false);const raw=fs.readFileSync(p,'utf8');assert.ok(raw.endsWith('\n'));
    let previous=null,index=0;const checked=[];
    for(const line of raw.trimEnd().split('\n')){const event=JSON.parse(line);assert.equal(event.sequence,++index);assert.equal(event.previousEventHash,previous);assert.ok(commands.includes(event.command));previous=sha(line+'\n');checked.push(event);}
    assert.equal(checked[0]?.event,'reservation-intent');assert.deepEqual(checked[0].details,base);assert.ok(!checked.some(e=>e.event==='failure-retained'),'FAILED_OUTCOME_REQUIRES_MAIN_RECONCILIATION');
    for(const e of checked.filter(e=>e.event==='receipt-written')){assert.equal(sha(fs.readFileSync(localFile(e.details.name))),e.details.sha256);assert.equal(read(e.details.name).nonce,base.nonce);}
    return {base,events:checked,sequence:index,previousEventHash:previous};
  }
  const lifetime=base=>({kind:'n01',marker:n01.marker,nonce:base.nonce,authId:base.authId,sourceSha256});
  function start(nextCommand,base){
    assert.ok(commands.includes(nextCommand));assert.ok(!readOnly||nextCommand.startsWith('observe-'));command=nextCommand;
    if(command==='resources-prepare'){
      const lock=fs.openSync(lifetimeLock,'wx',0o600);try{durable(lock,JSON.stringify(lifetime(base))+'\n');}finally{fs.closeSync(lock);}
      assert.equal(fs.existsSync(directory),false);fs.mkdirSync(directory,{mode:0o700});fd=fs.openSync(localFile('intents-private.jsonl'),'ax',0o600);
      append('reservation-intent',base);exclusive('reservation-private.json',base);
    }else{
      assert.equal(fs.lstatSync(lifetimeLock).isSymbolicLink(),false);assert.deepEqual(JSON.parse(fs.readFileSync(lifetimeLock,'utf8')),lifetime(base));
      const checked=validateStored();assert.deepEqual(checked.base,base);events.push(...checked.events);sequence=checked.sequence;previousEventHash=checked.previousEventHash;
      fd=fs.openSync(localFile('intents-private.jsonl'),'a',0o600);
    }
    commandNonce=randomUUID();exclusive('command-lock-private.json',{nonce:commandNonce,command,pid:process.pid,sourceSha256});
    exclusive(command+'-attempt-private.json',{nonce:base.nonce,command,sourceSha256});append('command-start',{nonce:base.nonce});
  }
  function receipt(name,value){exclusive(name,value);append('receipt-written',{name,sha256:sha(fs.readFileSync(localFile(name)))});}
  function completed(name){assert.equal(events.filter(e=>e.command===name&&e.event==='command-success').length,1,'PREREQUISITE_NOT_COMPLETE:'+name);}
  function succeed(base){guard();append('command-success',{nonce:base.nonce});const lock=read('command-lock-private.json');assert.equal(lock.nonce,commandNonce);assert.equal(lock.pid,process.pid);fs.unlinkSync(localFile('command-lock-private.json'));
    if(command==='resources-retire'){assert.equal(fs.lstatSync(lifetimeLock).isSymbolicLink(),false);assert.deepEqual(JSON.parse(fs.readFileSync(lifetimeLock,'utf8')),lifetime(base));fs.unlinkSync(lifetimeLock);}}
  function failure(stage){if(fd!==undefined)try{append('failure-retained',{stage,redacted:true,noAutomaticRetry:true});}catch{/* preserve original files */}}
  async function authAdmin(base){
    assert.equal(readOnly,false);uuid(base.authId);guard();const keysPath=path.join(runtime,'keys-private.json');assert.equal(fs.lstatSync(keysPath).isSymbolicLink(),false);
    const keys=JSON.parse(fs.readFileSync(keysPath,'utf8'));assert.equal(keys.API_URL,apiUrl);assert.ok(typeof keys.SERVICE_ROLE_KEY==='string'&&keys.SERVICE_ROLE_KEY.length>30);
    const {createClient}=await import('@supabase/supabase-js');
    const boundedFetch=(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url);assert.equal(url.origin,apiUrl);const method=init.method??'GET';
      assert.ok((method==='GET'&&url.pathname===`/auth/v1/admin/users/${owner.adminAuthId}`)||(method==='POST'&&url.pathname==='/auth/v1/admin/users')||(method==='PUT'&&url.pathname===`/auth/v1/admin/users/${base.authId}`));
      return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});};
    const client=createClient(apiUrl,keys.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:boundedFetch}});
    const checked=await client.auth.admin.getUserById(owner.adminAuthId);assert.equal(Boolean(checked.error),false);assert.equal(checked.data.user?.id,owner.adminAuthId);assert.equal(checked.data.user?.email,'f06-admin@example.invalid');return client.auth.admin;
  }
  return {rule,owner,sourceHashes,sourceSha256,containerId,image,startedAt,apiUrl,ledgerSha256,query,sql,guard,providersOff,noOtherActor,read,exclusive,append,receipt,start,completed,succeed,failure,validateStored,authAdmin,
    close:()=>{if(fd!==undefined)fs.closeSync(fd);},exists:name=>fs.existsSync(localFile(name)),lifetimeLockExists:()=>fs.existsSync(lifetimeLock),
    freshReservation:()=>({marker:n01.marker,email:n01.email,title:n01.title,owner,sourceHashes,sourceSha256,containerId,image,startedAt,apiUrl,ledgerSha256,authId:randomUUID(),nonce:randomUUID(),createdAt:new Date().toISOString()})};
}
