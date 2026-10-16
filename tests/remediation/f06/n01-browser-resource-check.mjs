// MAIN ONLY independent read-only exact-resource reconciliation, after retirement.
// Does not invoke fixture commands, Auth, business RPCs, Storage or repair logic.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {openN01Runtime} from './n01-browser-runtime.mjs';
import {n01,commands,permissionsSql,validatePermissions,stateSql,assertRole,assertActor,taxonomySql,assertTaxonomy,
  projectionSql,assertPreserved,businessSql,observationSql,assertObservation,assertSequenceHistoryPreserved,ruleSql,assertNumberingProgress} from './n01-browser-contract.mjs';
export function checkN01Resources(){
  let rt;
  try{
    rt=openN01Runtime({readOnly:true});assert.equal(rt.lifetimeLockExists(),false,'N01_LIFETIME_STILL_OPEN');
    assert.equal(rt.exists('command-lock-private.json'),false);assert.equal(rt.exists('check-private.json'),false,'PRESERVE_ORIGINAL_CHECK');
    assert.equal(rt.exists('check-failure-private.json'),false,'FAILED_CHECK_REQUIRES_MAIN_RECONCILIATION');
    const {base,events}=rt.validateStored();assert.deepEqual(events.filter(e=>e.event==='command-success').map(e=>e.command),commands);
    assert.equal(events.at(-1)?.event,'command-success');assert.equal(events.at(-1)?.command,'resources-retire');
    const resources=rt.read('resources-prepare-private.json'),prepared=rt.read('actor-prepare-private.json');
    const created=rt.read('observe-created-private.json'),retained=rt.read('observe-retained-private.json');
    const retired=rt.read('actor-retire-private.json'),final=rt.read('resources-retire-private.json');
    for(const receipt of [resources,prepared,created,retained,retired,final]){
      assert.equal(receipt.nonce,base.nonce);assert.equal(receipt.authId,base.authId);assert.equal(receipt.sourceSha256,base.sourceSha256);
    }
    assert.equal(prepared.roleId,resources.roleId);assert.equal(prepared.profileId,created.profileId);
    assert.deepEqual(validatePermissions(n01,rt.query(permissionsSql(n01))),resources.permissions);
    const state=rt.query(stateSql({...base,...resources}));assertRole(state,resources,false);assertActor(state,base,prepared,true);
    for(const key of ['role','pairs','profiles','assignments'])assert.deepEqual(state[key],final.state[key],'RETIRED_IDENTITY_CHANGED:'+key);
    assert.deepEqual(state.pairs,resources.actorState.pairs,'EXACT_PERMISSION_PAIRS_CHANGED');
    const taxonomy=rt.query(taxonomySql(resources));assertTaxonomy(taxonomy,resources,false);assert.deepEqual(taxonomy,final.taxonomy);
    const observed=rt.query(observationSql(resources,prepared.profileId));const identity=assertObservation(observed,resources,prepared.profileId,{archived:true});
    assert.deepEqual(identity,created.identity);assert.deepEqual(identity,retained.identity);assert.deepEqual(identity,final.identity);
    assert.deepEqual(observed,final.observed,'RETAINED_BUSINESS_HISTORY_CHANGED');
    for(const key of ['references','requests','events','audits','sequences'])assert.deepEqual(observed[key],created.observed[key]);
    const ignored=new Set(['is_archived','archived_at','updated_at']);
    const stableDoc=doc=>Object.fromEntries(Object.entries(doc).filter(([key])=>!ignored.has(key)));
    assert.deepEqual(stableDoc(observed.documents[0]),stableDoc(created.observed.documents[0]));
    const currentRule=rt.query(ruleSql())[0];assert.equal(currentRule.is_active,resources.rule.is_active);assert.deepEqual(currentRule,final.ruleAfter);
    assertNumberingProgress(resources.rule,currentRule,observed);
    assertSequenceHistoryPreserved(prepared.initial.sequences,observed.sequences,identity.sequenceId);
    assertPreserved(resources.identityBefore,rt.query(projectionSql(base.authId,resources.roleId)),true);
    assert.deepEqual(resources.businessBefore,rt.query(businessSql(resources.rule.id,resources,prepared.profileId)));
    const intents=events.filter(e=>e.event==='actor-retire-intent'),results=events.filter(e=>e.event==='actor-retired');assert.equal(intents.length,1);assert.equal(results.length,1);
    const intent=intents[0].details,result=results[0].details;
    assert.equal(intent.authId,base.authId);assert.equal(intent.profileId,prepared.profileId);assert.equal(intent.assignmentId,prepared.assignmentId);assert.equal(intent.roleId,resources.roleId);
    assert.deepEqual([...result.sessionIds].sort(),[...intent.sessionIds].sort());assert.deepEqual([...result.refreshIds].sort(),[...intent.refreshIds].sort());assert.deepEqual(result,retired.removed);
    rt.noOtherActor(base.authId);rt.providersOff();rt.guard();
    rt.exclusive('check-private.json',{nonce:base.nonce,marker:n01.marker,sourceSha256:base.sourceSha256,at:new Date().toISOString(),state:'PASS_EXACT_N01_RESOURCES_ONLY',identity,
      originalLedgerUnchanged:true,canonicalPermissionsUnchanged:true,exactOwnedRoleAndAssignmentInactive:true,actorBannedAndInactive:true,exactSessionsAbsent:true,
      taxonomyInactive:true,documentArchived:true,numberConsumedAndHistoryRetained:true,ruleActiveFlagRestored:true,countersRetained:true,
      responseLossTested:false,replayClaim:false,browserPassClaim:false,repairs:0});
    process.stdout.write(JSON.stringify({marker:n01.marker,state:'PASS_EXACT_N01_RESOURCES_ONLY',browserPassClaim:false,repairs:0})+'\n');return true;
  }catch{
    try{if(rt&&!rt.exists('check-failure-private.json'))rt.exclusive('check-failure-private.json',{marker:n01.marker,at:new Date().toISOString(),sourceSha256:rt.sourceSha256,state:'FAIL_RETAINED',redacted:true,repairs:0});}catch{/* preserve prior evidence */}
    process.stderr.write(JSON.stringify({marker:n01.marker,state:'FAIL_RETAINED',redacted:true,repairs:0})+'\n');return false;
  }finally{rt?.close();}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  if(process.argv.length!==2){process.stderr.write('NO_POSITIONAL_ARGUMENTS_ALLOWED\n');process.exitCode=1;}
  else if(!checkN01Resources())process.exitCode=1;
}
