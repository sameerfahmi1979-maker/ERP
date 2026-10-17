// MAIN ONLY, independent read-only reconciliation. Never invokes fixture/Auth.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {openCbRuntime} from './cb-browser-runtime.mjs';
import {projectionSql} from './scoped-browser-contract.mjs';
import {cb,modes,commands,checks,permissionsSql,assertPermissions,denyPermissionSql,assertDenyPermission,registrySchemaSql,identitySql,assertPreserved,stateSql,assertRole,assertActor,assertActorRetirement,snapshotSql,assertResourceCreation,assertTransition,assertRetiredResources} from './cb-browser-contract.mjs';
export function checkCbResources(phase){
  let rt;
  try{
    assert.ok(checks.includes(phase));rt=openCbRuntime({readOnly:true});assert.equal(rt.exists('command-lock-private.json'),false);
    assert.equal(rt.exists(phase+'-check-private.json'),false,'PRESERVE_ORIGINAL_CHECK');assert.equal(rt.exists(phase+'-check-failure-private.json'),false);
    const {base,events}=rt.validateStored(),resources=rt.read('resources-prepare-private.json');rt.assertLifetime(base,phase==='company');rt.noOtherActor();
    const expected=phase==='company'?commands.slice(0,commands.indexOf('company-retire')+1):commands;
    assert.deepEqual(events.filter(e=>e.event==='command-success').map(e=>e.command),expected);assert.equal(events.at(-1)?.event,'command-success');
    assert.deepEqual(assertPermissions(rt.query(permissionsSql(modes.company))),resources.permissions);const deny=rt.query(denyPermissionSql());assertDenyPermission(deny);assert.deepEqual(deny,resources.denyPermission);assert.deepEqual(rt.query(registrySchemaSql()),resources.schema);
    assertPreserved(resources.identityBefore,rt.query(identitySql(base,resources)),true);
    const receipts=expected.map(c=>rt.read(c+'-private.json'));for(const receipt of receipts){assert.equal(receipt.nonce,base.nonce);assert.equal(receipt.sourceSha256,base.sourceSha256);assert.deepEqual(receipt.actors,base.actors);}
    const resourceIntent=events.filter(e=>e.event==='resources-create-intent');assert.equal(resourceIntent.length,1);assert.deepEqual(resourceIntent[0].details.before,resources.before);assert.deepEqual(resourceIntent[0].details.identityBefore,resources.identityBefore);assert.deepEqual(resourceIntent[0].details.borrowed,resources.borrowed);
    assertResourceCreation(resources.before,resources.observed,base,resources);
    const company=rt.read('company-prepare-private.json');
    for(let i=1;i<expected.length;i++){
      const command=expected[i],before=receipts[i-1].observed,after=receipts[i].observed;
      if(command.startsWith('observe-'))assertTransition(command,before,after,base,resources,company,receipts.slice(0,i).map(r=>r.observed));
      else if(command==='resources-retire')assertRetiredResources(before,after,resources);
      else assert.deepEqual(after,before,'NON_BROWSER_COMMAND_CHANGED_BUSINESS');
    }
    for(const mode of Object.keys(modes)){
      const r={...base,mode,authId:base.actors[mode].authId,...resources.roles[mode]},state=rt.query(stateSql(r));
      if(phase==='company'&&mode==='branch'){assertRole(state,r);assert.deepEqual(state,resources.roles.branch.initialState);continue;}
      const prepared=rt.read(mode+'-prepare-private.json'),retired=rt.read(mode+'-retire-private.json');assertActor(state,r,prepared,true);assertRole(state,r,false);assert.deepEqual(state,retired.state,'RETIRED_IDENTITY_CHANGED');assert.deepEqual(state.pairs,resources.roles[mode].initialState.pairs);
      // Company baseline predates the second actor, so its strict comparison is
      // at its own close only. The global original baseline always excludes both
      // exact owned actors/roles, never unknown additions.
      if(phase==='company'||mode==='branch')assertPreserved(prepared.identityBaseline,rt.query(projectionSql(r.authId,r.roleId)),true);
      const intents=events.filter(e=>e.event==='actor-retire-intent'&&e.details.mode===mode),results=events.filter(e=>e.event==='actor-retired'&&e.details.mode===mode);assert.equal(intents.length,1);assert.equal(results.length,1);
      const intent=intents[0].details,result=results[0].details;assert.equal(intent.authId,r.authId);assert.equal(intent.roleId,r.roleId);assert.equal(intent.profileId,prepared.profileId);assert.equal(intent.assignmentId,prepared.assignmentId);
      assertActorRetirement(intent.state,state);
      assert.deepEqual([...result.sessionIds].sort(),[...intent.sessionIds].sort());assert.deepEqual([...result.refreshIds].sort(),[...intent.refreshIds].sort());assert.deepEqual({sessionIds:result.sessionIds,refreshIds:result.refreshIds},retired.removed);
      const create=events.filter(e=>e.event==='auth-create-intent'&&e.details.mode===mode),assign=events.filter(e=>e.event==='actor-assignment-intent'&&e.details.mode===mode),created=events.filter(e=>e.event==='actor-assignment-created'&&e.details.mode===mode);assert.equal(create.length,1);assert.equal(assign.length,1);assert.equal(created.length,1);
      assert.equal(create[0].details.authId,r.authId);assert.equal(create[0].details.email,modes[mode].email);assert.equal(assign[0].details.profileId,prepared.profileId);assert.equal(assign[0].details.roleId,r.roleId);assert.equal(created[0].details.assignmentId,prepared.assignmentId);assert.ok(create[0].sequence<assign[0].sequence&&assign[0].sequence<created[0].sequence&&created[0].sequence<intents[0].sequence&&intents[0].sequence<results[0].sequence);
    }
    const observed=rt.query(snapshotSql(base));assert.deepEqual(observed,receipts.at(-1).observed,'FINAL_BUSINESS_HISTORY_CHANGED');
    if(phase==='final'){
      const bound=events.filter(e=>e.event==='company-independent-check-bound');assert.equal(bound.length,1);assert.equal(bound[0].details.sha256,rt.hashFile('company-check-private.json'));
      const check=rt.read('company-check-private.json');assert.equal(check.nonce,base.nonce);assert.equal(check.sourceSha256,base.sourceSha256);assert.equal(check.state,'PASS_EXACT_CB_COMPANY_RESOURCES_ONLY');assert.equal(check.retirementSha256,rt.hashFile('company-retire-private.json'));
    }
    rt.providersOff();rt.guard();rt.exclusive(phase+'-check-private.json',{nonce:base.nonce,marker:cb.marker,sourceSha256:base.sourceSha256,at:new Date().toISOString(),state:phase==='company'?'PASS_EXACT_CB_COMPANY_RESOURCES_ONLY':'PASS_EXACT_CB_FINAL_RESOURCES_ONLY',retirementSha256:rt.hashFile((phase==='company'?'company-retire':'resources-retire')+'-private.json'),observed,
      canonicalPermissionDefinitionsUnchanged:true,borrowedRowsUnchanged:true,exactSessionsAbsent:true,priorHistoryRetained:true,originalLedgerUnchanged:true,browserPassClaim:false,readFailureInjected:false,repairs:0});
    process.stdout.write(JSON.stringify({marker:cb.marker,phase,state:'PASS_EXACT_CB_RESOURCES_ONLY',browserPassClaim:false,repairs:0})+'\n');return true;
  }catch{
    try{if(rt&&checks.includes(phase)&&!rt.exists(phase+'-check-failure-private.json'))rt.exclusive(phase+'-check-failure-private.json',{marker:cb.marker,phase,sourceSha256:rt.sourceSha256,at:new Date().toISOString(),state:'FAIL_RETAINED',redacted:true,repairs:0});}catch{/* preserve prior evidence */}
    process.stderr.write(JSON.stringify({marker:cb.marker,phase,state:'FAIL_RETAINED',redacted:true,repairs:0})+'\n');return false;
  }finally{rt?.close();}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){if(process.argv.length!==3){process.stderr.write('ONE_EXPLICIT_CB_CHECK_PHASE_REQUIRED\n');process.exitCode=1;}else if(!checkCbResources(process.argv[2]))process.exitCode=1;}
