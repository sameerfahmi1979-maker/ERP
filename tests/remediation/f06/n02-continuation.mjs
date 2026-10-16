// MAIN ONLY exact N02 continuation. No runtime/filesystem/network work on import.
// The original observer failure remains a failure. There is NO captured raw
// pre-retry completion baseline: main's separate browser evidence owns that claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {n02,sha,uuid,sourceBytes,sourceDigest,permissionsSql,validatePermissions,actorStateSql,assertRoles,assertActor,
 taxonomySql,assertTaxonomy,sourceSql,assertSource,storageSql,assertStorage,observationSql,assertObservation,expectedRequest,
 identitySql,assertPreserved,businessSql,ruleSql,assertNumberingProgress,assertSequenceHistoryPreserved,preserveExcept,
 bucketSql,storageSecuritySql,actorRetireSql,resourceRetireSql} from './n02-browser-contract.mjs';

export const continuationCommands=Object.freeze(['reconcile-after-browser-retry','actor-retire','resources-retire']);
export const exact=Object.freeze({documentId:1014,documentNo:'F06DMC-000260',uploadId:591,operationId:'8990f6ab-69b9-4933-976d-d37929c8749f'});
export const originalSources=Object.freeze({
 'n02-browser-contract.mjs':'26773539077659a7b549e53da239b3236e2685d3066c4c9aa0dda360f48b5696',
 'n02-browser-runtime.mjs':'96bfbb27097b338395f63e430d055c48e64b3386d3e053adef166d823a53b38c',
 'n02-browser-fixture.mjs':'9fc13d9011b89ce865c9b7e20be2228f4b632369561a762560a4fc1d968a75f0',
 'n02-browser-resource-check.mjs':'303e23251d6b367460c7dba7e5ae19914c28dba1d3068c9e1499f3aaad56a470',
 'n02-browser-authoring.test.ts':'cc8ad9257332e861ca5d18014f3d757290f612f09b7ba1ce5dbb6b1cc2808f8d'});
export const originalEvidence=Object.freeze({
 'reservation-private.json':'7673c6511a29c9f1318d5fab690258b622c6515497afda52da867c02688deed8',
 'resources-prepare-private.json':'c4e9107a78256625d7e40c2ac5d0b32a4279599e00532aafa244c2c271e5a4d8',
 'actor-source-prepare-private.json':'dcb055ce02a35becba6861e22d003686046857a4a0f0dd137dbccaf84a79ee2f',
 'observe-invalid-private.json':'fe36bfee839de1b375b3247ad76f121decb6f964a91575226b9b02b023660a93',
 'intents-private.jsonl':'9893ea7de8ba64f214d811a2aee8e42c8acd8dba8c418b3f45bb335d7ca35066',
 'observe-completed-attempt-private.json':'faaa5d1a941e751430fb91a957fd4fd053b947a94a61ec2494699a52d8d1a55c',
 'command-lock-private.json':'77fc68baa61275eb4d4a9bb3af7f637ab306d178edc0d4877c49b51dcbf3406c'});
export const lifetimeHash='e395bf3255c254b65de766132315c5faac24cf0c8c87aadf63a70ade0b91e1b7';
export const limitations=Object.freeze({originalObserverFailureRetained:true,rawPreRetryCompletionSnapshot:false,
 browserPassClaim:false,replayClaim:false,responseLossTested:false,
 assertion:'EXACT_POST_BROWSER_RETRY_STATE_AND_SUBSEQUENT_RETIREMENT_ONLY'});
export function decodeChain(raw){
 assert.ok(raw.endsWith('\n'),'INCOMPLETE_JOURNAL');let previous=null,index=0;
 return raw.trimEnd().split('\n').map(line=>{const event=JSON.parse(line);assert.equal(event.sequence,++index);assert.equal(event.previousEventHash,previous);previous=sha(line+'\n');return event;});
}
export function assertOriginalFailure(raw,records){
 const events=decodeChain(raw),base=records['reservation-private.json'];
 assert.equal(events[0]?.event,'reservation-intent');assert.deepEqual(events[0].details,base);
 assert.deepEqual(events.filter(e=>e.event==='command-success').map(e=>e.command),['resources-prepare','actor-source-prepare','observe-invalid']);
 const failures=events.filter(e=>e.event==='failure-retained');assert.equal(failures.length,1);assert.equal(failures[0],events.at(-1));
 assert.equal(failures[0].command,'observe-completed');assert.deepEqual(failures[0].details,{stage:'preflight',redacted:true,noAutomaticRetry:true});
 assert.deepEqual(events.filter(e=>e.command==='observe-completed').map(e=>e.event),['command-start','failure-retained']);
 assert.deepEqual(events.filter(e=>e.event==='command-start').map(e=>e.command),['resources-prepare','actor-source-prepare','observe-invalid','observe-completed']);
 const attempt=records['observe-completed-attempt-private.json'],lock=records['command-lock-private.json'];
 assert.deepEqual(attempt,{nonce:base.nonce,command:'observe-completed',sourceSha256:base.sourceSha256});
 uuid(lock.nonce);assert.ok(Number.isSafeInteger(lock.pid)&&lock.pid>0);assert.equal(lock.command,'observe-completed');assert.equal(lock.sourceSha256,base.sourceSha256);
 for(const e of events.filter(e=>e.event==='receipt-written')){assert.ok(Object.hasOwn(originalEvidence,e.details.name));assert.equal(e.details.sha256,originalEvidence[e.details.name]);}
 return events;
}
// All four keys are asserted before deleting two keys from a COPY, solely to
// reuse the frozen contract's narrower legacy shape. Raw evidence is never edited.
export function normalizedObservation(raw,base,prepared){
 assert.equal(prepared.uploadId,exact.uploadId);assert.equal(raw.documents.length,1);assert.equal(raw.references.length,1);assert.equal(raw.requests.length,1);
 const document=raw.documents[0],reference=raw.references[0],request=raw.requests[0];
 assert.equal(document.id,exact.documentId);assert.equal(document.document_no,exact.documentNo);assert.equal(request.operation_id,exact.operationId);
 assert.equal(request.actor_id,prepared.profileId);assert.equal(request.reference_id,reference.id);assert.equal(reference.generated_by,prepared.profileId);
 assert.equal(reference.target_table_name,'dms_documents');assert.equal(reference.target_record_id,exact.documentId);assert.equal(reference.generated_reference_number,exact.documentNo);uuid(base.authId);
 const consumed=raw.audits.filter(a=>a.entity_name==='global_numbering_generated_references'&&a.action==='update');assert.equal(consumed.length,1);
 const a=consumed[0];assert.equal(a.actor_user_profile_id,prepared.profileId);assert.equal(a.entity_id,reference.id);assert.equal(a.entity_reference,exact.documentNo);
 assert.deepEqual(a.new_values,{status:'consumed',operation_id:exact.operationId,target_table:'dms_documents',target_record:exact.documentId});
 const generated=raw.audits.filter(a=>a.entity_name==='global_numbering_generated_references'&&a.action==='generate');assert.equal(generated.length,1);
 assert.deepEqual(generated[0].new_values,{status:'reserved',operation_id:exact.operationId});
 const copy=structuredClone(raw),adapted=copy.audits.find(x=>x.id===a.id);assert.ok(adapted);delete adapted.new_values.target_table;delete adapted.new_values.target_record;return copy;
}
export function assertRawObservation(raw,base,resources,prepared,options={}){
 return assertObservation(normalizedObservation(raw,base,prepared),base,resources,prepared,options);
}
export function assertByteAttestations(record,objects){
 assert.equal(record.byteProofs.length,record.objects.length);const seen=new Set();
 for(const proof of record.byteProofs){const key=proof.bucket+':'+proof.path;assert.equal(seen.has(key),false);seen.add(key);const object=objects.find(o=>o.bucket_id===proof.bucket&&o.name===proof.path);assert.ok(object);
  assert.equal(proof.objectId,object.id);assert.equal(proof.version,object.version);assert.equal(proof.databaseUpdatedAt,object.updated_at);assert.equal(proof.contentSha256,sourceDigest());assert.equal(proof.size,sourceBytes().length);assert.equal(new Date(proof.apiLastModified).toISOString(),new Date(object.updated_at).toISOString());}
}

export async function openContinuation({readOnly=false,checker=false}={}){
 const root=path.resolve(import.meta.dirname,'../../..'),normal=p=>p.replaceAll('\\','/').toLowerCase();assert.equal(normal(root),'c:/dev/agt-erp-f06');assert.equal(normal(path.resolve(process.cwd())),normal(root));
 assert.equal(process.env.ALGT_F06_N02_CONTINUATION,'exact-post-retry-1014');
 for(const [name,hash] of Object.entries(originalSources))assert.equal(sha(fs.readFileSync(path.join(import.meta.dirname,name))),hash,'FROZEN_SOURCE_CHANGED');
 const sourceHashes=Object.fromEntries(['n02-continuation.mjs','n02-continuation-resource-check.mjs','n02-continuation.test.ts'].map(name=>[name,sha(fs.readFileSync(path.join(import.meta.dirname,name)))]));
 const sourceSha256=sha(JSON.stringify(sourceHashes));assert.equal(process.env.ALGT_F06_N02_CONTINUATION_SOURCE_SHA256,sourceSha256,'REVIEWED_CONTINUATION_REQUIRED');
 // Factory is loaded only after exact source pins; no fixture/checker entrypoint.
 const {openN02Runtime}=await import('./n02-browser-runtime.mjs');const rt=openN02Runtime({readOnly});
 const parent=path.join(root,'CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06/local/browser-acceptance-private');
 const original=path.join(parent,'n02-browser-'+n02.marker),directory=path.join(parent,'n02-continuation-'+n02.marker),lifetime=path.join(parent,'scoped-browser-lifetime-lock-private.json');
 function checkedPath(p){assert.equal(fs.lstatSync(p).isSymbolicLink(),false);assert.equal(normal(fs.realpathSync(p)),normal(p));return p;}
 checkedPath(original);checkedPath(parent);
 const originals={};for(const [name,hash] of Object.entries(originalEvidence)){const bytes=fs.readFileSync(checkedPath(path.join(original,name)));assert.equal(sha(bytes),hash,'ORIGINAL_FAILURE_EVIDENCE_CHANGED');originals[name]=name.endsWith('.jsonl')?bytes.toString('utf8'):JSON.parse(bytes);}
 const base=originals['reservation-private.json'],resources=originals['resources-prepare-private.json'],prepared=originals['actor-source-prepare-private.json'],invalid=originals['observe-invalid-private.json'];
 const originalEvents=assertOriginalFailure(originals['intents-private.jsonl'],originals);assert.equal(base.marker,n02.marker);assert.equal(base.email,n02.email);uuid(base.authId);uuid(base.nonce);
 assert.equal(base.sourceSha256,rt.sourceSha256);assert.deepEqual(base.sourceHashes,rt.sourceHashes);assert.equal(base.containerId,rt.containerId);assert.equal(base.image,rt.image);assert.equal(base.startedAt,rt.startedAt);assert.equal(base.apiUrl,rt.apiUrl);assert.equal(base.ledgerSha256,rt.ledgerSha256);assert.deepEqual(base.owner,rt.owner);assert.deepEqual(base.permissions,rt.permissions);assert.deepEqual(base.buckets,rt.buckets);assert.deepEqual(base.storageSecurity,rt.query(storageSecuritySql()));
 for(const record of [resources,prepared,invalid]){assert.equal(record.nonce,base.nonce);assert.equal(record.authId,base.authId);assert.equal(record.sourceSha256,base.sourceSha256);}
 assert.deepEqual(prepared.roles,resources.roles);assert.equal(prepared.uploadId,exact.uploadId);assert.deepEqual(prepared.expectedRequest,expectedRequest(base,resources,prepared));
 assertObservation(invalid.observation,base,resources,prepared,{empty:true});assert.deepEqual(invalid.source,prepared.source);assert.deepEqual(invalid.objects,prepared.objects);
 for(const name of ['observe-completed-private.json','observe-retained-private.json','actor-retire-private.json','resources-retire-private.json','check-private.json','check-failure-private.json'])assert.equal(fs.existsSync(path.join(original,name)),false,'UNEXPECTED_ORIGINAL_CONTINUATION');
 const expectedLifetime={kind:'n02',marker:n02.marker,nonce:base.nonce,authId:base.authId,sourceSha256:base.sourceSha256};
 function originalGuard(released=checker){
  rt.guard();for(const [name,hash] of Object.entries(originalEvidence))assert.equal(sha(fs.readFileSync(checkedPath(path.join(original,name)))),hash,'ORIGINAL_EVIDENCE_CHANGED');
  if(released)assert.equal(fs.existsSync(lifetime),false,'LIFETIME_STILL_ACTIVE');else {assert.equal(sha(fs.readFileSync(checkedPath(lifetime))),lifetimeHash);assert.deepEqual(JSON.parse(fs.readFileSync(lifetime,'utf8')),expectedLifetime);}
 }
 originalGuard();rt.noOtherActor(base.authId);rt.providersOff();
 const local=name=>{assert.match(name,/^[a-z-]+-private\.(json|jsonl)$/);return path.join(directory,name);};
 const read=name=>JSON.parse(fs.readFileSync(checkedPath(local(name)),'utf8'));
 const exists=name=>fs.existsSync(local(name));
 function durable(fd,value){const bytes=Buffer.from(value);let offset=0;while(offset<bytes.length){const n=fs.writeSync(fd,bytes,offset,bytes.length-offset);assert.ok(n>0);offset+=n;}fs.fsyncSync(fd);}
 function exclusive(name,value){const fd=fs.openSync(local(name),'wx',0o600);try{durable(fd,JSON.stringify(value,null,2)+'\n');}finally{fs.closeSync(fd);}}
 let fd,events=[],sequence=0,previousEventHash=null,command,commandNonce;
 function append(event,details={}){const line=JSON.stringify({sequence:++sequence,previousEventHash,at:new Date().toISOString(),command,event,details})+'\n';durable(fd,line);previousEventHash=sha(line);events.push(JSON.parse(line));}
 const reservation={marker:n02.marker,nonce:base.nonce,authId:base.authId,sourceHashes,sourceSha256,originalSources,originalEvidence,lifetimeHash,exact,limitations};
 function stored(){checkedPath(directory);assert.deepEqual(read('reservation-private.json'),reservation);const raw=fs.readFileSync(checkedPath(local('intents-private.jsonl')),'utf8'),checked=decodeChain(raw);
  assert.equal(checked[0].event,'continuation-reserved');assert.deepEqual(checked[0].details,reservation);assert.ok(!checked.some(e=>e.event==='failure-retained'),'CONTINUATION_FAILURE_REQUIRES_REVIEW');
  for(const e of checked){assert.ok(continuationCommands.includes(e.command));if(e.event==='receipt-written'){assert.equal(sha(fs.readFileSync(checkedPath(local(e.details.name)))),e.details.sha256);assert.equal(read(e.details.name).nonce,base.nonce);}}
  return {events:checked,raw};
 }
 function start(next){assert.ok(continuationCommands.includes(next));assert.ok(!readOnly||next==='reconcile-after-browser-retry');command=next;const index=continuationCommands.indexOf(next);
  if(index===0){assert.equal(fs.existsSync(directory),false,'NO_RETRY');fs.mkdirSync(directory,{mode:0o700});fd=fs.openSync(local('intents-private.jsonl'),'ax',0o600);append('continuation-reserved',reservation);exclusive('reservation-private.json',reservation);}
  else {const prior=stored();assert.deepEqual(prior.events.filter(e=>e.event==='command-success').map(e=>e.command),continuationCommands.slice(0,index));assert.equal(prior.events.at(-1).event,'command-success');events=prior.events;sequence=events.length;previousEventHash=sha(prior.raw.trimEnd().split('\n').at(-1)+'\n');fd=fs.openSync(local('intents-private.jsonl'),'a',0o600);}
  commandNonce=randomUUID();exclusive('command-lock-private.json',{command,nonce:commandNonce,pid:process.pid,sourceSha256});exclusive(command+'-attempt-private.json',{command,nonce:base.nonce,sourceSha256});append('command-start',{nonce:base.nonce});
 }
 function receipt(value){const name=command+'-private.json';exclusive(name,{nonce:base.nonce,sourceSha256,...limitations,...value});append('receipt-written',{name,sha256:sha(fs.readFileSync(local(name)))});}
 function success(){originalGuard();rt.providersOff();
  if(command==='resources-retire'){append('exact-lifetime-release-intent',{lifetimeHash,preimage:expectedLifetime});originalGuard();fs.unlinkSync(lifetime);append('exact-lifetime-released',{lifetimeHash});originalGuard(true);}
  append('command-success',{nonce:base.nonce});const lock=read('command-lock-private.json');assert.equal(lock.nonce,commandNonce);assert.equal(lock.pid,process.pid);fs.unlinkSync(local('command-lock-private.json'));}
 function failure(stage){if(fd!==undefined)try{append('failure-retained',{stage,redacted:true,noAutomaticRetry:true});}catch{/* retain originals and failed attempt */}}
 return {rt,base,resources,prepared,invalid,originalEvents,sourceHashes,sourceSha256,reservation,read,exists,exclusive,stored,start,append,receipt,success,failure,originalGuard,
  close(){if(fd!==undefined)fs.closeSync(fd);rt.close();}};
}

export function captureCurrent(c,{actorRetired=false,resourcesRetired=false}={}){
 const {rt,base,resources,prepared}=c;
 assert.deepEqual(validatePermissions(n02,rt.query(permissionsSql(n02))),resources.permissions);assert.deepEqual(rt.query(bucketSql()),base.buckets);assert.deepEqual(rt.query(storageSecuritySql()),base.storageSecurity);
 const state=rt.query(actorStateSql(base,resources));assertRoles(state,resources,!resourcesRetired);assertActor(state,base,prepared,actorRetired);assert.deepEqual(state.pairs,resources.state.pairs);
 const taxonomy=rt.query(taxonomySql(resources));assertTaxonomy(taxonomy,resources,!resourcesRetired);for(const key of ['type','category'])preserveExcept(resources.taxonomy[key],taxonomy[key],resourcesRetired?['is_active','updated_at']:[]);
 const observation=rt.query(observationSql(base,resources,prepared)),identity=assertRawObservation(observation,base,resources,prepared,{archived:resourcesRetired});
 const source=assertSource(rt.query(sourceSql(prepared)),base,prepared,{documentId:exact.documentId,retired:resourcesRetired});preserveExcept(prepared.source,source,['document_id','status',...(resourcesRetired?['intake_status']:[]),'completed_at','updated_at']);
 const objects=rt.query(storageSql(base)),stored=assertStorage(objects,base,observation);assert.deepEqual(stored.source,prepared.objects[0]);
 const currentRule=rt.query(ruleSql())[0];assert.equal(currentRule.is_active,resourcesRetired?resources.rule.is_active:true);assertNumberingProgress(resources.rule,currentRule,observation);assertSequenceHistoryPreserved(prepared.initial.sequences,observation.sequences,identity.sequenceId);
 const initialIdentity=rt.query(identitySql(base.authId,resources));assertPreserved(resources.identityBefore,initialIdentity,true);
 const strictIdentity=rt.query(identitySql(base.authId));if(!resourcesRetired)assertPreserved(prepared.identityBaseline,strictIdentity,true);
 const business=rt.query(businessSql(base,resources.rule.id,resources,prepared,identity));assert.deepEqual(resources.businessBefore,business);
 return {state,taxonomy,observation,identity,source,objects,currentRule,initialIdentity,strictIdentity,business};
}
export function assertRawRetained(before,after,{resourcesRetired=false}={}){
 assert.deepEqual(after.identity,before.identity);assert.deepEqual(after.objects,before.objects);
 for(const key of ['references','requests','versions','files','events','audits','verified','completed','sequences'])assert.deepEqual(after.observation[key],before.observation[key],'RAW_HISTORY_CHANGED:'+key);
 if(resourcesRetired){preserveExcept(before.observation.documents[0],after.observation.documents[0],['is_archived','archived_at','updated_at']);preserveExcept(before.source,after.source,['status','intake_status','updated_at']);preserveExcept(before.currentRule,after.currentRule,['is_active','updated_at','workspace_revision']);}
 else {assert.deepEqual(after.observation,before.observation);assert.deepEqual(after.source,before.source);assert.deepEqual(after.currentRule,before.currentRule);}
}
export async function runN02Continuation(command){let c,stage='preflight';try{
 assert.ok(continuationCommands.includes(command));c=await openContinuation({readOnly:command==='reconcile-after-browser-retry'});c.start(command);
 const {rt,base,resources,prepared}=c;stage='capture-current';const current=captureCurrent(c,{actorRetired:command==='resources-retire'});
 if(command==='reconcile-after-browser-retry'){
  assert.ok(current.state.sessions.some(s=>s.id===current.identity.verifiedSessionId&&s.userId===base.authId));stage='current-byte-proof';const byteProofs=await rt.verifyBytes(base,current.objects);assert.deepEqual(rt.query(storageSql(base)),current.objects);
  c.append('post-retry-state-observed',{identity:current.identity,exact,normalization:'Assert exact four-key consumed audit; remove only target_table/target_record from in-memory assertion copy',rawPreRetryCompletionSnapshot:false});
  c.receipt({...current,byteProofs});
 }else{
  const reconciled=c.read('reconcile-after-browser-retry-private.json');assertRawRetained(reconciled,current);
  if(command==='actor-retire'){
   stage='ban-exact-actor';c.append('auth-ban-intent',{authId:base.authId,banDuration:'876000h',sessions:current.state.sessions,refreshIds:current.state.refreshIds});const admin=await rt.authAdmin(base);const banned=await admin.updateUserById(base.authId,{ban_duration:'876000h'});assert.equal(Boolean(banned.error),false);assert.equal(banned.data.user?.id,base.authId);
   const state=rt.query(actorStateSql(base,resources));assertRoles(state,resources);assert.equal(state.auth.banned,true);const sessionIds=state.sessions.map(s=>s.id).sort(),refreshIds=[...state.refreshIds].sort();
   stage='retire-exact-actor';c.append('actor-retire-intent',{authId:base.authId,profileId:prepared.profileId,assignmentIds:prepared.assignmentIds,roles:prepared.roles,sessionIds,refreshIds});const removed=JSON.parse(rt.sql(actorRetireSql(base,prepared,state),true));assert.deepEqual([...removed.sessionIds].sort(),sessionIds);assert.deepEqual([...removed.refreshIds].sort(),refreshIds);c.append('actor-retired',removed);
   const after=captureCurrent(c,{actorRetired:true});assertRawRetained(current,after);assertPreserved(current.strictIdentity,after.strictIdentity);c.receipt({...after,removed});
  }else{
   const actorRetired=c.read('actor-retire-private.json');assert.deepEqual(current.state,actorRetired.state);stage='retire-exact-resources';c.append('resources-retire-intent',{identity:current.identity,uploadId:prepared.uploadId,taxonomy:current.taxonomy,ruleBefore:current.currentRule,restoreRuleActive:resources.rule.is_active,objects:current.objects,roles:resources.roles,historyAndBytesRetained:true});
   assert.equal(rt.sql(resourceRetireSql(base,resources,prepared,normalizedObservation(current.observation,base,prepared)),true),'RETIRED_EXACT_N02_RESOURCES');
   const after=captureCurrent(c,{actorRetired:true,resourcesRetired:true});assertRawRetained(current,after,{resourcesRetired:true});c.receipt({...after,retainedHistory:true});
  }
 }
 c.success();process.stdout.write(JSON.stringify({marker:n02.marker,command,state:'PASS_N02_CONTINUATION_BOUNDARY_ONLY',...limitations})+'\n');return true;
 }catch{c?.failure(stage);process.stderr.write(JSON.stringify({marker:n02.marker,command,state:'FAIL_RETAINED',stage,redacted:true,noAutomaticRetry:true})+'\n');return false;}finally{c?.close();}}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 if(process.argv.length!==3){process.stderr.write('ONE_EXPLICIT_CONTINUATION_COMMAND_REQUIRED\n');process.exitCode=1;}else if(!await runN02Continuation(process.argv[2]))process.exitCode=1;
}
