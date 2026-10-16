// MAIN ONLY closed sequential fixture. No runtime work on import.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {openNumberedHRRuntime} from './n05-n07-browser-runtime.mjs';
import {modeFor,commandsFor,id,roleCreateSql,absenceSql,setupSql,resourcesSql,assertResources,actorSql,assertRoles,assertActor,actorPrepareSql,actorRetireSql,identitySql,businessSql,observationSql,assertEmptyObservation,assertRequest,assertCommitted,sourceFingerprintSql,prerequisiteSql,sequencesSql,assertNumbering,preserveExcept,assertAppendOnly,assertResourceTransition,assertRetiredObservation,retireSql,assertActorHistory,assertPreparedActorHistory} from './n05-n07-browser-contract.mjs';

export function observeNumberedHR(rt,name,base,r,prepared,request=null){
 const observed=rt.query(observationSql(name,base,r,prepared,request));
 return {actor:rt.query(actorSql(base,r)),rows:rt.query(resourcesSql(name,base.owner,r)),observed,prerequisites:rt.query(prerequisiteSql(name,base.owner)),identity:rt.query(identitySql(base,r)),business:rt.query(businessSql(name,base,r,prepared,observed)),sourceFingerprint:name==='N07'?rt.sql(sourceFingerprintSql(r.ids.document)):null};
}
export function assertNumberedHRState(state,name,base,r,prepared,{request=null,reviewed=false,retiredActor=false,retiredResources=false}={}){
 assertRoles(state.actor,name,r,retiredActor);assertActor(state.actor,name,base,r,prepared,retiredActor);assertActorHistory(r.roleState,state.actor,{retired:retiredActor});assertPreparedActorHistory(prepared.state,state.actor,{retired:retiredActor});
 assert.deepEqual(state.identity,r.identityBefore,'OTHER_IDENTITIES_CHANGED');assert.deepEqual(state.business,r.businessBefore,'OTHER_PUBLIC_PRIVATE_STORAGE_ROWS_CHANGED');
 preserveExcept(base.prerequisites,state.prerequisites,['rule']);assertResources(state.rows,name,base.owner,r,{converted:request!==null,retired:retiredResources});assertResourceTransition(r.rows,state.rows,name,{converted:request!==null,retired:retiredResources});
 if(request){const identity=assertCommitted(state.observed,name,base,r,prepared,request,{retired:retiredResources});assertNumbering(base.prerequisites.rule,state.prerequisites.rule,r.initialSequences,state.observed);return identity;}
 assertEmptyObservation(state.observed,name,prepared,r,{reviewed});assert.deepEqual(state.observed.sequences,r.initialSequences);assertNumbering(base.prerequisites.rule,state.prerequisites.rule,r.initialSequences);return null;
}
export function assertCommitContinuity(before,after,name,{retired=false}={}){
 if(retired)assertRetiredObservation(before.observed,after.observed,name);else{assert.deepEqual(after.observed,before.observed,'COMMITTED_FULL_ROWS_CHANGED');assert.deepEqual(after.rows,before.rows,'REVIEWED_SOURCE_CHANGED');assert.equal(after.sourceFingerprint,before.sourceFingerprint);}
 assert.deepEqual(after.prerequisites,before.prerequisites,'NUMBERING_OR_ADMISSION_CHANGED_AFTER_COMMIT');assert.deepEqual(after.identity,before.identity);assert.deepEqual(after.business,before.business);
}

export async function runNumberedHRFixture(name,command){let rt,stage='preflight';
 try{
  const mode=modeFor(name);assert.ok(commandsFor(name).includes(command));rt=openNumberedHRRuntime(name,{readOnly:command.startsWith('observe-')});const base=command==='resources-prepare'?rt.fresh():rt.stored().base;rt.noOtherActor(command==='resources-prepare'?null:base.authId);
  // Freshness/permission/schema/build checks occur before ANY lock or journal.
  if(command==='resources-prepare'){assert.equal(rt.lifetimeExists(),false);assert.equal(rt.sql(absenceSql(name,base)),'0','FRESH_IDENTITIES_REQUIRED');}
  rt.start(command,base);
  if(command==='resources-prepare'){
   stage='resource-intent';const identityBefore=rt.query(identitySql(base)),businessBefore=rt.query(businessSql(name,base)),initialSequences=rt.query(sequencesSql(name));
   const roles=Object.entries(mode.roles);const permissionRows=rt.prerequisites.permissions.map(p=>({id:p.id,code:p.permission_code,active:p.is_active}));
   rt.append('resources-create-intent',{name,marker:mode.marker,roles:mode.roles,prerequisites:base.prerequisites,identityBefore,businessBefore,initialSequences,syntheticOnly:true});stage='resources-create';
   const output=rt.sql(roles.map(([,role])=>roleCreateSql(role,permissionRows.filter(p=>role.permissions.includes(p.code)))).join('\n')+'\n'+setupSql(name,base.owner),true).split('\n');assert.equal(output.length,roles.length+1);
   const r={roles:Object.fromEntries(roles.map(([scope],i)=>[scope,JSON.parse(output[i])])),ids:JSON.parse(output.at(-1)),identityBefore,businessBefore,initialSequences};for(const role of Object.values(r.roles)){id(role.roleId);for(const pair of role.pairs)id(pair.id);}for(const value of Object.values(r.ids))id(value);rt.append('resources-created',{roles:r.roles,ids:r.ids});
   r.rows=rt.query(resourcesSql(name,base.owner,r));assertResources(r.rows,name,base.owner,r);r.roleState=rt.query(actorSql(base,r));assertRoles(r.roleState,name,r);assert.equal(r.roleState.auth,null);assert.deepEqual(r.roleState.profiles,[]);assert.deepEqual(r.roleState.assignments,[]);assert.deepEqual(rt.query(identitySql(base,r)),identityBefore);assert.deepEqual(rt.query(businessSql(name,base,r)),businessBefore);rt.prerequisitesGuard(base.prerequisites);rt.receipt(base,r);
  }else{
   const r=rt.read('resources-prepare-private.json');assert.equal(r.nonce,base.nonce);let actor=rt.query(actorSql(base,r));
   if(command==='actor-prepare'){
    stage='actor-preimage';assertRoles(actor,name,r);assertActorHistory(r.roleState,actor);assert.equal(actor.auth,null);assert.deepEqual(actor.profiles,[]);assert.deepEqual(actor.assignments,[]);assert.deepEqual(rt.query(resourcesSql(name,base.owner,r)),r.rows);assert.deepEqual(rt.query(identitySql(base,r)),r.identityBefore);assert.deepEqual(rt.query(businessSql(name,base,r)),r.businessBefore);rt.prerequisitesGuard(base.prerequisites);
    const password=process.env.ALGT_F06_BROWSER_PASSWORD;assert.ok(typeof password==='string'&&password.length>=24&&password.length<=128&&/[A-Z]/.test(password)&&/[a-z]/.test(password)&&/[0-9]/.test(password)&&/[^a-z0-9]/i.test(password),'MAIN_RANDOM_PASSWORD_REQUIRED');rt.exclusive('credentials-private.json',{nonce:base.nonce,authId:base.authId,email:mode.email,password,sourceSha256:base.sourceSha256});
    const admin=await rt.authAdmin(base);rt.append('auth-create-intent',{authId:base.authId,email:mode.email,marker:mode.marker,emailConfirm:true,sendsEmail:false});stage='auth-create';const created=await admin.createUser({id:base.authId,email:mode.email,password,email_confirm:true,app_metadata:{f06_marker:mode.marker},user_metadata:{full_name:mode.fullName,display_name:mode.fullName}});assert.equal(Boolean(created.error),false);assert.equal(created.data.user?.id,base.authId);assert.equal(created.data.user?.email,mode.email);rt.append('auth-created',{authId:base.authId});actor=rt.query(actorSql(base,r));assert.equal(actor.profiles.length,1);assert.deepEqual(actor.assignments,[]);assert.deepEqual(actor.sessions,[]);assert.deepEqual(actor.refreshIds,[]);
    const profileId=id(actor.profiles[0].id);rt.append('actor-assignment-intent',{profileId,authId:base.authId,roles:r.roles});stage='actor-assignment';const assignments=rt.sql(actorPrepareSql(name,base,r,profileId),true).split('\n').map(JSON.parse);assert.equal(assignments.length,Object.keys(mode.roles).length);rt.append('actor-assignments-created',{profileId,assignments});
    const prepared={profileId,assignments,state:rt.query(actorSql(base,r))};const initial=observeNumberedHR(rt,name,base,r,prepared);assertNumberedHRState(initial,name,base,r,prepared);rt.prerequisitesGuard(base.prerequisites);rt.receipt(base,{...prepared,initial});
   }else{
    const prepared=rt.read('actor-prepare-private.json');assert.equal(prepared.nonce,base.nonce);
    if(command==='observe-reviewed'||command==='observe-invalid'){
     stage=command;const state=observeNumberedHR(rt,name,base,r,prepared);assertNumberedHRState(state,name,base,r,prepared,{reviewed:name==='N07'});assert.ok(state.actor.sessions.length>0,'BROWSER_LOGIN_NOT_OBSERVED');
     if(command==='observe-reviewed'){assert.equal(name,'N07');assertAppendOnly(prepared.initial.observed,state.observed);assert.equal(state.sourceFingerprint,prepared.initial.sourceFingerprint);}
     else{const prior=name==='N07'?rt.read('observe-reviewed-private.json').snapshot:prepared.initial;assert.deepEqual(state.observed,prior.observed);assert.deepEqual(state.rows,prior.rows);assert.equal(state.sourceFingerprint,prior.sourceFingerprint);}
     rt.prerequisitesGuard(state.prerequisites);rt.receipt(base,{snapshot:state,assertion:command==='observe-reviewed'?'EXACT_EXISTING_EXTRACTION_REVIEW_ONLY':'NO_NEW_COMMITTED_EFFECTS_ONLY'});
    }else{
     const original=rt.capturedRequest('original'),reviewed=name==='N07'?rt.read('observe-reviewed-private.json').snapshot:null,request=assertRequest(original.request,name,base,r,reviewed?.sourceFingerprint??null);
     let state=observeNumberedHR(rt,name,base,r,prepared,request);const retiredActor=command==='resources-retire',identity=assertNumberedHRState(state,name,base,r,prepared,{request,retiredActor});
     if(command==='observe-committed-before-loss'){
      stage=command;assert.ok(state.actor.sessions.length>0);const prior=rt.read('observe-invalid-private.json').snapshot;assertAppendOnly({audits:prior.observed.audits,recruitmentReceipts:prior.observed.recruitmentReceipts,documentReceipts:prior.observed.documentReceipts,requests:prior.observed.requests},state.observed);if(name==='N07')assert.equal(state.sourceFingerprint,reviewed.sourceFingerprint);
      rt.append('committed-operation-observed',{identity,requestSha256:original.sha256});rt.prerequisitesGuard(state.prerequisites);rt.receipt(base,{snapshot:state,identity,request,requestSha256:original.sha256,assertion:'ONE_EXACT_COMMITTED_OPERATION_BEFORE_MAIN_LOSS_ONLY'});
     }else{
      const committed=rt.read('observe-committed-before-loss-private.json');assert.deepEqual(request,committed.request);assert.equal(original.sha256,committed.requestSha256);assert.deepEqual(identity,committed.identity);assertCommitContinuity(committed.snapshot,state,name);
      if(command==='observe-replayed'){
       stage=command;const retry=rt.capturedRequest('retry');assertRequest(retry.request,name,base,r,reviewed?.sourceFingerprint??null);assert.deepEqual(retry.request,request,'RETRY_MUST_RETAIN_EXACT_ORIGINAL_REQUEST');assert.ok(state.actor.sessions.length>0);rt.prerequisitesGuard(state.prerequisites);rt.receipt(base,{snapshot:state,identity,request,originalRequestSha256:original.sha256,retryRequestSha256:retry.sha256,assertion:'IDENTICAL_CAPTURE_AND_UNCHANGED_DATABASE_ONLY'});
      }else if(command==='actor-retire'){
       stage='actor-ban';rt.append('auth-ban-intent',{authId:base.authId,profileId:prepared.profileId,sessions:state.actor.sessions,refreshIds:state.actor.refreshIds});const admin=await rt.authAdmin(base),banned=await admin.updateUserById(base.authId,{ban_duration:'876000h'});assert.equal(Boolean(banned.error),false);assert.equal(banned.data.user?.id,base.authId);actor=rt.query(actorSql(base,r));assert.equal(actor.auth.banned,true);assertRoles(actor,name,r);stage='actor-retire';rt.append('actor-retire-intent',{authId:base.authId,profileId:prepared.profileId,assignments:prepared.assignments,roles:r.roles,sessions:actor.sessions,refreshIds:actor.refreshIds});const removed=JSON.parse(rt.sql(actorRetireSql(name,base,r,prepared,actor),true));assert.deepEqual([...removed.sessions].sort(),actor.sessions.map(s=>s.id).sort());assert.deepEqual([...removed.refreshIds].sort(),[...actor.refreshIds].sort());rt.append('actor-retired',removed);state=observeNumberedHR(rt,name,base,r,prepared,request);assertNumberedHRState(state,name,base,r,prepared,{request,retiredActor:true});assertCommitContinuity(committed.snapshot,state,name);rt.prerequisitesGuard(state.prerequisites);rt.receipt(base,{snapshot:state,identity,removed,assertion:'EXACT_ACTOR_RETIRED_HISTORY_UNCHANGED'});
      }else{
       stage='resources-retire';rt.append('resources-retire-intent',{identity,rows:state.rows,observed:state.observed,retainHistory:true,originalPrerequisitesUntouched:true});assert.equal(rt.sql(retireSql(name,base,r,prepared,state.observed,state.rows),true),'RETIRED_EXACT_NUMBERED_HR_RESOURCES');state=observeNumberedHR(rt,name,base,r,prepared,request);assertNumberedHRState(state,name,base,r,prepared,{request,retiredActor:true,retiredResources:true});assertCommitContinuity(committed.snapshot,state,name,{retired:true});rt.prerequisitesGuard(state.prerequisites);rt.receipt(base,{snapshot:state,identity,retired:true,historyRetained:true,prerequisitesRestored:false,assertion:'EXACT_OWNED_SOFT_RETIREMENT_ONLY'});
      }
     }
    }
   }
  }
  rt.providersOff();rt.success(base);process.stdout.write(JSON.stringify({name,marker:mode.marker,command,state:'PASS_NUMBERED_HR_FIXTURE_BOUNDARY_ONLY',browserPassClaim:false})+'\n');return true;
 }catch{rt?.failure(stage);process.stderr.write(JSON.stringify({name,command,state:'FAIL_RETAINED',stage,redacted:true,noAutomaticRetry:true})+'\n');return false;}finally{rt?.close();}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){if(process.argv.length!==4){process.stderr.write('EXACT_MODE_AND_COMMAND_REQUIRED\n');process.exitCode=1;}else if(!await runNumberedHRFixture(process.argv[2],process.argv[3]))process.exitCode=1;}
