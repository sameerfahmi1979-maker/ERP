// MAIN ONLY runtime factory. Import has no filesystem, process, DB or network effects.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {modeFor,fixtureOwner,ownerSql,quote,uuid,commands} from './scoped-browser-contract.mjs';

export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function openScopedRuntime(modeName,{readOnly=false}={}) {
  const mode=modeFor(modeName),root=path.resolve(import.meta.dirname,'../../..');
  const runtime=path.join(root,'CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06/local');
  const parent=path.join(runtime,'browser-acceptance-private');
  const directory=path.join(parent,'scoped-browser-'+mode.marker);
  const lifetimeLock=path.join(parent,'scoped-browser-lifetime-lock-private.json');
  const containerId='68ba17ecef10f3f77ae563b68d68bd146331bf844eeb735a3dae0d7831fd1d0c';
  const apiUrl='http://127.0.0.1:16621';
  const dockerConfig=path.join(runtime,mode.marker+'_ABSENT_DOCKER_CONFIG');
  const normalized=p=>p.replaceAll('\\','/').toLowerCase();
  assert.equal(normalized(root),'c:/dev/agt-erp-f06');assert.equal(normalized(path.resolve(process.cwd())),normalized(root));
  assert.equal(process.env.ALGT_F06_LOCAL_TARGET,'main-local');
  assert.equal(process.env.ALGT_F06_SCOPED_MODE,modeName);
  // Explicit main assertion, NOT an automatic Windows ACL certification.
  assert.equal(process.env.ALGT_F06_PRIVATE_ACL_CONFIRMED,'protected-local-parent');
  for(const p of [runtime,parent]){assert.equal(fs.lstatSync(p).isSymbolicLink(),false);assert.equal(normalized(fs.realpathSync(p)),normalized(p));}
  assert.ok(fs.readFileSync(path.join(root,'.gitignore'),'utf8').includes('/CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06/'));
  const sources=['scoped-browser-contract.mjs','scoped-browser-runtime.mjs','scoped-browser-acceptance-actor.mjs','scoped-browser-resource-check.mjs'];
  const sourceHashes=Object.fromEntries(sources.map(name=>[name,sha(fs.readFileSync(path.join(import.meta.dirname,name)))]));
  const sourceSha256=sha(JSON.stringify(sourceHashes));
  assert.equal(process.env.ALGT_F06_SCOPED_SOURCE_SHA256,sourceSha256,'REVIEWED_SOURCE_HASH_REQUIRED');
  function docker(args,input,timeout=15000){
    assert.equal(fs.existsSync(dockerConfig),false);
    const env={};for(const key of ['SystemRoot','WINDIR','PATH','Path','TEMP','TMP'])if(process.env[key]!==undefined)env[key]=process.env[key];
    const result=spawnSync('C:/Program Files/Docker/Docker/resources/bin/docker.exe',
      ['--config',dockerConfig,'--host','npipe:////./pipe/dockerDesktopLinuxEngine',...args],
      {input,encoding:'utf8',env,shell:false,windowsHide:true,timeout,killSignal:'SIGTERM',maxBuffer:8*1024*1024});
    if(result.error||result.signal||result.status!==0)throw Error('BOUNDED_LOCAL_PROCESS_FAILED');
    return result.stdout.trim(); // never forward raw database/process diagnostics
  }
  function guard(){
    const item=JSON.parse(docker(['container','inspect',containerId,'--format',
      '{"id":{{json .Id}},"name":{{json .Name}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"running":{{json .State.Running}},"restarting":{{json .State.Restarting}},"ports":{{json .HostConfig.PortBindings}}}']));
    assert.equal(item.id,containerId);assert.equal(item.name,'/supabase_db_algt-f06-local');
    assert.equal(item.project,'algt-f06-local');assert.equal(item.running,true);assert.equal(item.restarting,false);
    assert.deepEqual(item.ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'16622'}]);
    assert.equal(fs.existsSync(path.join(runtime,'supabase/.temp/project-ref')),false);
  }
  function sql(body,write=false){
    assert.ok(!readOnly||!write,'CHECKER_IS_READ_ONLY');guard();
    const input=`begin ${write?'read write':'read only'};set local statement_timeout='20s';set local lock_timeout='5s';
      set local idle_in_transaction_session_timeout='25s';set local transaction_timeout='30s';
      ${body}\n${write?'commit':'rollback'};\n`;
    return docker(['exec','-i','-e','PGPASSWORD=postgres',containerId,'psql','-X','-w','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],input,35000);
  }
  const query=body=>JSON.parse(sql(body));
  guard();
  // Read the fixed private ledger only in main runtime, never in offline tests.
  const owner=fixtureOwner(JSON.parse(fs.readFileSync(path.join(runtime,'fixtures-private.json'),'utf8')));
  assert.deepEqual(query(ownerSql(owner)),{company:true,branch:true,admin:true});
  function providersOff(){assert.equal(sql(`select ((select count(*) from public.erp_email_provider_configs where is_enabled is distinct from false)+(select count(*) from public.erp_ai_provider_configs where is_enabled is distinct from false))::text;`),'0');}
  function noOtherActor(authId){uuid(authId);assert.equal(sql(`select count(*)::text from public.user_profiles p join auth.users u on u.id=p.auth_user_id
    where p.status='active' and p.auth_user_id<>${quote(authId)}::uuid and (u.raw_app_meta_data->>'f06_marker') ~ '^F06(BROWSER|SCOPED)[0-9]';`),'0','ANOTHER_BROWSER_ACTOR_ACTIVE');}
  providersOff();
  const file=name=>{assert.match(name,/^[a-z-]+-private\.(json|jsonl)$/);return path.join(directory,name);};
  function read(name){const p=file(name);assert.equal(fs.lstatSync(p).isSymbolicLink(),false);assert.equal(fs.lstatSync(p).isFile(),true);return JSON.parse(fs.readFileSync(p,'utf8'));}
  function durable(fd,value){const bytes=Buffer.from(value);let offset=0;while(offset<bytes.length){const written=fs.writeSync(fd,bytes,offset,bytes.length-offset);assert.ok(written>0);offset+=written;}fs.fsyncSync(fd);}
  function exclusive(name,value){const fd=fs.openSync(file(name),'wx',0o600);try{durable(fd,JSON.stringify(value,null,2)+'\n');}finally{fs.closeSync(fd);}}
  let fd,sequence=0,previousEventHash=null,lockNonce,command;
  const events=[];
  function append(event,details={}){
    const line=JSON.stringify({sequence:++sequence,previousEventHash,at:new Date().toISOString(),command,event,details})+'\n';
    durable(fd,line);previousEventHash=sha(line);events.push(JSON.parse(line));
  }
  function readJournal(){
    const p=file('intents-private.jsonl');assert.equal(fs.lstatSync(p).isSymbolicLink(),false);
    const raw=fs.readFileSync(p,'utf8');assert.ok(raw.endsWith('\n'));
    const checked=[];let previous=null,index=0;
    for(const line of raw.trimEnd().split('\n')){const event=JSON.parse(line);assert.equal(event.sequence,++index);assert.equal(event.previousEventHash,previous);assert.ok(commands.includes(event.command));previous=sha(line+'\n');checked.push(event);}
    assert.ok(checked.length>0);return {events:checked,sequence:index,previousEventHash:previous};
  }
  function validateStored(){
    assert.equal(fs.lstatSync(directory).isSymbolicLink(),false);assert.equal(normalized(fs.realpathSync(directory)),normalized(directory));
    const reservation=read('reservation-private.json');
    assert.equal(reservation.mode,modeName);assert.equal(reservation.marker,mode.marker);assert.equal(reservation.email,mode.email);
    assert.equal(reservation.sourceSha256,sourceSha256);assert.deepEqual(reservation.sourceHashes,sourceHashes);
    assert.equal(reservation.containerId,containerId);assert.equal(reservation.apiUrl,apiUrl);assert.deepEqual(reservation.owner,owner);
    uuid(reservation.authId);uuid(reservation.nonce);
    const checked=readJournal();
    assert.equal(checked.events.some(e=>e.event==='failure-retained'),false,'FAILED_OUTCOME_REQUIRES_MAIN_RECONCILIATION');
    const first=checked.events[0];assert.equal(first.event,'reservation-intent');assert.deepEqual(first.details,reservation);
    for(const e of checked.events.filter(e=>e.event==='receipt-written')){
      assert.match(e.details.name,/^[a-z-]+-private\.json$/);const bytes=fs.readFileSync(file(e.details.name));
      assert.equal(sha(bytes),e.details.sha256);assert.equal(read(e.details.name).nonce,reservation.nonce);
    }
    return {reservation,...checked};
  }
  function start(nextCommand,reservation){
    assert.equal(readOnly,false);assert.ok(commands.includes(nextCommand));command=nextCommand;
    if(command==='role-prepare'){
      const lifetimeFd=fs.openSync(lifetimeLock,'wx',0o600);
      try{durable(lifetimeFd,JSON.stringify({mode:modeName,nonce:reservation.nonce,authId:reservation.authId,sourceSha256})+'\n');}finally{fs.closeSync(lifetimeFd);}
      assert.equal(fs.existsSync(directory),false);fs.mkdirSync(directory,{mode:0o700});
      fd=fs.openSync(file('intents-private.jsonl'),'ax',0o600);append('reservation-intent',reservation);
      exclusive('reservation-private.json',reservation);
    } else {
      assert.equal(fs.lstatSync(lifetimeLock).isSymbolicLink(),false);
      assert.deepEqual(JSON.parse(fs.readFileSync(lifetimeLock,'utf8')),{mode:modeName,nonce:reservation.nonce,authId:reservation.authId,sourceSha256});
      const checked=validateStored();assert.deepEqual(checked.reservation,reservation);events.push(...checked.events);
      sequence=checked.sequence;previousEventHash=checked.previousEventHash;
      fd=fs.openSync(file('intents-private.jsonl'),'a',0o600);
    }
    lockNonce=randomUUID();exclusive('command-lock-private.json',{nonce:lockNonce,pid:process.pid,command,sourceSha256});
    exclusive(command+'-attempt-private.json',{nonce:reservation.nonce,command,sourceSha256,at:new Date().toISOString()});
    append('command-start',{nonce:reservation.nonce});
  }
  function receipt(name,value){exclusive(name,value);append('receipt-written',{name,sha256:sha(fs.readFileSync(file(name)))});}
  function completed(name){const matches=events.filter(e=>e.event==='command-success'&&e.command===name);assert.equal(matches.length,1,'PREREQUISITE_COMMAND_NOT_COMPLETE');}
  function succeed(reservation){guard();append('command-success',{nonce:reservation.nonce});
    const lock=read('command-lock-private.json');assert.equal(lock.nonce,lockNonce);assert.equal(lock.pid,process.pid);
    fs.unlinkSync(file('command-lock-private.json'));lockNonce=undefined;
    if(command==='role-retire'){
      assert.equal(fs.lstatSync(lifetimeLock).isSymbolicLink(),false);
      assert.deepEqual(JSON.parse(fs.readFileSync(lifetimeLock,'utf8')),{mode:modeName,nonce:reservation.nonce,authId:reservation.authId,sourceSha256});
      fs.unlinkSync(lifetimeLock); // exact owned successful lifetime lock only
    }
  }
  function failure(stage){if(fd!==undefined){try{append('failure-retained',{stage,redacted:true,noAutomaticRetry:true});}catch{/* original evidence stays */}}}
  function close(){if(fd!==undefined)fs.closeSync(fd);}
  async function authAdmin(reservation){
    assert.equal(readOnly,false);uuid(reservation.authId);guard();
    const keys=JSON.parse(fs.readFileSync(path.join(runtime,'keys-private.json'),'utf8'));
    assert.equal(keys.API_URL,apiUrl);assert.ok(typeof keys.SERVICE_ROLE_KEY==='string'&&keys.SERVICE_ROLE_KEY.length>30);
    const {createClient}=await import('@supabase/supabase-js');
    const boundedFetch=(input,init={})=>{
      const url=new URL(typeof input==='string'?input:input.url);assert.equal(url.origin,apiUrl);
      const method=init.method??'GET';
      assert.ok((method==='GET'&&url.pathname===`/auth/v1/admin/users/${owner.adminAuthId}`)
        ||(method==='POST'&&url.pathname==='/auth/v1/admin/users')
        ||(method==='PUT'&&url.pathname===`/auth/v1/admin/users/${reservation.authId}`));
      return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});
    };
    const client=createClient(apiUrl,keys.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:boundedFetch}});
    const check=await client.auth.admin.getUserById(owner.adminAuthId);
    assert.equal(Boolean(check.error),false);assert.equal(check.data.user?.id,owner.adminAuthId);assert.equal(check.data.user?.email,'f06-admin@example.invalid');
    return client.auth.admin;
  }
  return {mode,owner,root,directory,sourceHashes,sourceSha256,apiUrl,containerId,query,sql,guard,providersOff,noOtherActor,
    read,exclusive,append,receipt,start,completed,succeed,failure,close,validateStored,authAdmin,
    lifetimeLockExists:()=>fs.existsSync(lifetimeLock),
    exists:name=>fs.existsSync(file(name)),freshReservation:()=>({mode:modeName,marker:mode.marker,email:mode.email,
      owner,sourceHashes,sourceSha256,containerId,apiUrl,authId:randomUUID(),nonce:randomUUID(),createdAt:new Date().toISOString()})};
}
