// MAIN ONLY independent read-only checker. No fixture command, Auth API, Storage,
// consumer RPC, browser, repair or cleanup is invoked by this entrypoint.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {openACRuntime} from './admin-child-browser-runtime.mjs';
import {ac,commands,stages,resourceSpecs,resourcesSql,assertResources,actorSql,assertActor,assertRoles,
 observationSql,assertObservation,identitySql,inventorySql,preservationSql,preserveExcept,assertAppendOnlyHistory} from './admin-child-browser-contract.mjs';

export function checkACResources(){let rt;try{
 rt=openACRuntime({readOnly:true});assert.equal(rt.lifetimeExists(),false,'AC_LIFETIME_ACTIVE');assert.equal(rt.exists('command-lock-private.json'),false);assert.equal(rt.exists('check-private.json'),false,'PRESERVE_CHECK');assert.equal(rt.exists('check-failure-private.json'),false,'FAILED_CHECK_REQUIRES_REVIEW');
 const {base,events}=rt.stored();assert.deepEqual(events.filter(e=>e.event==='command-start').map(e=>e.command),commands);assert.deepEqual(events.filter(e=>e.event==='command-success').map(e=>e.command),commands);assert.equal(events.at(-1).event,'command-success');assert.equal(events.at(-1).command,'resources-retire');
 const resources=rt.read('resources-prepare-private.json'),editor=rt.read('editor-prepare-private.json'),reader=rt.read('reader-prepare-private.json'),final=rt.read('resources-retire-private.json'),last=rt.read('observe-profit-created-private.json');
 for(const command of commands){const record=rt.read(command+'-private.json');assert.equal(record.nonce,base.nonce);assert.equal(record.sourceSha256,base.sourceSha256);assert.equal(record.browserPassClaim,false);assert.equal(record.replayClaim,false);assert.deepEqual(rt.read(command+'-attempt-private.json'),{command,nonce:base.nonce,sourceSha256:base.sourceSha256});}
 const ids=Object.values(resources.ids);assert.equal(ids.length,9);
 const rows=rt.query(resourcesSql(resources));assertResources(rows,resources,true);assert.deepEqual(rows,final.rows);
 for(const key of Object.keys(resourceSpecs)){
  const deactivated=['country','party','costType','profitType','costParent','profitParent'].includes(key);preserveExcept(resources.rows[key],rows[key],['is_active','updated_at','workspace_revision',...(deactivated?['deactivated_at','deactivation_reason']:[])]);
  if(deactivated){assert.ok(rows[key].deactivated_at);assert.equal(rows[key].deactivation_reason,ac.marker+' retired');}
  if(Object.hasOwn(resources.rows[key],'workspace_revision'))assert.equal(BigInt(rows[key].workspace_revision),BigInt(resources.rows[key].workspace_revision)+BigInt(1));
 }
 for(const [which,prepared] of [['editor',editor],['reader',reader]]){
  const state=rt.query(actorSql(base,resources,which));assertRoles(state,resources,false,false);assertActor(state,base,resources,which,prepared,true);assert.deepEqual(state,final[which+'State']);assert.deepEqual(state.pairs,resources.state.pairs,'EXACT_PAIRS_CHANGED');
  const retired=rt.read(which+'-retire-private.json');for(const k of ['profiles','assignments','auth','sessions','refreshIds'])assert.deepEqual(state[k],retired.state[k]);
  const intents=events.filter(e=>e.event==='actor-retire-intent'&&e.details.which===which),results=events.filter(e=>e.event==='actor-retired'&&e.details.which===which);assert.equal(intents.length,1);assert.equal(results.length,1);
  const intent=intents[0].details,result=results[0].details.removed;assert.equal(intent.authId,base.actors[which].authId);assert.equal(intent.profileId,prepared.profileId);assert.deepEqual(intent.assignments,prepared.assignments);assert.deepEqual([...result.sessions].sort(),intent.sessions.map(s=>s.id).sort());assert.deepEqual([...result.refreshIds].sort(),[...intent.refreshIds].sort());assert.deepEqual(result,retired.removed);
 }
 const observation=rt.query(observationSql(base,resources,editor));const owned=assertObservation(observation,base,resources,editor,stages.at(-1),{retired:true});assert.deepEqual(observation,final.observation);
 assert.deepEqual(observation.audits,last.observation.audits);assert.deepEqual(observation.receipts,last.observation.receipts);for(const k of ['finance','service','signatory'])assert.deepEqual(observation.rows[k],last.observation.rows[k]);for(const k of ['cost','profit'])preserveExcept(last.observation.rows[k][0],observation.rows[k][0],['is_active','deactivated_at','deactivation_reason','updated_at','workspace_revision']);
 // Revalidate historical checkpoints. Database observations do not establish
 // that a browser displayed an error, blocked close, lost a response or retried.
 for(const [index,stage] of stages.entries()){
  const record=rt.read('observe-'+stage+'-private.json');assertObservation(record.observation,base,resources,editor,stage);const prior=index===0?editor.initial:rt.read('observe-'+stages[index-1]+'-private.json').observation;
  assertAppendOnlyHistory(prior,record.observation);
  if(stage.endsWith('-invalid')||stage.endsWith('-replayed')||stage==='finance-read-recovered')assert.deepEqual(record.observation,prior);
  if(stage.endsWith('-noop')){assert.deepEqual(record.observation.rows,prior.rows);assert.deepEqual(record.observation.audits,prior.audits);for(const old of prior.receipts)assert.deepEqual(record.observation.receipts.find(r=>r.operation_id===old.operation_id),old);}
 }
 assertAppendOnlyHistory(last.observation,rt.read('observe-reader-private.json').observation);assertAppendOnlyHistory(last.observation,observation);assert.deepEqual(rt.read('observe-reader-private.json').observation,last.observation);assert.deepEqual(rt.query(inventorySql),resources.tables);assert.deepEqual(rt.query(identitySql(base,resources)),resources.identityBefore);assert.deepEqual(rt.query(preservationSql(resources.tables,resources,observation)),resources.businessBefore);
 rt.prerequisitesGuard();rt.noOtherActor();rt.providersOff();rt.guard();
 rt.exclusive('check-private.json',{nonce:base.nonce,sourceSha256:base.sourceSha256,at:new Date().toISOString(),state:'PASS_EXACT_AC_RESOURCES_ONLY',ids:resources.ids,children:owned,
  originalLedgerUnchanged:true,originalCompanyBranchAndTypeCategoriesUnchanged:true,canonicalPermissionsUnchanged:true,otherPublicRowsAndIdentityBaselineUnchanged:true,
  rolesAndAssignmentsInactive:true,bothActorsBannedAndInactive:true,exactSessionsAbsent:true,ownedResourcesInactive:true,financeAndInactiveServiceAndArchivedSignatoryHistoryRetained:true,
  receiptsAndAuditsRetained:true,sourceBuildManifestMatched:true,listeningProcessVerified:false,browserPassClaim:false,replayClaim:false,repairs:0});
 process.stdout.write(JSON.stringify({marker:ac.marker,state:'PASS_EXACT_AC_RESOURCES_ONLY',browserPassClaim:false,replayClaim:false,repairs:0})+'\n');return true;
 }catch{try{if(rt&&!rt.exists('check-failure-private.json'))rt.exclusive('check-failure-private.json',{at:new Date().toISOString(),sourceSha256:rt.sourceSha256,state:'FAIL_RETAINED',redacted:true,repairs:0});}catch{/* retain original failure */}process.stderr.write(JSON.stringify({marker:ac.marker,state:'FAIL_RETAINED',redacted:true,repairs:0})+'\n');return false;}finally{rt?.close();}}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){if(process.argv.length!==2){process.stderr.write('NO_POSITIONAL_ARGUMENTS_ALLOWED\n');process.exitCode=1;}else if(!checkACResources())process.exitCode=1;}
