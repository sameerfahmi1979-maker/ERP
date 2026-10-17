// MAIN ONLY, read-only independent reconciliation. No runtime effects on import.
// Run once immediately after this mode's role-retire, BEFORE preparing another
// role/actor. Later intentional identity changes may invalidate its strict baseline.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {openScopedRuntime} from './scoped-browser-runtime.mjs';
import {permissionsSql,validatePermissions,stateSql,assertRole,assertActor,projectionSql,assertPreserved} from './scoped-browser-contract.mjs';

export function checkScopedBrowserResources(modeName){
  let rt;
  try{
    rt=openScopedRuntime(modeName,{readOnly:true});
    assert.equal(rt.lifetimeLockExists(),false,'OPEN_SCOPED_ACTOR_LIFETIME');
    assert.equal(rt.exists('command-lock-private.json'),false,'UNCONFIRMED_COMMAND_LOCK');
    assert.equal(rt.exists('check-failure-private.json'),false,'FAILED_CHECK_REQUIRES_MAIN_RECONCILIATION');
    const stored=rt.validateStored(),base=stored.reservation;
    const success=stored.events.filter(e=>e.event==='command-success').map(e=>e.command);
    assert.deepEqual(success.filter(c=>c!=='observe'),['role-prepare','prepare','retire','role-retire']);
    assert.ok(success.filter(c=>c==='observe').length<=1);
    assert.equal(stored.events.at(-1).event,'command-success');assert.equal(stored.events.at(-1).command,'role-retire');
    assert.equal(rt.exists('check-private.json'),false,'PRESERVE_ORIGINAL_CHECK');
    const roleReceipt=rt.read('role-prepare-private.json'),prepared=rt.read('prepare-private.json');
    const retired=rt.read('retire-private.json'),final=rt.read('role-retire-private.json');
    const reservation={...base,roleId:roleReceipt.roleId,pairs:roleReceipt.pairs,permissions:roleReceipt.permissions};
    for(const receipt of [roleReceipt,prepared,retired,final]){
      assert.equal(receipt.nonce,base.nonce);assert.equal(receipt.sourceSha256,base.sourceSha256);assert.equal(receipt.authId,base.authId);
      assert.equal(receipt.roleId,reservation.roleId);
    }
    const permissions=validatePermissions(rt.mode,rt.query(permissionsSql(rt.mode)));assert.deepEqual(permissions,reservation.permissions);
    const current=rt.query(stateSql(reservation));assertRole(current,reservation,false);assertActor(current,reservation,prepared,true);
    assert.deepEqual(current.pairs,roleReceipt.state.pairs,'OWNED_PERMISSION_PAIRS_CHANGED');
    assert.deepEqual(current.role,final.state.role,'RETIRED_ROLE_CHANGED');
    assert.deepEqual(current.profiles,final.state.profiles,'RETIRED_PROFILE_CHANGED');
    assert.deepEqual(current.assignments,final.state.assignments,'RETIRED_ASSIGNMENT_CHANGED');
    const intents=stored.events.filter(e=>e.event==='exact-retirement-intent');
    const results=stored.events.filter(e=>e.event==='exact-retirement-result');assert.equal(intents.length,1);assert.equal(results.length,1);
    assert.equal(intents[0].details.authId,base.authId);assert.equal(intents[0].details.profileId,prepared.profileId);
    assert.equal(intents[0].details.assignmentId,prepared.assignmentId);assert.equal(intents[0].details.roleId,reservation.roleId);
    assert.deepEqual([...results[0].details.removedSessionIds].sort(),[...intents[0].details.sessionIds].sort());
    assert.deepEqual([...results[0].details.removedRefreshIds].sort(),[...intents[0].details.refreshIds].sort());
    // Original role preparation baseline excludes only this actor and owned role.
    // All canonical permissions and unrelated role-permission pairs remain exact.
    assertPreserved(roleReceipt.preservedBaseline,rt.query(projectionSql(base.authId,reservation.roleId)),true);
    rt.noOtherActor(base.authId);rt.providersOff();rt.guard();
    rt.exclusive('check-private.json',{nonce:base.nonce,mode:modeName,sourceSha256:base.sourceSha256,
      at:new Date().toISOString(),state:'PASS_EXACT_SCOPED_RESOURCES_ONLY',roleId:reservation.roleId,
      profileId:prepared.profileId,assignmentId:prepared.assignmentId,permissionIds:permissions.map(p=>p.id),
      ownedRoleInactive:true,ownedAssignmentInactive:true,ownedProfileInactive:true,accountBanned:true,
      exactSessionsAbsent:true,permissionsUnchanged:true,permissionPairsRetained:true,unrelatedBaselinePreserved:true,
      browserLoginObserved:success.includes('observe'),browserPassClaim:false,repairs:0});
    process.stdout.write(JSON.stringify({mode:modeName,state:'PASS_EXACT_SCOPED_RESOURCES_ONLY',repairs:0,browserPassClaim:false})+'\n');return true;
  }catch{
    // Do not overwrite a prior checker receipt or issue any repair. Source journal
    // and failed command locks remain intact for main's independent reconciliation.
    try{if(rt&&!rt.exists('check-failure-private.json'))rt.exclusive('check-failure-private.json',{
      mode:modeName,at:new Date().toISOString(),sourceSha256:rt.sourceSha256,state:'FAIL_RETAINED',redacted:true,repairs:0});}catch{/* keep existing evidence; never print raw error */}
    process.stderr.write(JSON.stringify({mode:modeName,state:'FAIL_RETAINED',redacted:true,repairs:0})+'\n');return false;
  }finally{rt?.close();}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  if(process.argv.length!==2){process.stderr.write('NO_POSITIONAL_ARGUMENTS_ALLOWED\n');process.exitCode=1;}
  else if(!checkScopedBrowserResources(process.env.ALGT_F06_SCOPED_MODE))process.exitCode=1;
}
