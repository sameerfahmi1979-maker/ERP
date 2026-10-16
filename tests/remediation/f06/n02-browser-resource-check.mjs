// MAIN ONLY independent SQL-metadata reconciliation. No fixture commands,
// Storage/Auth requests, consumer RPC, repair or cleanup is invoked here.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {openN02Runtime} from './n02-browser-runtime.mjs';
import {n02,commands,sourceBytes,sourceDigest,permissionsSql,validatePermissions,actorStateSql,assertRoles,assertActor,
 taxonomySql,assertTaxonomy,sourceSql,assertSource,storageSql,assertStorage,observationSql,assertObservation,
 expectedRequest,identitySql,assertPreserved,businessSql,ruleSql,assertNumberingProgress,assertSequenceHistoryPreserved,preserveExcept,bucketSql,storageSecuritySql} from './n02-browser-contract.mjs';

export function checkN02Resources(){
 let rt;
 try{
  rt=openN02Runtime({readOnly:true});assert.equal(rt.lifetimeLockExists(),false,'N02_LIFETIME_STILL_OPEN');assert.equal(rt.exists('command-lock-private.json'),false);
  assert.equal(rt.exists('check-private.json'),false,'PRESERVE_ORIGINAL_CHECK');assert.equal(rt.exists('check-failure-private.json'),false,'FAILED_CHECK_REQUIRES_MAIN_RECONCILIATION');
  const {base,events}=rt.validateStored();assert.deepEqual(events.filter(e=>e.event==='command-success').map(e=>e.command),commands);assert.equal(events.at(-1)?.event,'command-success');assert.equal(events.at(-1)?.command,'resources-retire');
  const resources=rt.read('resources-prepare-private.json'),prepared=rt.read('actor-source-prepare-private.json'),completed=rt.read('observe-completed-private.json'),retained=rt.read('observe-retained-private.json'),retired=rt.read('actor-retire-private.json'),final=rt.read('resources-retire-private.json');
  for(const r of [resources,prepared,completed,retained,retired,final]){assert.equal(r.nonce,base.nonce);assert.equal(r.authId,base.authId);assert.equal(r.sourceSha256,base.sourceSha256);}
  assert.deepEqual(prepared.roles,resources.roles);assert.equal(prepared.profileId,completed.profileId);assert.deepEqual(prepared.expectedRequest,expectedRequest(base,resources,prepared));
  assert.deepEqual(validatePermissions(n02,rt.query(permissionsSql(n02))),resources.permissions);assert.deepEqual(rt.query(bucketSql()),base.buckets);assert.deepEqual(rt.query(storageSecuritySql()),base.storageSecurity);
  const state=rt.query(actorStateSql(base,resources));assertRoles(state,resources,false);assertActor(state,base,prepared,true);
  for(const key of ['roles','pairs','profiles','assignments'])assert.deepEqual(state[key],final.state[key],'RETIRED_IDENTITY_CHANGED:'+key);assert.deepEqual(state.pairs,resources.state.pairs,'EXACT_PERMISSION_PAIRS_CHANGED');
  const taxonomy=rt.query(taxonomySql(resources));assertTaxonomy(taxonomy,resources,false);assert.deepEqual(taxonomy,final.taxonomy);
  for(const key of ['type','category'])preserveExcept(resources.taxonomy[key],taxonomy[key],['is_active','updated_at'],'RETAINED_TAXONOMY_CHANGED');
  const observation=rt.query(observationSql(base,resources,prepared)),identity=assertObservation(observation,base,resources,prepared,{archived:true});
  for(const r of [completed,retained,retired,final])assert.deepEqual(identity,r.identity);assert.deepEqual(observation,final.observation,'RETAINED_COMPLETION_HISTORY_CHANGED');
  for(const key of ['references','requests','versions','files','events','audits','verified','completed','sequences'])assert.deepEqual(observation[key],completed.observation[key]);
  preserveExcept(completed.observation.documents[0],observation.documents[0],['is_archived','archived_at','updated_at'],'RETAINED_DOCUMENT_CHANGED');
  const source=assertSource(rt.query(sourceSql(prepared)),base,prepared,{documentId:identity.documentId,retired:true});assert.deepEqual(source,final.source);
  preserveExcept(prepared.source,source,['document_id','status','intake_status','completed_at','updated_at'],'RETAINED_SOURCE_CHANGED');preserveExcept(completed.source,source,['status','intake_status','updated_at'],'RETAINED_COMPLETED_SOURCE_CHANGED');
  const objects=rt.query(storageSql(base)),stored=assertStorage(objects,base,observation);assert.deepEqual(objects,final.objects);assert.deepEqual(objects,completed.objects);assert.deepEqual(stored.source,prepared.objects[0]);
  // Verify captured byte attestations against CURRENT exact metadata, without
  // claiming this independent SQL-only checker downloaded current bytes.
  for(const [record,expectedObjects] of [[prepared,prepared.objects],[completed,completed.objects],[retained,retained.objects]]){
   assert.equal(record.byteProofs.length,expectedObjects.length);const seen=new Set();
   for(const proof of record.byteProofs){const key=proof.bucket+':'+proof.path;assert.equal(seen.has(key),false);seen.add(key);const object=objects.find(o=>o.bucket_id===proof.bucket&&o.name===proof.path);assert.ok(object);
    assert.equal(proof.objectId,object.id);assert.equal(proof.version,object.version);assert.equal(proof.databaseUpdatedAt,object.updated_at);assert.equal(proof.contentSha256,sourceDigest());assert.equal(proof.size,sourceBytes().length);assert.equal(new Date(proof.apiLastModified).toISOString(),new Date(object.updated_at).toISOString());}
  }
  assert.ok(completed.state.sessions.some(s=>s.id===identity.verifiedSessionId&&s.userId===base.authId),'VERIFICATION_SESSION_WAS_NOT_OBSERVED');
  const currentRule=rt.query(ruleSql())[0];assert.equal(currentRule.is_active,resources.rule.is_active);assert.deepEqual(currentRule,final.ruleAfter);assertNumberingProgress(resources.rule,currentRule,observation);assertSequenceHistoryPreserved(prepared.initial.sequences,observation.sequences,identity.sequenceId);
  assertPreserved(resources.identityBefore,rt.query(identitySql(base.authId,resources)),true);assert.deepEqual(resources.businessBefore,rt.query(businessSql(base,resources.rule.id,resources,prepared,identity)));
  const intents=events.filter(e=>e.event==='actor-retire-intent'),results=events.filter(e=>e.event==='actor-retired');assert.equal(intents.length,1);assert.equal(results.length,1);const intent=intents[0].details,result=results[0].details;
  assert.equal(intent.authId,base.authId);assert.equal(intent.profileId,prepared.profileId);assert.deepEqual(intent.assignmentIds,prepared.assignmentIds);assert.deepEqual(intent.roles,prepared.roles);
  assert.deepEqual([...result.sessionIds].sort(),[...intent.sessionIds].sort());assert.deepEqual([...result.refreshIds].sort(),[...intent.refreshIds].sort());assert.deepEqual(result,retired.removed);
  const sourceIntents=events.filter(e=>e.event==='source-upload-intent'),sourceResults=events.filter(e=>e.event==='source-upload-returned');assert.equal(sourceIntents.length,1);assert.equal(sourceResults.length,1);
  assert.deepEqual(sourceIntents[0].details,{bucket:'dms-temp',path:n02.sourcePath,sha256:sourceDigest(),size:sourceBytes().length,mime:n02.mime,upsert:false,retained:true});assert.equal(sourceResults[0].details.id,stored.source.id);assert.equal(sourceResults[0].details.path,n02.sourcePath);
  rt.noOtherActor(base.authId);rt.providersOff();rt.guard();
  rt.exclusive('check-private.json',{nonce:base.nonce,marker:n02.marker,sourceSha256:base.sourceSha256,at:new Date().toISOString(),state:'PASS_EXACT_N02_RESOURCES_ONLY',identity,
   originalLedgerUnchanged:true,canonicalPermissionsUnchanged:true,storageBucketsAndPoliciesUnchanged:true,rolesAndAssignmentsInactive:true,actorBannedAndInactive:true,exactSessionsAbsent:true,
   taxonomyInactive:true,documentArchived:true,sourceRetiredAndBound:true,numberAndAllHistoryRetained:true,sourceAndDestinationObjectIdentitiesRetained:true,ruleActiveFlagRestored:true,countersRetained:true,
   historicalByteProofsCaptured:true,currentByteDownload:false,responseLossTested:false,replayClaim:false,browserPassClaim:false,repairs:0});
  process.stdout.write(JSON.stringify({marker:n02.marker,state:'PASS_EXACT_N02_RESOURCES_ONLY',browserPassClaim:false,currentByteDownload:false,repairs:0})+'\n');return true;
 }catch{
  try{if(rt&&!rt.exists('check-failure-private.json'))rt.exclusive('check-failure-private.json',{marker:n02.marker,at:new Date().toISOString(),sourceSha256:rt.sourceSha256,state:'FAIL_RETAINED',redacted:true,repairs:0});}catch{/* retain all prior evidence */}
  process.stderr.write(JSON.stringify({marker:n02.marker,state:'FAIL_RETAINED',redacted:true,repairs:0})+'\n');return false;
 }finally{rt?.close();}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 if(process.argv.length!==2){process.stderr.write('NO_POSITIONAL_ARGUMENTS_ALLOWED\n');process.exitCode=1;}else if(!checkN02Resources())process.exitCode=1;
}
