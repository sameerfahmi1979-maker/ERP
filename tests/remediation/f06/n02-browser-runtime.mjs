// MAIN ONLY factory. Importing this file performs no runtime I/O.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {n02,commands,sha,uuid,quote,fixtureOwner,ownerSql,ownedRule,ruleSql,permissionsSql,validatePermissions,
 bucketSql,storageSecuritySql,assertBuckets,prefixFor,sourceBytes,sourceDigest,assertObject} from './n02-browser-contract.mjs';

export function openN02Runtime({readOnly=false}={}){
 const root=path.resolve(import.meta.dirname,'../../..'),normalize=p=>p.replaceAll('\\','/').toLowerCase();
 assert.equal(normalize(root),'c:/dev/agt-erp-f06');assert.equal(normalize(path.resolve(process.cwd())),normalize(root));
 assert.equal(process.env.ALGT_F06_LOCAL_TARGET,'main-local');assert.equal(process.env.ALGT_F06_N02_MARKER,n02.marker);
 assert.equal(process.env.ALGT_F06_PRIVATE_ACL_CONFIRMED,'protected-local-parent');
 const runtime=path.join(root,'CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06/local'),parent=path.join(runtime,'browser-acceptance-private');
 const directory=path.join(parent,'n02-browser-'+n02.marker),lifetimeLock=path.join(parent,'scoped-browser-lifetime-lock-private.json');
 for(const p of [runtime,parent]){assert.equal(fs.lstatSync(p).isSymbolicLink(),false);assert.equal(normalize(fs.realpathSync(p)),normalize(p));}
 assert.ok(fs.readFileSync(path.join(root,'.gitignore'),'utf8').includes('/CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06/'));
 const files=['n02-browser-contract.mjs','n02-browser-runtime.mjs','n02-browser-fixture.mjs','n02-browser-resource-check.mjs','scoped-browser-contract.mjs','n01-browser-contract.mjs'];
 const sourceHashes=Object.fromEntries(files.map(name=>[name,sha(fs.readFileSync(path.join(import.meta.dirname,name)))]));
 assert.equal(sourceHashes['scoped-browser-contract.mjs'],'0133e989085edece067a45e6bd97bd1980411cc0525ef4ce64d84260ff8a32ed','UNCHANGED_PURE_DEPENDENCY_REQUIRED');
 assert.equal(sourceHashes['n01-browser-contract.mjs'],'21394d4a60a74ea54307ecfcd714a12bda5801d180fea5144437b8758c040aa1','UNCHANGED_PURE_DEPENDENCY_REQUIRED');
 const sourceSha256=sha(JSON.stringify(sourceHashes));assert.equal(process.env.ALGT_F06_N02_SOURCE_SHA256,sourceSha256,'REVIEWED_N02_SOURCE_REQUIRED');
 const containerId='68ba17ecef10f3f77ae563b68d68bd146331bf844eeb735a3dae0d7831fd1d0c',apiUrl='http://127.0.0.1:16621';
 // Supplied and freshly reconfirmed by main; no mutable-name discovery.
 const image='sha256:21ab971149317ea9cd12a8126fe4ebb34def08c8972956b0958cba0924409dab',startedAt='2026-10-04T09:36:19.169643508Z';
 const dockerConfig=path.join(runtime,n02.marker+'_ABSENT_DOCKER_CONFIG');
 function docker(args,input,timeout=15000){
  assert.equal(fs.existsSync(dockerConfig),false);const env={};for(const key of ['SystemRoot','WINDIR','PATH','Path','TEMP','TMP'])if(process.env[key]!==undefined)env[key]=process.env[key];
  const result=spawnSync('C:/Program Files/Docker/Docker/resources/bin/docker.exe',['--config',dockerConfig,'--host','npipe:////./pipe/dockerDesktopLinuxEngine',...args],
   {input,encoding:'utf8',env,shell:false,windowsHide:true,timeout,killSignal:'SIGTERM',maxBuffer:16*1024*1024});
  if(result.error||result.signal||result.status!==0)throw Error('BOUNDED_LOCAL_PROCESS_FAILED');return result.stdout.trim();
 }
 const ledgerPath=path.join(runtime,'fixtures-private.json');assert.equal(fs.lstatSync(ledgerPath).isSymbolicLink(),false);
 const ledgerBytes=fs.readFileSync(ledgerPath),ledgerSha256=sha(ledgerBytes),ledger=JSON.parse(ledgerBytes),owner=fixtureOwner(ledger);
 function guard(){
  assert.equal(sha(fs.readFileSync(ledgerPath)),ledgerSha256,'ORIGINAL_LEDGER_CHANGED');assert.equal(fs.existsSync(path.join(runtime,'supabase/.temp/project-ref')),false);
  const actual=JSON.parse(docker(['container','inspect',containerId,'--format','{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"startedAt":{{json .State.StartedAt}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"running":{{json .State.Running}},"restarting":{{json .State.Restarting}},"ports":{{json .HostConfig.PortBindings}}}']));
  assert.equal(actual.id,containerId);assert.equal(actual.name,'/supabase_db_algt-f06-local');assert.equal(actual.project,'algt-f06-local');assert.equal(actual.image,image);assert.equal(actual.startedAt,startedAt);
  assert.equal(actual.running,true);assert.equal(actual.restarting,false);assert.deepEqual(actual.ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'16622'}]);
 }
 function sql(body,write=false){
  assert.ok(!readOnly||!write,'N02_OBSERVER_CHECKER_IS_READ_ONLY');guard();
  const input=`begin ${write?'read write':'read only'};set local statement_timeout='20s';set local lock_timeout='5s';set local idle_in_transaction_session_timeout='25s';set local transaction_timeout='30s';\n${body}\n${write?'commit':'rollback'};\n`;
  return docker(['exec','-i','-e','PGPASSWORD=postgres',containerId,'psql','-X','-w','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],input,35000);
 }
 const query=body=>JSON.parse(sql(body));guard();assert.deepEqual(query(ownerSql(owner)),{company:true,branch:true,admin:true});
 const rule=ownedRule(ledger,query(ruleSql())),permissions=validatePermissions(n02,query(permissionsSql(n02))),buckets=assertBuckets(query(bucketSql())),storageSecurity=query(storageSecuritySql());
 for(const bucket of buckets){
  assert.equal(ledger.rows.filter(r=>r.table==='storage.buckets'&&r.id===bucket.id&&r.marker==='F06_UPLOAD_PRIVATE_BUCKETS_20261004').length,1,'EXACT_BUCKET_PROVENANCE_REQUIRED');
  assert.ok(ledger.intents.some(i=>i.marker==='F06_UPLOAD_PRIVATE_BUCKETS_20261004'&&i.table==='storage.buckets'&&i.id===bucket.id&&i.public===false&&i.operation==='Create exact isolated private synthetic upload bucket; retain with test history'),'EXACT_BUCKET_INTENT_REQUIRED');
 }
 const storageYear=Number(sql('select extract(year from current_timestamp)::integer;'));assert.ok(Number.isInteger(storageYear)&&storageYear>=2000&&storageYear<=9999);
 function providersOff(){assert.equal(sql(`select ((select count(*) from public.erp_email_provider_configs where is_enabled is distinct from false)+(select count(*) from public.erp_ai_provider_configs where is_enabled is distinct from false))::text;`),'0','PROVIDER_ENABLED');}
 function noOtherActor(authId){uuid(authId);assert.equal(sql(`select count(*)::text from public.user_profiles p join auth.users u on u.id=p.auth_user_id where p.status='active' and p.auth_user_id<>${quote(authId)}::uuid and (u.raw_app_meta_data->>'f06_marker') like 'F06%';`),'0','ANOTHER_BROWSER_ACTOR_ACTIVE');}
 providersOff();
 const localFile=name=>{assert.match(name,/^[a-z-]+-private\.(json|jsonl)$/);return path.join(directory,name);};
 function read(name){const p=localFile(name);assert.equal(fs.lstatSync(p).isSymbolicLink(),false);assert.equal(fs.lstatSync(p).isFile(),true);return JSON.parse(fs.readFileSync(p,'utf8'));}
 function durable(fd,value){const bytes=Buffer.from(value);let offset=0;while(offset<bytes.length){const wrote=fs.writeSync(fd,bytes,offset,bytes.length-offset);assert.ok(wrote>0);offset+=wrote;}fs.fsyncSync(fd);}
 function exclusive(name,value){const fd=fs.openSync(localFile(name),'wx',0o600);try{durable(fd,JSON.stringify(value,null,2)+'\n');}finally{fs.closeSync(fd);}}
 let fd,sequence=0,previousEventHash=null,command,commandNonce;const events=[];
 function append(event,details={}){const line=JSON.stringify({sequence:++sequence,previousEventHash,at:new Date().toISOString(),command,event,details})+'\n';durable(fd,line);previousEventHash=sha(line);events.push(JSON.parse(line));}
 function validateStored(){
  assert.equal(fs.lstatSync(directory).isSymbolicLink(),false);assert.equal(normalize(fs.realpathSync(directory)),normalize(directory));const base=read('reservation-private.json');
  assert.equal(base.marker,n02.marker);assert.equal(base.email,n02.email);uuid(base.authId);uuid(base.nonce);assert.equal(base.sourceSha256,sourceSha256);assert.deepEqual(base.sourceHashes,sourceHashes);
  assert.equal(base.containerId,containerId);assert.equal(base.image,image);assert.equal(base.startedAt,startedAt);assert.equal(base.apiUrl,apiUrl);assert.equal(base.ledgerSha256,ledgerSha256);assert.deepEqual(base.owner,owner);assert.deepEqual(base.buckets,buckets);assert.deepEqual(base.permissions,permissions);assert.deepEqual(base.storageSecurity,storageSecurity,'STORAGE_SECURITY_CHANGED');
  // A year change before dispatch requires separate reviewed continuation, not
  // inventing a different destination prefix under an old reservation.
  assert.equal(base.storageYear,storageYear,'RESERVED_STORAGE_YEAR_CHANGED');assert.equal(base.destinationPrefix,prefixFor(base));
  const p=localFile('intents-private.jsonl');assert.equal(fs.lstatSync(p).isSymbolicLink(),false);const raw=fs.readFileSync(p,'utf8');assert.ok(raw.endsWith('\n'));
  let previous=null,index=0;const checked=[];for(const line of raw.trimEnd().split('\n')){const e=JSON.parse(line);assert.equal(e.sequence,++index);assert.equal(e.previousEventHash,previous);assert.ok(commands.includes(e.command));previous=sha(line+'\n');checked.push(e);}
  assert.equal(checked[0]?.event,'reservation-intent');assert.deepEqual(checked[0].details,base);assert.ok(!checked.some(e=>e.event==='failure-retained'),'FAILED_OUTCOME_REQUIRES_MAIN_RECONCILIATION');
  for(const e of checked.filter(e=>e.event==='receipt-written')){assert.equal(sha(fs.readFileSync(localFile(e.details.name))),e.details.sha256);assert.equal(read(e.details.name).nonce,base.nonce);}
  return {base,events:checked,sequence:index,previousEventHash:previous};
 }
 const lifetime=base=>({kind:'n02',marker:n02.marker,nonce:base.nonce,authId:base.authId,sourceSha256});
 function start(next,base){
  assert.ok(commands.includes(next));assert.ok(!readOnly||next.startsWith('observe-'));command=next;
  if(next==='resources-prepare'){
   const lock=fs.openSync(lifetimeLock,'wx',0o600);try{durable(lock,JSON.stringify(lifetime(base))+'\n');}finally{fs.closeSync(lock);}
   assert.equal(fs.existsSync(directory),false);fs.mkdirSync(directory,{mode:0o700});fd=fs.openSync(localFile('intents-private.jsonl'),'ax',0o600);append('reservation-intent',base);exclusive('reservation-private.json',base);
  }else{
   assert.equal(fs.lstatSync(lifetimeLock).isSymbolicLink(),false);assert.deepEqual(JSON.parse(fs.readFileSync(lifetimeLock,'utf8')),lifetime(base));const checked=validateStored();assert.deepEqual(checked.base,base);
   events.push(...checked.events);sequence=checked.sequence;previousEventHash=checked.previousEventHash;fd=fs.openSync(localFile('intents-private.jsonl'),'a',0o600);
  }
  commandNonce=randomUUID();exclusive('command-lock-private.json',{nonce:commandNonce,command,pid:process.pid,sourceSha256});exclusive(command+'-attempt-private.json',{nonce:base.nonce,command,sourceSha256});append('command-start',{nonce:base.nonce});
 }
 function receipt(name,value){exclusive(name,value);append('receipt-written',{name,sha256:sha(fs.readFileSync(localFile(name)))});}
 function completed(name){assert.equal(events.filter(e=>e.command===name&&e.event==='command-success').length,1,'PREREQUISITE_NOT_COMPLETE:'+name);}
 function succeed(base){guard();assert.deepEqual(query(bucketSql()),base.buckets);assert.deepEqual(query(storageSecuritySql()),base.storageSecurity);append('command-success',{nonce:base.nonce});const lock=read('command-lock-private.json');assert.equal(lock.nonce,commandNonce);assert.equal(lock.pid,process.pid);fs.unlinkSync(localFile('command-lock-private.json'));
  if(command==='resources-retire'){assert.deepEqual(JSON.parse(fs.readFileSync(lifetimeLock,'utf8')),lifetime(base));fs.unlinkSync(lifetimeLock);}}
 function failure(stage){if(fd!==undefined)try{append('failure-retained',{stage,redacted:true,noAutomaticRetry:true});}catch{/* retain original evidence */}}
 async function clientFor(base,{auth=false,storagePaths=[],writeSource=false}={}){
  guard();uuid(base.authId);if(auth)assert.equal(readOnly,false);if(writeSource){assert.equal(readOnly,false);assert.equal(command,'actor-source-prepare');}
  for(const [bucket,p] of storagePaths){assert.ok((bucket==='dms-temp'&&p===n02.sourcePath)||(bucket==='dms-documents'&&p.startsWith(base.destinationPrefix)&&/^[1-9][0-9]*\/v1\/original\.txt$/.test(p.slice(base.destinationPrefix.length))));}
  const keyPath=path.join(runtime,'keys-private.json');assert.equal(fs.lstatSync(keyPath).isSymbolicLink(),false);const keys=JSON.parse(fs.readFileSync(keyPath,'utf8'));
  assert.equal(keys.API_URL,apiUrl);assert.ok(typeof keys.SERVICE_ROLE_KEY==='string'&&keys.SERVICE_ROLE_KEY.length>30);
  const {createClient}=await import('@supabase/supabase-js');let sourcePosts=0;
  const boundedFetch=(input,init={})=>{
   const url=new URL(typeof input==='string'?input:input.url),method=init.method??'GET';assert.equal(url.origin,apiUrl);assert.equal(url.search,'');assert.equal(url.hash,'');
   const ownerRead=method==='GET'&&url.pathname===`/auth/v1/admin/users/${owner.adminAuthId}`;
   const authWrite=auth&&((method==='POST'&&url.pathname==='/auth/v1/admin/users')||(method==='PUT'&&url.pathname===`/auth/v1/admin/users/${base.authId}`));
   const storageRead=method==='GET'&&storagePaths.some(([b,p])=>url.pathname===`/storage/v1/object/${b}/${p}`||url.pathname===`/storage/v1/object/info/${b}/${p}`);
   const upload=writeSource&&method==='POST'&&url.pathname===`/storage/v1/object/dms-temp/${n02.sourcePath}`;
   assert.ok(ownerRead||authWrite||storageRead||upload,'EXACT_LOCAL_API_ALLOWLIST_ONLY');if(upload){assert.equal(++sourcePosts,1,'NO_SOURCE_RETRY');assert.equal(new Headers(init.headers).get('x-upsert'),'false');}
   return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});
  };
  const client=createClient(apiUrl,keys.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:boundedFetch}});
  const checked=await client.auth.admin.getUserById(owner.adminAuthId);assert.equal(Boolean(checked.error),false);assert.equal(checked.data.user?.id,owner.adminAuthId);assert.equal(checked.data.user?.email,'f06-admin@example.invalid');return client;
 }
 async function authAdmin(base){return (await clientFor(base,{auth:true})).auth.admin;}
 async function uploadSource(base){
  const client=await clientFor(base,{storagePaths:[['dms-temp',n02.sourcePath]],writeSource:true});
  const result=await client.storage.from('dms-temp').upload(n02.sourcePath,sourceBytes(),{contentType:n02.mime,upsert:false});assert.equal(Boolean(result.error),false,'OWNED_SOURCE_UPLOAD_UNCONFIRMED');return {id:result.data.id,path:result.data.path};
 }
 async function verifyBytes(base,objects){
  assert.ok(objects.length>=1&&objects.length<=2);const paths=objects.map(o=>[o.bucket_id,o.name]);const client=await clientFor(base,{storagePaths:paths});const results=[];
  for(const o of objects){assertObject(o,o.bucket_id,o.name);const api=client.storage.from(o.bucket_id),before=await api.info(o.name);assert.equal(Boolean(before.error),false);
   const identity=value=>{assert.equal(value.id,o.id);assert.equal(value.version,o.version);assert.equal(new Date(value.lastModified).toISOString(),new Date(o.updated_at).toISOString());return {id:value.id,version:value.version,lastModified:value.lastModified};};
   const a=identity(before.data);const file=await api.download(o.name,{}, {cache:'no-store'});assert.equal(Boolean(file.error),false);assert.equal(file.data?.size,sourceBytes().length);const contentSha256=sha(Buffer.from(await file.data.arrayBuffer()));assert.equal(contentSha256,sourceDigest());
   const after=await api.info(o.name);assert.equal(Boolean(after.error),false);assert.deepEqual(identity(after.data),a);results.push({bucket:o.bucket_id,path:o.name,objectId:o.id,version:o.version,apiLastModified:a.lastModified,databaseUpdatedAt:o.updated_at,contentSha256,size:sourceBytes().length});
  }return results;
 }
 return {rule,permissions,buckets,owner,sourceHashes,sourceSha256,containerId,image,startedAt,apiUrl,ledgerSha256,storageYear,query,sql,guard,providersOff,noOtherActor,read,exclusive,append,receipt,start,completed,succeed,failure,validateStored,authAdmin,uploadSource,verifyBytes,
  close:()=>{if(fd!==undefined)fs.closeSync(fd);},exists:name=>fs.existsSync(localFile(name)),lifetimeLockExists:()=>fs.existsSync(lifetimeLock),
  freshReservation:()=>{const base={marker:n02.marker,email:n02.email,title:n02.title,owner,sourceHashes,sourceSha256,containerId,image,startedAt,apiUrl,ledgerSha256,permissions,buckets,storageSecurity,storageYear,authId:randomUUID(),nonce:randomUUID(),createdAt:new Date().toISOString()};return {...base,sourcePath:n02.sourcePath,sourceContentSha256:sourceDigest(),sourceSize:sourceBytes().length,destinationPrefix:prefixFor(base),destinationFormula:'<exact-new-document-id>/v1/original.txt'};}};
}
