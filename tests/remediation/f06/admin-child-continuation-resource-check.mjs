// MAIN ONLY independent read-only continuation checker; no Auth, mutations or repair.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {openACContinuation,continuationCommands,continuationStages,originalPrefix,limitations,exact,lifetimeHash,
 captureCurrent,assertRawObservation,assertReconciliation,assertStageTransition,assertRetiredResources,assertRetiredObservation} from './admin-child-continuation.mjs';
import {ac,stages,assertObservation,actorSql,assertActor,assertRoles} from './admin-child-browser-contract.mjs';

export async function checkACContinuation(){let c;try{
 c=await openACContinuation({readOnly:true,checker:true});assert.equal(c.exists('command-lock-private.json'),false);assert.equal(c.exists('check-private.json'),false,'PRESERVE_CHECK');assert.equal(c.exists('check-failure-private.json'),false,'FAILED_CHECK_REQUIRES_REVIEW');
 const {events}=c.stored();assert.deepEqual(events.filter(e=>e.event==='command-start').map(e=>e.command),continuationCommands);assert.deepEqual(events.filter(e=>e.event==='command-success').map(e=>e.command),continuationCommands);assert.equal(events.at(-1).event,'command-success');assert.equal(events.at(-1).command,'resources-retire');
 for(const command of continuationCommands){const record=c.read(command+'-private.json');assert.equal(record.nonce,c.base.nonce);assert.equal(record.sourceSha256,c.sourceSha256);for(const [key,value] of Object.entries(limitations))assert.deepEqual(record[key],value);assert.deepEqual(c.read(command+'-attempt-private.json'),{command,nonce:c.base.nonce,sourceSha256:c.sourceSha256});}
 // Original successful prefix stays original, including its DB-only read-recovered observation.
 for(const command of originalPrefix){const record=c.originalRead(command+'-private.json');assert.equal(record.nonce,c.base.nonce);assert.equal(record.sourceSha256,c.base.sourceSha256);assert.equal(record.browserPassClaim,false);assert.equal(record.replayClaim,false);assert.deepEqual(c.originalRead(command+'-attempt-private.json'),{command,nonce:c.base.nonce,sourceSha256:c.base.sourceSha256});}
 const {base,resources,editor}=c;let prior=editor.initial;
 for(const stage of stages.slice(0,stages.indexOf('signatory-created'))){const record=c.originalRead('observe-'+stage+'-private.json');assertObservation(record.observation,base,resources,editor,stage);assertStageTransition(prior,record.observation,stage);prior=record.observation;}
 const reconciled=c.read('reconcile-null-date-signatory-private.json');assertReconciliation(c.capture,reconciled,base,resources,editor);assertStageTransition(prior,reconciled.observation,'signatory-created');prior=reconciled.observation;
 for(const stage of continuationStages){const record=c.read('observe-'+stage+'-private.json');assertRawObservation(record.observation,base,resources,editor,stage);assertStageTransition(prior,record.observation,stage);prior=record.observation;}
 const last=c.read('observe-profit-created-private.json'),reader=c.read('reader-prepare-private.json'),final=c.read('resources-retire-private.json');
 for(const name of ['editor-retire','reader-prepare','observe-reader','reader-retire']){const record=c.read(name+'-private.json');assertRawObservation(record.observation,base,resources,editor,'profit-created');assertStageTransition(last.observation,record.observation,'reader');}
 const current=captureCurrent(c,'profit-created',{editorRetired:true,readerRetired:true,resourcesRetired:true,strict:false});assert.deepEqual(current.rows,final.rows);assert.deepEqual(current.observation,final.observation);assert.deepEqual(current.state,final.editorState);assertRetiredResources(resources.rows,current.rows);assertRetiredObservation(last.observation,current.observation);
 for(const [which,prepared] of [['editor',editor],['reader',reader]]){
  const state=c.rt.query(actorSql(base,resources,which));assertRoles(state,resources,false,false);assertActor(state,base,resources,which,prepared,true);assert.deepEqual(state,final[which+'State']);assert.deepEqual(state.pairs,resources.state.pairs);
  const retired=c.read(which+'-retire-private.json');for(const key of ['profiles','assignments','auth','sessions','refreshIds'])assert.deepEqual(state[key],retired.state[key]);
  const intents=events.filter(e=>e.event==='actor-retire-intent'&&e.details.which===which),results=events.filter(e=>e.event==='actor-retired'&&e.details.which===which);assert.equal(intents.length,1);assert.equal(results.length,1);const intent=intents[0].details,result=results[0].details.removed;
  assert.equal(intent.authId,base.actors[which].authId);assert.equal(intent.profileId,prepared.profileId);assert.deepEqual(intent.assignments,prepared.assignments);assert.deepEqual([...result.sessions].sort(),intent.sessions.map(s=>s.id).sort());assert.deepEqual([...result.refreshIds].sort(),[...intent.refreshIds].sort());assert.deepEqual(result,retired.removed);
 }
 const releaseIntents=events.filter(e=>e.event==='exact-lifetime-release-intent'),released=events.filter(e=>e.event==='exact-lifetime-released');assert.equal(releaseIntents.length,1);assert.equal(released.length,1);assert.equal(releaseIntents[0].command,'resources-retire');assert.equal(released[0].command,'resources-retire');assert.deepEqual(releaseIntents[0].details,{lifetimeHash,preimage:c.expectedLifetime});assert.deepEqual(released[0].details,{lifetimeHash});
 c.originalGuard(true);c.rt.noOtherActor();c.rt.providersOff();
 c.exclusive('check-private.json',{nonce:base.nonce,sourceSha256:c.sourceSha256,at:new Date().toISOString(),state:'PASS_EXACT_AC_CONTINUATION_RESOURCES_ONLY',exact,...limitations,
  originalEvidenceHashes:c.reservation.originalEvidence,originalSources:c.reservation.originalSources,originalFailedCommandLockRetained:true,originalLedgerUnchanged:true,
  originalCompanyBranchAndTypeCategoriesUnchanged:true,canonicalPermissionsUnchanged:true,otherPublicRowsAndIdentityBaselineUnchanged:true,
  rolesAndAssignmentsInactive:true,bothActorsBannedAndInactive:true,exactSessionsAbsent:true,ownedResourcesInactive:true,
  financeAndInactiveServiceAndArchivedNullDateSignatoryHistoryRetained:true,receiptsAndAuditsRetained:true,sourceBuildManifestMatched:true,listeningProcessVerified:false});
 process.stdout.write(JSON.stringify({marker:ac.marker,state:'PASS_EXACT_AC_CONTINUATION_RESOURCES_ONLY',...limitations})+'\n');return true;
 }catch{try{if(c&&!c.exists('check-failure-private.json'))c.exclusive('check-failure-private.json',{at:new Date().toISOString(),sourceSha256:c.sourceSha256,state:'FAIL_RETAINED',redacted:true,repairs:0});}catch{/* preserve failure */}process.stderr.write(JSON.stringify({marker:ac.marker,state:'FAIL_RETAINED',redacted:true,repairs:0})+'\n');return false;}finally{c?.close();}}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){if(process.argv.length!==2){process.stderr.write('NO_POSITIONAL_ARGUMENTS_ALLOWED\n');process.exitCode=1;}else if(!await checkACContinuation())process.exitCode=1;}
