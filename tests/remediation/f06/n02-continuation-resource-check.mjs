// MAIN ONLY independent read-only reconciliation. No Auth/Storage API, fixture
// command, consumer RPC or repair is run. Original failed evidence stays failed.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {openContinuation,continuationCommands,captureCurrent,assertRawRetained,assertByteAttestations,limitations,lifetimeHash,exact} from './n02-continuation.mjs';
import {n02,sourceBytes,sourceDigest,preserveExcept} from './n02-browser-contract.mjs';

export async function checkN02Continuation(){let c;try{
 c=await openContinuation({readOnly:true,checker:true});assert.equal(c.exists('command-lock-private.json'),false);assert.equal(c.exists('check-private.json'),false,'PRESERVE_CHECK');assert.equal(c.exists('check-failure-private.json'),false,'FAILED_CHECK_REQUIRES_REVIEW');
 const {events}=c.stored();assert.deepEqual(events.filter(e=>e.event==='command-start').map(e=>e.command),continuationCommands);assert.deepEqual(events.filter(e=>e.event==='command-success').map(e=>e.command),continuationCommands);assert.equal(events.at(-1).event,'command-success');assert.equal(events.at(-1).command,'resources-retire');
 const reconciled=c.read('reconcile-after-browser-retry-private.json'),retired=c.read('actor-retire-private.json'),final=c.read('resources-retire-private.json');
 for(const [command,record] of [['reconcile-after-browser-retry',reconciled],['actor-retire',retired],['resources-retire',final]]){
  assert.equal(record.nonce,c.base.nonce);assert.equal(record.sourceSha256,c.sourceSha256);for(const [key,value] of Object.entries(limitations))assert.equal(record[key],value);
  assert.deepEqual(c.read(command+'-attempt-private.json'),{command,nonce:c.base.nonce,sourceSha256:c.sourceSha256});
 }
 const current=captureCurrent(c,{actorRetired:true,resourcesRetired:true});assert.deepEqual(current, Object.fromEntries(Object.keys(current).map(key=>[key,final[key]])),'FINAL_STATE_CHANGED');
 assertRawRetained(reconciled,retired);assertRawRetained(reconciled,current,{resourcesRetired:true});
 for(const key of ['profiles','assignments'])assert.deepEqual(current.state[key],retired.state[key]);assert.deepEqual(current.state.pairs,c.resources.state.pairs);
 for(const key of ['type','category'])preserveExcept(c.resources.taxonomy[key],current.taxonomy[key],['is_active','updated_at']);
 assertByteAttestations(c.prepared,current.objects);assertByteAttestations(reconciled,current.objects);
 assert.ok(reconciled.state.sessions.some(s=>s.id===reconciled.identity.verifiedSessionId&&s.userId===c.base.authId),'VERIFICATION_SESSION_NOT_CAPTURED_AFTER_RETRY');
 const retireIntents=events.filter(e=>e.event==='actor-retire-intent'),retireResults=events.filter(e=>e.event==='actor-retired');assert.equal(retireIntents.length,1);assert.equal(retireResults.length,1);const intent=retireIntents[0].details,result=retireResults[0].details;
 assert.equal(intent.authId,c.base.authId);assert.equal(intent.profileId,c.prepared.profileId);assert.deepEqual(intent.assignmentIds,c.prepared.assignmentIds);assert.deepEqual(intent.roles,c.prepared.roles);assert.deepEqual([...result.sessionIds].sort(),[...intent.sessionIds].sort());assert.deepEqual([...result.refreshIds].sort(),[...intent.refreshIds].sort());assert.deepEqual(result,retired.removed);
 const sourceIntents=c.originalEvents.filter(e=>e.event==='source-upload-intent'),sourceResults=c.originalEvents.filter(e=>e.event==='source-upload-returned');assert.equal(sourceIntents.length,1);assert.equal(sourceResults.length,1);
 assert.deepEqual(sourceIntents[0].details,{bucket:'dms-temp',path:n02.sourcePath,sha256:sourceDigest(),size:sourceBytes().length,mime:n02.mime,upsert:false,retained:true});const source=current.objects.find(o=>o.bucket_id==='dms-temp');assert.equal(sourceResults[0].details.id,source.id);assert.equal(sourceResults[0].details.path,n02.sourcePath);
 const releaseIntents=events.filter(e=>e.event==='exact-lifetime-release-intent'),released=events.filter(e=>e.event==='exact-lifetime-released');assert.equal(releaseIntents.length,1);assert.equal(released.length,1);assert.equal(releaseIntents[0].command,'resources-retire');assert.equal(released[0].command,'resources-retire');assert.equal(releaseIntents[0].details.lifetimeHash,lifetimeHash);assert.deepEqual(released[0].details,{lifetimeHash});
 assert.deepEqual(releaseIntents[0].details.preimage,{kind:'n02',marker:n02.marker,nonce:c.base.nonce,authId:c.base.authId,sourceSha256:c.base.sourceSha256});
 c.originalGuard(true);c.rt.noOtherActor(c.base.authId);c.rt.providersOff();
 c.exclusive('check-private.json',{nonce:c.base.nonce,sourceSha256:c.sourceSha256,at:new Date().toISOString(),state:'PASS_EXACT_N02_CONTINUATION_RESOURCES_ONLY',exact,identity:current.identity,
  originalEvidenceHashes:c.reservation.originalEvidence,originalSources:c.reservation.originalSources,...limitations,
  originalFailedCommandLockRetained:true,originalLedgerUnchanged:true,canonicalPermissionsUnchanged:true,storageBucketsAndPoliciesUnchanged:true,
  rolesAndAssignmentsInactive:true,actorBannedAndInactive:true,exactSessionsAbsent:true,taxonomyInactive:true,documentArchived:true,sourceRetiredAndBound:true,
  allNumberingAndConsumerHistoryRetained:true,sourceAndDestinationObjectIdentitiesRetained:true,ruleFlagRestored:true,countersRetained:true,
  historicalByteAttestationsMatchCurrentMetadata:true,currentByteDownload:false,repairs:0});
 process.stdout.write(JSON.stringify({marker:n02.marker,state:'PASS_EXACT_N02_CONTINUATION_RESOURCES_ONLY',...limitations,currentByteDownload:false,repairs:0})+'\n');return true;
 }catch{
  try{if(c&&!c.exists('check-failure-private.json'))c.exclusive('check-failure-private.json',{nonce:c.base.nonce,sourceSha256:c.sourceSha256,at:new Date().toISOString(),state:'FAIL_RETAINED',redacted:true,repairs:0});}catch{/* never overwrite failed evidence */}
  process.stderr.write(JSON.stringify({marker:n02.marker,state:'FAIL_RETAINED',redacted:true,repairs:0})+'\n');return false;
 }finally{c?.close();}}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 if(process.argv.length!==2){process.stderr.write('NO_POSITIONAL_ARGUMENTS_ALLOWED\n');process.exitCode=1;}else if(!await checkN02Continuation())process.exitCode=1;
}
