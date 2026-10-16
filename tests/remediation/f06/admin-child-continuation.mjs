// MAIN ONLY, exact failed AC lifetime continuation. Import performs no I/O.
// The original failure is never relabelled; no date-entry/browser recovery claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {ac,commands,stages,sha,uuid,id,json,quote,payloads,variants,observationSql,assertObservation,
 assertAppendOnlyHistory,resourcesSql,assertResources,resourceSpecs,actorSql,assertRoles,assertActor,
 actorPrepareSql,actorRetireSql,resourceRetireSql,identitySql,inventorySql,preservationSql,preserveExcept} from './admin-child-browser-contract.mjs';

export const exact=Object.freeze({nonce:'31f290a2-bca5-4e47-a9e5-1728ac32f5f7',editorAuth:'3690dfff-9547-4a53-a1ae-3514bf088f25',readerAuth:'224f49c9-e841-4128-ac21-ceba8aeef66a',profileId:17,signatoryId:41,companyId:1,branchId:1,
 operationId:'9291ffdc-927f-4687-8442-4daa7c185c62',requestHash:'fe76f9333620d5bb630156013f3ef7a1be4657cb2c9ced5255d712ad44a8ecab'});
export const originalSources=Object.freeze({
 'admin-child-browser-contract.mjs':'3730a4ab51d47918d1677c15e176af25cd621f6bb8e5f95678e5914bbcb290b8',
 'admin-child-browser-runtime.mjs':'79344c81e63059f41108882d930a8859ec99df9a5708f49c658c3b6951f0ed1a',
 'admin-child-browser-fixture.mjs':'31777083bb250f20524adfc2d6006b639bfd46e42303bd69019f910bbc8cda04',
 'admin-child-browser-resource-check.mjs':'cc5f82eb4519a23a1361e730656fcdcd75759892e3ab451ab95c59e1de3cd174',
 'admin-child-browser-authoring.test.ts':'a3d0cb30d36a390398cd50da1c5c420f0e10db9ce0c0b52582f2bafc28ae4e77'});
export const originalEvidence=Object.freeze({
 'reservation-private.json':'f25d41c5efd7e5cac6e5956b1fd61e616939c5e13ab3dfebe6375f32b69d6142',
 'resources-prepare-private.json':'6e58966a9ff7a1a1c1792e700c7dab5cfee18a1b1576edd214528e44a2b4f1d5',
 'editor-prepare-private.json':'76a2d7fc0b91aa857e02c6bd5b837972d2595f08eca6f192971d755264e9a348',
 'observe-signatory-invalid-private.json':'af617a2873e8e61d17a988fc3097b8ac36a0569cd3ab6d1399676bc463d7865d',
 'observe-signatory-created-attempt-private.json':'e8436020c4d945b3cb30ffc19a932f747e9fe921708f3a933157be25177368e6',
 'command-lock-private.json':'c2b9ab63b5af99cc662c95a3c861821b069e551e7f83c06987a03f90679756aa',
 'intents-private.jsonl':'a07e6717fee4c7d87720c567cac8d7caf7f23af8f046a1d5436060332ec4cbc7',
 'main-signatory-failure-capture-private.json':'6137c71e7c159071e4d67e9fa97378e7207bc00fb2dae56da356ee323f045be5'});
export const lifetimeHash='ddcd42379bae2d7e2fd9518ab645c55709b262a5b2db43649274b203e0827c87';
export const originalPrefix=Object.freeze(commands.slice(0,commands.indexOf('observe-signatory-created')));
export const continuationStages=Object.freeze(stages.slice(stages.indexOf('signatory-edited')));
export const continuationCommands=Object.freeze(['reconcile-null-date-signatory',...continuationStages.map(s=>'observe-'+s),'editor-retire','reader-prepare','observe-reader','reader-retire','resources-retire']);
export const limitations=Object.freeze({originalObserverFailureRetained:true,signatoryDateEntryAcceptance:'OPEN_UNVERIFIED',financeReadUIRecovery:'FAILED',financeReadRecoveredObservation:'DATABASE_UNCHANGED_ONLY',browserPassClaim:false,replayClaim:false,repairs:0});
export const withoutNullHashes=o=>Object.fromEntries(Object.entries(o).filter(([key])=>key!=='nullDateHashes'));
export function decodeChain(raw){assert.ok(raw.endsWith('\n'),'INCOMPLETE_JOURNAL');let index=0,previous=null;return raw.trimEnd().split('\n').map(line=>{const e=JSON.parse(line);assert.equal(e.sequence,++index);assert.equal(e.previousEventHash,previous);previous=sha(line+'\n');return e;});}
export function assertOriginalFailure(raw,records){
 const events=decodeChain(raw),base=records['reservation-private.json'];assert.equal(events[0].event,'reservation-intent');assert.deepEqual(events[0].details,base);
 assert.deepEqual(events.filter(e=>e.event==='command-success').map(e=>e.command),originalPrefix);
 assert.deepEqual(events.filter(e=>e.event==='command-start').map(e=>e.command),[...originalPrefix,'observe-signatory-created']);
 const failed=events.filter(e=>e.event==='failure-retained');assert.equal(failed.length,1);assert.equal(failed[0],events.at(-1));assert.equal(failed[0].command,'observe-signatory-created');assert.deepEqual(failed[0].details,{stage:'preflight',redacted:true,noAutomaticRetry:true});
 assert.deepEqual(events.filter(e=>e.command==='observe-signatory-created').map(e=>e.event),['command-start','failure-retained']);
 assert.deepEqual(records['observe-signatory-created-attempt-private.json'],{command:'observe-signatory-created',nonce:base.nonce,sourceSha256:base.sourceSha256});
 const lock=records['command-lock-private.json'];uuid(lock.nonce);assert.ok(Number.isSafeInteger(lock.pid)&&lock.pid>0);assert.equal(lock.command,'observe-signatory-created');assert.equal(lock.sourceSha256,base.sourceSha256);
 assert.deepEqual(events.filter(e=>e.event==='receipt-written').map(e=>e.details.name),originalPrefix.map(c=>c+'-private.json'));return events;
}
export function assertExactIdentity(base,r,editor){
 assert.equal(base.nonce,exact.nonce);assert.equal(base.marker,ac.marker);assert.equal(base.actors.editor.authId,exact.editorAuth);assert.equal(base.actors.reader.authId,exact.readerAuth);
 assert.equal(base.owner.companyId,exact.companyId);assert.equal(base.owner.branchId,exact.branchId);assert.equal(editor.profileId,exact.profileId);
 assert.deepEqual(r.ids,{party:3039,nature:126,status:126,country:176,category:106,costType:28,costParent:69,profitType:29,profitParent:66});
}
export function nullDateVariants(base,r){return variants(base,r).filter(v=>['signatory-created','signatory-edited','signatory-noop'].includes(v[0])).map(v=>{const copy=[...v];copy[5]={...v[5],effective_from:null,effective_to:null};return copy;});}
export function continuationObservationSql(base,r,editor){
 assertExactIdentity(base,r,editor);const parts=nullDateVariants(base,r).map(([name,,target,revision,action,data])=>`${quote(name)},encode(sha256(convert_to(jsonb_build_array('company-signatory',${exact.companyId},${target?exact.signatoryId:'null'},${revision??'null'},${quote(action)},${json(data)})::text,'UTF8')),'hex')`);
 return `with original(observation) as (${observationSql(base,r,editor).trim().replace(/;$/,'')}) select observation || jsonb_build_object('nullDateHashes',jsonb_build_object(${parts.join(',')})) from original;`;
}
// Validate the exact NULL-date request and facts before adapting only an in-memory
// copy for the frozen original assertion. RAW evidence is never normalized/written.
export function normalizedObservation(raw,base,r,editor){
 assertExactIdentity(base,r,editor);assert.deepEqual(Object.keys(raw.nullDateHashes).sort(),nullDateVariants(base,r).map(v=>v[0]).sort());
 for(const hash of Object.values(raw.nullDateHashes))assert.match(hash,/^[a-f0-9]{64}$/);assert.equal(raw.nullDateHashes['signatory-created'],exact.requestHash);
 assert.equal(new Set(Object.values(raw.nullDateHashes)).size,3,'DISTINCT_NULL_DATE_HASHES_REQUIRED');
 const row=raw.rows.signatory[0];assert.equal(raw.rows.signatory.length,1);assert.equal(row.id,exact.signatoryId);assert.equal(row.company_id,exact.companyId);assert.equal(row.effective_from,null,'NULL_DATE_BOUNDARY');assert.equal(row.effective_to,null,'NULL_DATE_BOUNDARY');
 const created=raw.receipts.filter(x=>x.operation_id===exact.operationId);assert.equal(created.length,1);assert.equal(created[0].request_hash,exact.requestHash);assert.equal(created[0].entity,'owner_company_signatories');assert.equal(created[0].record_id,exact.signatoryId);assert.equal(created[0].actor,exact.editorAuth);
 const copy=structuredClone(withoutNullHashes(raw)),names=Object.keys(raw.nullDateHashes),expected=payloads(base,r).signatory;
 for(const receipt of copy.receipts){if(receipt.entity!=='owner_company_signatories')continue;assert.equal(receipt.actor,exact.editorAuth);assert.equal(receipt.record_id,exact.signatoryId);
  const name=names.find(name=>raw.nullDateHashes[name]===receipt.request_hash);
  if(name){if(name==='signatory-created')assert.equal(receipt.operation_id,exact.operationId);receipt.request_hash=raw.hashes[name];}
  else assert.ok(['signatory-archived','signatory-restored','signatory-final-archived'].some(name=>raw.hashes[name]===receipt.request_hash),'UNKNOWN_SIGNATORY_REQUEST');
 }
 copy.rows.signatory[0].effective_from=expected.effective_from;copy.rows.signatory[0].effective_to=expected.effective_to;return copy;
}
export function assertRawObservation(raw,base,r,editor,stage,options={}){return assertObservation(normalizedObservation(raw,base,r,editor),base,r,editor,stage,options);}
export function assertStageTransition(prior,current,stage){
 assertAppendOnlyHistory(prior,current);
 if(stage.endsWith('-invalid')||stage.endsWith('-replayed')||stage==='finance-read-recovered'||stage==='reader')assert.deepEqual(current,prior,'READ_INVALID_REPLAY_CHANGED_HISTORY');
 if(stage.endsWith('-noop')){assert.deepEqual(current.rows,prior.rows,'NOOP_CHANGED_TARGET');assert.deepEqual(current.audits,prior.audits,'NOOP_ADDED_AUDIT');}
 const changedKey={'finance-created':'finance','service-created':'service','service-removed':'service','signatory-created':'signatory','signatory-edited':'signatory','signatory-archived':'signatory','signatory-restored':'signatory','signatory-final-archived':'signatory','cost-created':'cost','profit-created':'profit'}[stage];
 for(const key of Object.keys(current.rows)){if(changedKey!==key)assert.deepEqual(current.rows[key],prior.rows[key],'UNRELATED_OWNED_ROW_CHANGED:'+key);
  else if(prior.rows[key].length){const allowed=stage==='signatory-edited'?['notes']:stage==='service-removed'?['is_active']:stage.startsWith('signatory-')?['deleted_at']:[];preserveExcept(prior.rows[key][0],current.rows[key][0],[...allowed,'workspace_revision','updated_at','updated_by']);}}
}
export function assertReconciliation(capture,current,base,r,editor){
 assert.equal(capture.state,'READ_ONLY_KNOWN_FAILURE_CAPTURE_NOT_ACCEPTANCE');assert.equal(capture.nonce,base.nonce);assert.equal(capture.sourceSha256,base.sourceSha256);
 assert.equal(capture.journalSha256,originalEvidence['intents-private.jsonl']);assert.equal(capture.lockSha256,originalEvidence['command-lock-private.json']);
 assert.equal(capture.originalCompanyBranchAndTypesUnchanged,true);assert.equal(capture.otherBusinessAndIdentityUnchanged,true);assert.equal(capture.noRepair,true);
 assert.deepEqual(withoutNullHashes(current.observation),capture.observation,'CAPTURED_NULL_DATE_STATE_CHANGED');assert.deepEqual(current.rows,capture.rows);assert.deepEqual(current.state,capture.actor);
 assertRawObservation(current.observation,base,r,editor,'signatory-created');
}
export function guardResourceRowsSql(r,rows){return `do $g$ begin perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));perform pg_advisory_xact_lock(hashtextextended('f06-party-relations',0));perform pg_advisory_xact_lock(hashtextextended('f06-party-admin-masters-relations',0));perform pg_advisory_xact_lock(hashtextextended('f06-finance-relationships',0));${Object.entries(resourceSpecs).map(([key,[table]])=>`perform 1 from public.${table} where id=${id(r.ids[key])} for update;if (select to_jsonb(r) from public.${table} r where id=${r.ids[key]}) is distinct from ${json(rows[key])} then raise exception 'RESOURCE_PREIMAGE_CHANGED';end if;`).join('\n')}end $g$;`;}
export function assertRetiredResources(before,after){for(const key of Object.keys(resourceSpecs)){const deactivated=['country','party','costType','profitType','costParent','profitParent'].includes(key);preserveExcept(before[key],after[key],['is_active','updated_at','workspace_revision',...(deactivated?['deactivated_at','deactivation_reason']:[])]);if(deactivated){assert.ok(after[key].deactivated_at);assert.equal(after[key].deactivation_reason,ac.marker+' retired');}if(Object.hasOwn(before[key],'workspace_revision'))assert.equal(BigInt(after[key].workspace_revision),BigInt(before[key].workspace_revision)+BigInt(1));}}
export function assertRetiredObservation(before,after){assertAppendOnlyHistory(before,after);assert.deepEqual(after.audits,before.audits);assert.deepEqual(after.receipts,before.receipts);for(const key of ['finance','service','signatory'])assert.deepEqual(after.rows[key],before.rows[key]);for(const key of ['cost','profit']){preserveExcept(before.rows[key][0],after.rows[key][0],['is_active','deactivated_at','deactivation_reason','updated_at','workspace_revision']);assert.equal(after.rows[key][0].deactivation_reason,ac.marker+' retired');assert.ok(after.rows[key][0].deactivated_at);}}

export async function openACContinuation({readOnly=false,checker=false}={}){
 const root=path.resolve(import.meta.dirname,'../../..'),normal=p=>p.replaceAll('\\','/').toLowerCase();assert.equal(normal(root),'c:/dev/agt-erp-f06');assert.equal(normal(process.cwd()),normal(root));
 assert.equal(process.env.ALGT_F06_AC_CONTINUATION,'exact-null-date-signatory-41');
 for(const [name,hash] of Object.entries(originalSources))assert.equal(sha(fs.readFileSync(path.join(import.meta.dirname,name))),hash,'FROZEN_SOURCE_CHANGED');
 const sourceHashes=Object.fromEntries(['admin-child-continuation.mjs','admin-child-continuation-resource-check.mjs','admin-child-continuation.test.ts'].map(name=>[name,sha(fs.readFileSync(path.join(import.meta.dirname,name)))]));const sourceSha256=sha(JSON.stringify(sourceHashes));assert.equal(process.env.ALGT_F06_AC_CONTINUATION_SOURCE_SHA256,sourceSha256,'REVIEWED_CONTINUATION_REQUIRED');
 const {openACRuntime}=await import('./admin-child-browser-runtime.mjs');const rt=openACRuntime({readOnly});
 const runtime=path.join(root,'CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06/local'),parent=path.join(runtime,'browser-acceptance-private'),original=path.join(parent,'admin-child-browser-'+ac.marker),directory=path.join(parent,'admin-child-continuation-'+ac.marker),lifetime=path.join(parent,'scoped-browser-lifetime-lock-private.json');
 const checked=p=>{assert.equal(fs.lstatSync(p).isSymbolicLink(),false);assert.equal(normal(fs.realpathSync(p)),normal(p));return p;};checked(parent);checked(original);
 const originals={};for(const [name,hash] of Object.entries(originalEvidence)){const bytes=fs.readFileSync(checked(path.join(original,name)));assert.equal(sha(bytes),hash,'ORIGINAL_FAILURE_EVIDENCE_CHANGED');originals[name]=name.endsWith('.jsonl')?bytes.toString('utf8'):JSON.parse(bytes);}
 const base=originals['reservation-private.json'],resources=originals['resources-prepare-private.json'],editor=originals['editor-prepare-private.json'],capture=originals['main-signatory-failure-capture-private.json'];assertExactIdentity(base,resources,editor);
 const fresh=rt.freshReservation();for(const [key,value] of Object.entries(fresh))if(!['nonce','actors','createdAt'].includes(key))assert.deepEqual(base[key],value,'ORIGINAL_RUNTIME_PREIMAGE_CHANGED:'+key);
 const originalEvents=assertOriginalFailure(originals['intents-private.jsonl'],originals),originalRead=name=>{assert.ok(originalPrefix.some(c=>name===c+'-private.json'||name===c+'-attempt-private.json'),'EXACT_PREFIX_RECORD_ONLY');return JSON.parse(fs.readFileSync(checked(path.join(original,name)),'utf8'));};
 const expectedLifetime={kind:'admin-child',marker:ac.marker,nonce:base.nonce,sourceSha256:base.sourceSha256,actors:base.actors};
 function originalGuard(released=checker){rt.guard();rt.prerequisitesGuard();for(const [name,hash] of Object.entries(originalEvidence))assert.equal(sha(fs.readFileSync(checked(path.join(original,name)))),hash,'ORIGINAL_FAILURE_EVIDENCE_CHANGED');
  for(const event of originalEvents.filter(e=>e.event==='receipt-written')){assert.ok(originalPrefix.includes(event.command));assert.equal(event.details.name,event.command+'-private.json');assert.equal(sha(fs.readFileSync(checked(path.join(original,event.details.name)))),event.details.sha256);}
  if(released)assert.equal(fs.existsSync(lifetime),false,'SHARED_LIFETIME_STILL_ACTIVE');else{const bytes=fs.readFileSync(checked(lifetime));assert.equal(sha(bytes),lifetimeHash);assert.deepEqual(JSON.parse(bytes),expectedLifetime);}
 }
 originalGuard();rt.providersOff();
 const local=name=>{assert.match(name,/^[a-z-]+-private\.(json|jsonl)$/);return path.join(directory,name);};const read=name=>JSON.parse(fs.readFileSync(checked(local(name)),'utf8')),exists=name=>fs.existsSync(local(name));
 function durable(fd,value){const bytes=Buffer.from(value);let offset=0;while(offset<bytes.length){const count=fs.writeSync(fd,bytes,offset,bytes.length-offset);assert.ok(count>0);offset+=count;}fs.fsyncSync(fd);}
 function exclusive(name,value){const fd=fs.openSync(local(name),'wx',0o600);try{durable(fd,JSON.stringify(value,null,2)+'\n');}finally{fs.closeSync(fd);}}
 let fd,events=[],sequence=0,previousEventHash=null,command,commandNonce;
 function append(event,details={}){const line=JSON.stringify({sequence:++sequence,previousEventHash,at:new Date().toISOString(),command,event,details})+'\n';durable(fd,line);previousEventHash=sha(line);events.push(JSON.parse(line));}
 const reservation={marker:ac.marker,nonce:base.nonce,sourceHashes,sourceSha256,originalSources,originalEvidence,lifetimeHash,exact,limitations};
 function stored(){checked(directory);assert.deepEqual(read('reservation-private.json'),reservation);const raw=fs.readFileSync(checked(local('intents-private.jsonl')),'utf8'),checkedEvents=decodeChain(raw);assert.equal(checkedEvents[0].event,'continuation-reserved');assert.deepEqual(checkedEvents[0].details,reservation);assert.ok(!checkedEvents.some(e=>e.event==='failure-retained'),'CONTINUATION_FAILURE_REQUIRES_REVIEW');
  for(const e of checkedEvents){assert.ok(continuationCommands.includes(e.command));if(e.event==='receipt-written'){assert.equal(e.details.name,e.command+'-private.json');assert.equal(sha(fs.readFileSync(checked(local(e.details.name)))),e.details.sha256);assert.equal(read(e.details.name).nonce,base.nonce);}}return {events:checkedEvents,raw};}
 function start(next){assert.ok(continuationCommands.includes(next));assert.ok(!readOnly||next.startsWith('observe-')||next==='reconcile-null-date-signatory');command=next;const index=continuationCommands.indexOf(next);
  if(index===0){assert.equal(fs.existsSync(directory),false,'NO_RETRY');fs.mkdirSync(directory,{mode:0o700});fd=fs.openSync(local('intents-private.jsonl'),'ax',0o600);append('continuation-reserved',reservation);exclusive('reservation-private.json',reservation);}
  else{const prior=stored();assert.deepEqual(prior.events.filter(e=>e.event==='command-success').map(e=>e.command),continuationCommands.slice(0,index));assert.equal(prior.events.at(-1).event,'command-success');events=prior.events;sequence=events.length;previousEventHash=sha(prior.raw.trimEnd().split('\n').at(-1)+'\n');fd=fs.openSync(local('intents-private.jsonl'),'a',0o600);}
  commandNonce=randomUUID();exclusive('command-lock-private.json',{command,nonce:commandNonce,pid:process.pid,sourceSha256});exclusive(command+'-attempt-private.json',{command,nonce:base.nonce,sourceSha256});append('command-start',{nonce:base.nonce});}
 function receipt(value){const name=command+'-private.json';exclusive(name,{...value,nonce:base.nonce,sourceSha256,...limitations});append('receipt-written',{name,sha256:sha(fs.readFileSync(local(name)))});}
 function success(){originalGuard();rt.providersOff();if(command==='resources-retire'){append('exact-lifetime-release-intent',{lifetimeHash,preimage:expectedLifetime});originalGuard();fs.unlinkSync(lifetime);append('exact-lifetime-released',{lifetimeHash});originalGuard(true);}append('command-success',{nonce:base.nonce});const lock=read('command-lock-private.json');assert.equal(lock.nonce,commandNonce);assert.equal(lock.pid,process.pid);fs.unlinkSync(local('command-lock-private.json'));}
 function failure(stage){if(fd!==undefined)try{append('failure-retained',{stage,redacted:true,noAutomaticRetry:true});}catch{/* preserve both failed chains */}}
 // Old authAdmin is bound to its old journal. Never call its start or writer.
 async function authAdmin(which){assert.equal(readOnly,false);assert.ok(command===which+'-retire'||(which==='reader'&&command==='reader-prepare'));originalGuard();
  const keys=JSON.parse(fs.readFileSync(checked(path.join(runtime,'keys-private.json')),'utf8'));assert.equal(keys.API_URL,base.apiUrl);assert.ok(typeof keys.SERVICE_ROLE_KEY==='string'&&keys.SERVICE_ROLE_KEY.length>30);
  const {createClient}=await import('@supabase/supabase-js');const boundedFetch=(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url),method=init.method??'GET';assert.equal(url.origin,base.apiUrl);assert.equal(url.search,'');assert.equal(url.hash,'');
   assert.ok((method==='GET'&&url.pathname===`/auth/v1/admin/users/${base.owner.adminAuthId}`)||(command==='reader-prepare'&&method==='POST'&&url.pathname==='/auth/v1/admin/users')||(command===which+'-retire'&&method==='PUT'&&url.pathname===`/auth/v1/admin/users/${uuid(base.actors[which].authId)}`),'EXACT_AUTH_ONLY_ALLOWLIST');return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});};
  const client=createClient(base.apiUrl,keys.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:boundedFetch}});const verified=await client.auth.admin.getUserById(base.owner.adminAuthId);assert.equal(Boolean(verified.error),false);assert.equal(verified.data.user?.id,base.owner.adminAuthId);assert.equal(verified.data.user?.email,'f06-admin@example.invalid');return client.auth.admin;}
 return {rt,base,resources,editor,capture,originals,originalEvents,originalRead,sourceHashes,sourceSha256,reservation,expectedLifetime,read,exists,exclusive,stored,start,append,receipt,success,failure,originalGuard,authAdmin,close(){if(fd!==undefined)fs.closeSync(fd);rt.close();}};
}

export function preserved(c,observation){const {rt,base,resources}=c;assert.deepEqual(rt.query(inventorySql),resources.tables);assert.deepEqual(rt.query(identitySql(base,resources)),resources.identityBefore,'UNRELATED_IDENTITY_CHANGED');assert.deepEqual(rt.query(preservationSql(resources.tables,resources,observation)),resources.businessBefore,'UNRELATED_BUSINESS_CHANGED');rt.prerequisitesGuard();rt.providersOff();}
export function captureCurrent(c,stage,{which='editor',editorRetired=false,readerRetired=false,resourcesRetired=false,strict=true}={}){
 const {rt,base,resources,editor}=c,prepared=which==='editor'?editor:c.read('reader-prepare-private.json');
 const rows=rt.query(resourcesSql(resources));assertResources(rows,resources,resourcesRetired);if(!resourcesRetired)assert.deepEqual(rows,resources.rows);
 const observation=rt.query(continuationObservationSql(base,resources,editor));assertRawObservation(observation,base,resources,editor,stage,{retired:resourcesRetired});preserved(c,observation);
 const state=rt.query(actorSql(base,resources,which));assertRoles(state,resources,!editorRetired,!readerRetired);assertActor(state,base,resources,which,prepared,which==='editor'?editorRetired:readerRetired);assert.deepEqual(state.pairs,resources.state.pairs);
 if(strict)assert.deepEqual(rt.query(identitySql({...base,actors:{[which]:base.actors[which]}})),prepared.strictIdentity,'STRICT_ACTOR_BASELINE_CHANGED');
 return {rows,observation,state};
}
export async function runACContinuation(command){let c,stage='preflight';try{
 assert.ok(continuationCommands.includes(command));c=await openACContinuation({readOnly:command.startsWith('observe-')||command==='reconcile-null-date-signatory'});const {rt,base,resources,editor}=c;
 const readerMode=command.startsWith('reader-')||command==='observe-reader',which=readerMode?'reader':'editor';rt.noOtherActor(command==='reader-prepare'||command==='resources-retire'?null:base.actors[which].authId);c.start(command);
 if(command==='reader-prepare'){
  stage='reader-preparation';const prior=c.read('editor-retire-private.json'),current=captureCurrent(c,'profit-created',{editorRetired:true,strict:false});assert.deepEqual(current.state,prior.state);assert.deepEqual(current.observation,prior.observation);
  const absent=rt.query(actorSql(base,resources,'reader'));assertRoles(absent,resources,false,true);assert.equal(absent.auth,null);for(const key of ['profiles','assignments','sessions','refreshIds'])assert.deepEqual(absent[key],[]);
  const strictIdentity=rt.query(identitySql({...base,actors:{reader:base.actors.reader}}));c.append('strict-actor-baseline',{which:'reader',strictIdentity});
  const password=process.env.ALGT_F06_BROWSER_PASSWORD;assert.ok(typeof password==='string'&&password.length>=24&&password.length<=128&&/[A-Z]/.test(password)&&/[a-z]/.test(password)&&/[0-9]/.test(password)&&/[^a-z0-9]/i.test(password),'MAIN_RANDOM_PASSWORD_REQUIRED');
  const actor=ac.actors.reader,authId=base.actors.reader.authId;c.exclusive('reader-credentials-private.json',{nonce:base.nonce,email:actor.email,password,authId,sourceSha256:c.sourceSha256});
  stage='reader-auth-create';const admin=await c.authAdmin('reader');c.append('auth-create-intent',{which:'reader',authId,email:actor.email,marker:actor.marker,emailConfirm:true,sendsEmail:false});const created=await admin.createUser({id:authId,email:actor.email,password,email_confirm:true,app_metadata:{f06_marker:actor.marker},user_metadata:{full_name:actor.fullName,display_name:actor.fullName}});assert.equal(Boolean(created.error),false);assert.equal(created.data.user?.id,authId);assert.equal(created.data.user?.email,actor.email);c.append('auth-created',{which:'reader',authId});
  const after=rt.query(actorSql(base,resources,'reader'));assert.equal(after.profiles.length,1);assert.deepEqual(after.assignments,[]);const profileId=id(after.profiles[0].id);stage='reader-profile-assignment';c.append('actor-prepare-intent',{which:'reader',authId,profileId,roles:resources.roles.reader,permissions:ac.roles.reader.permissions});
  const assignments=rt.sql(actorPrepareSql(base,resources,'reader',profileId),true).split('\n').map(line=>JSON.parse(line)),prepared={profileId,assignments,strictIdentity};c.append('actor-prepared',{which:'reader',...prepared});const state=rt.query(actorSql(base,resources,'reader'));assertActor(state,base,resources,'reader',prepared);assertRoles(state,resources,false,true);assert.deepEqual(state.sessions,[]);assert.deepEqual(state.refreshIds,[]);assert.deepEqual(rt.query(identitySql({...base,actors:{reader:base.actors.reader}})),strictIdentity);assert.deepEqual(rt.query(continuationObservationSql(base,resources,editor)),current.observation);preserved(c,current.observation);c.receipt({...prepared,state,observation:current.observation});
 }else{
  const observerStage=command==='reconcile-null-date-signatory'?'signatory-created':command.startsWith('observe-')&&command!=='observe-reader'?command.slice(8):'profit-created';
  stage='capture-current';const current=captureCurrent(c,observerStage,{which,editorRetired:readerMode||command==='resources-retire',readerRetired:command==='resources-retire',strict:command!=='resources-retire'});
  if(command==='reconcile-null-date-signatory'){
   assertReconciliation(c.capture,current,base,resources,editor);assertStageTransition(c.originals['observe-signatory-invalid-private.json'].observation,current.observation,'signatory-created');assert.ok(current.state.sessions.length>0);c.append('known-null-date-state-reconciled',{signatoryId:exact.signatoryId,operationId:exact.operationId,requestHash:exact.requestHash,dateEntryAcceptance:'OPEN_UNVERIFIED'});c.receipt(current);
  }else if(command.startsWith('observe-')){
   stage=command;assert.ok(current.state.sessions.length>0,'BROWSER_LOGIN_NOT_OBSERVED');const index=continuationStages.indexOf(observerStage),prior=command==='observe-reader'?c.read('observe-profit-created-private.json').observation:index===0?c.read('reconcile-null-date-signatory-private.json').observation:c.read('observe-'+continuationStages[index-1]+'-private.json').observation;assertStageTransition(prior,current.observation,command==='observe-reader'?'reader':observerStage);c.receipt({...current,stage:observerStage});
  }else if(command==='editor-retire'||command==='reader-retire'){
   assert.deepEqual(current.observation,c.read('observe-profit-created-private.json').observation);const prepared=which==='editor'?editor:c.read('reader-prepare-private.json');stage=which+'-ban';c.append('auth-ban-intent',{which,authId:base.actors[which].authId,sessions:current.state.sessions,refreshIds:current.state.refreshIds});const admin=await c.authAdmin(which);const banned=await admin.updateUserById(base.actors[which].authId,{ban_duration:'876000h'});assert.equal(Boolean(banned.error),false);assert.equal(banned.data.user?.id,base.actors[which].authId);
   const state=rt.query(actorSql(base,resources,which));assert.equal(state.auth.banned,true);stage=which+'-retirement';c.append('actor-retire-intent',{which,authId:base.actors[which].authId,profileId:prepared.profileId,assignments:prepared.assignments,sessions:state.sessions,refreshIds:state.refreshIds});const removed=JSON.parse(rt.sql(actorRetireSql(base,resources,which,prepared,state),true));assert.deepEqual([...removed.sessions].sort(),state.sessions.map(s=>s.id).sort());assert.deepEqual([...removed.refreshIds].sort(),[...state.refreshIds].sort());c.append('actor-retired',{which,removed});
   const after=captureCurrent(c,'profit-created',{which,editorRetired:true,readerRetired:which==='reader',strict:false});assert.deepEqual(after.observation,current.observation);c.receipt({...after,removed});
  }else{
   assert.equal(command,'resources-retire');assert.deepEqual(current.observation,c.read('observe-profit-created-private.json').observation);const reader=c.read('reader-prepare-private.json'),readerState=rt.query(actorSql(base,resources,'reader'));assertActor(readerState,base,resources,'reader',reader,true);assertRoles(readerState,resources,false,false);assert.deepEqual(readerState,c.read('reader-retire-private.json').state);
   stage='exact-resource-retirement';c.append('resources-retire-intent',{ids:resources.ids,rows:current.rows,observation:current.observation,roles:resources.roles,retainedHistory:true});assert.equal(rt.sql(guardResourceRowsSql(resources,current.rows)+'\n'+resourceRetireSql(resources,current.observation),true),'RETIRED_EXACT_AC_RESOURCES');
   const after=captureCurrent(c,'profit-created',{editorRetired:true,readerRetired:true,resourcesRetired:true,strict:false});assertRetiredResources(current.rows,after.rows);assertRetiredObservation(current.observation,after.observation);c.receipt({...after,editorState:after.state,readerState,retainedHistory:true});
  }
 }
 c.success();process.stdout.write(JSON.stringify({marker:ac.marker,command,state:'PASS_AC_CONTINUATION_BOUNDARY_ONLY',...limitations})+'\n');return true;
 }catch{c?.failure(stage);process.stderr.write(JSON.stringify({marker:ac.marker,command,state:'FAIL_RETAINED',stage,redacted:true,noAutomaticRetry:true})+'\n');return false;}finally{c?.close();}}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){if(process.argv.length!==3){process.stderr.write('ONE_EXPLICIT_CONTINUATION_COMMAND_REQUIRED\n');process.exitCode=1;}else if(!await runACContinuation(process.argv[2]))process.exitCode=1;}
