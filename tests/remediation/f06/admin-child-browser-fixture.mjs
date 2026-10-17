// MAIN ONLY finite AC lifecycle. No browser, application action or consumer RPC.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {openACRuntime} from './admin-child-browser-runtime.mjs';
import {ac,commands,stages,id,json,roleCreateSql,absenceSql,resourceCreateSql,parentsCreateSql,resourcesSql,assertResources,
 actorSql,assertRoles,actorPrepareSql,assertActor,actorRetireSql,observationSql,assertObservation,identitySql,inventorySql,preservationSql,
 resourceRetireSql,preserveExcept,payloads,resourceSpecs,assertAppendOnlyHistory} from './admin-child-browser-contract.mjs';

function preserved(rt,base,resources,observation=null){
 assert.deepEqual(rt.query(inventorySql),resources.tables,'PUBLIC_TABLE_INVENTORY_CHANGED');
 assert.deepEqual(rt.query(identitySql(base,resources)),resources.identityBefore,'UNRELATED_IDENTITY_CHANGED');
 assert.deepEqual(rt.query(preservationSql(resources.tables,resources,observation)),resources.businessBefore,'UNRELATED_BUSINESS_CHANGED');rt.prerequisitesGuard();
}
function resourcesNow(rt,resources,retired=false){const rows=rt.query(resourcesSql(resources));assertResources(rows,resources,retired);if(!retired)assert.deepEqual(rows,resources.rows,'SYNTHETIC_PARENT_CHANGED');return rows;}
function guardRowsSql(resources,rows){return `do $g$ begin perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));perform pg_advisory_xact_lock(hashtextextended('f06-party-relations',0));perform pg_advisory_xact_lock(hashtextextended('f06-party-admin-masters-relations',0));perform pg_advisory_xact_lock(hashtextextended('f06-finance-relationships',0));${Object.entries(resourceSpecs).map(([key,[table]])=>`perform 1 from public.${table} where id=${id(resources.ids[key])} for update;if (select to_jsonb(r) from public.${table} r where id=${resources.ids[key]}) is distinct from ${json(rows[key])} then raise exception 'RESOURCE_PREIMAGE_CHANGED';end if;`).join('\n')}end $g$;`;}

export async function runACFixture(command){let rt,stage='preflight';try{
 assert.ok(commands.includes(command),'UNKNOWN_AC_COMMAND');rt=openACRuntime({readOnly:command.startsWith('observe-')});
 const base=command==='resources-prepare'?rt.freshReservation():rt.stored().base;
 const which=command.startsWith('reader')||command==='observe-reader'?'reader':'editor';
 rt.noOtherActor(command==='resources-prepare'||command.endsWith('-prepare')||command==='resources-retire'?null:base.actors[which].authId);
 if(command==='resources-prepare')assert.equal(rt.sql(absenceSql(base)),'0','RESERVED_IDENTITIES_OR_AA_OCCUPIED');
 rt.start(command,base);
 if(command==='resources-prepare'){
  const tables=rt.query(inventorySql),identityBefore=rt.query(identitySql(base)),businessBefore=rt.query(preservationSql(tables));
  stage='create-owned-resources';rt.append('resources-create-intent',{specs:resourceSpecs,roles:ac.roles,prerequisites:base.prerequisites,identityBefore,businessBefore,tables,noExistingDefinitionMutation:true,noFallbackCountry:true});
  const roles=Object.values(ac.roles).map(mode=>roleCreateSql(mode,base.canonicalPermissions.filter(p=>mode.permissions.includes(p.code))));
  // All setup objects and three roles commit together, before either actor exists.
  const lines=rt.sql([rt.setupGuardSql(),...roles,resourceCreateSql(base.prerequisites),parentsCreateSql()].join('\n'),true).split('\n');assert.equal(lines.length,6);
  const resources={nonce:base.nonce,roles:Object.fromEntries(Object.keys(ac.roles).map((k,i)=>[k,JSON.parse(lines[i])])),ids:{...JSON.parse(lines[3]),...JSON.parse(lines[4]),...JSON.parse(lines[5])},tables,identityBefore,businessBefore};
  for(const value of Object.values(resources.ids))id(value);rt.append('resources-created',{roles:resources.roles,ids:resources.ids});
  const rows=rt.query(resourcesSql(resources));assertResources(rows,resources);const state=rt.query(actorSql(base,resources,'editor'));assertRoles(state,resources);assert.equal(state.auth,null);assert.deepEqual(state.profiles,[]);assert.deepEqual(state.assignments,[]);preserved(rt,base,resources);
  rt.receipt(base,{...resources,rows,state,expectedFields:payloads(base,resources)});
 }else{
  const resources=rt.read('resources-prepare-private.json');assert.equal(resources.nonce,base.nonce);const rows=resourcesNow(rt,resources);
  if(command==='editor-prepare'||command==='reader-prepare'){
   const isReader=which==='reader';if(isReader){const editor=rt.read('editor-prepare-private.json');const old=rt.query(actorSql(base,resources,'editor'));assertRoles(old,resources,false,true);assertActor(old,base,resources,'editor',editor,true);assert.deepEqual(old,rt.read('editor-retire-private.json').state);}
   const state=rt.query(actorSql(base,resources,which));assertRoles(state,resources,!isReader,true);assert.equal(state.auth,null);assert.deepEqual(state.profiles,[]);assert.deepEqual(state.assignments,[]);assert.deepEqual(state.sessions,[]);assert.deepEqual(state.refreshIds,[]);
   const observation=isReader?rt.read('observe-profit-created-private.json').observation:null;preserved(rt,base,resources,observation);
   const strictIdentity=rt.query(identitySql({...base,actors:{[which]:base.actors[which]}}));rt.append('strict-actor-baseline',{which,strictIdentity});
   const password=process.env.ALGT_F06_BROWSER_PASSWORD;assert.ok(typeof password==='string'&&password.length>=24&&password.length<=128&&/[A-Z]/.test(password)&&/[a-z]/.test(password)&&/[0-9]/.test(password)&&/[^a-z0-9]/i.test(password),'MAIN_RANDOM_PASSWORD_REQUIRED');
   const actor=ac.actors[which],authId=base.actors[which].authId;rt.exclusive(which+'-credentials-private.json',{nonce:base.nonce,email:actor.email,password,authId,sourceSha256:base.sourceSha256});
   stage=which+'-auth-create';const admin=await rt.authAdmin(base,which);rt.append('auth-create-intent',{which,authId,email:actor.email,marker:actor.marker,emailConfirm:true,sendsEmail:false});
   const created=await admin.createUser({id:authId,email:actor.email,password,email_confirm:true,app_metadata:{f06_marker:actor.marker},user_metadata:{full_name:actor.fullName,display_name:actor.fullName}});assert.equal(Boolean(created.error),false);assert.equal(created.data.user?.id,authId);assert.equal(created.data.user?.email,actor.email);rt.append('auth-created',{which,authId});
   const after=rt.query(actorSql(base,resources,which));assert.equal(after.profiles.length,1);assert.deepEqual(after.assignments,[]);const profileId=id(after.profiles[0].id);
   stage=which+'-profile-assignment';rt.append('actor-prepare-intent',{which,authId,profileId,roles:resources.roles,scope:which==='editor'?{global:ac.roles.editor.permissions,branch:{company:base.owner.companyId,branch:base.owner.branchId,permissions:ac.roles.branch.permissions}}:{global:ac.roles.reader.permissions}});
   const assignments=rt.sql(actorPrepareSql(base,resources,which,profileId),true).split('\n').map(line=>JSON.parse(line));const prepared={profileId,assignments,strictIdentity};rt.append('actor-prepared',{which,...prepared});
   const ready=rt.query(actorSql(base,resources,which));assertActor(ready,base,resources,which,prepared);assertRoles(ready,resources,!isReader,true);assert.deepEqual(ready.sessions,[]);assert.deepEqual(ready.refreshIds,[]);assert.deepEqual(rt.query(identitySql({...base,actors:{[which]:base.actors[which]}})),strictIdentity);
   let initial=null;if(!isReader){initial=rt.query(observationSql(base,resources,prepared));assertObservation(initial,base,resources,prepared,'initial');}preserved(rt,base,resources,observation);
   rt.receipt(base,{...prepared,state:ready,initial,expectedFields:payloads(base,resources)});
  }else{
   const editor=rt.read('editor-prepare-private.json'),prepared=which==='reader'?rt.read('reader-prepare-private.json'):editor;
   const finalStage=stages.at(-1),observerStage=command.startsWith('observe-')&&command!=='observe-reader'?command.slice(8):finalStage;
   const observation=rt.query(observationSql(base,resources,editor));assertObservation(observation,base,resources,editor,observerStage);preserved(rt,base,resources,observation);
   let state=rt.query(actorSql(base,resources,which));const editorRetired=which==='reader'||command==='resources-retire';assertRoles(state,resources,!editorRetired,command!=='resources-retire');
   assertActor(state,base,resources,which,prepared,command==='resources-retire');
   // Within one active actor lifetime all other authority/session identities are exact.
   if(command!=='resources-retire')assert.deepEqual(rt.query(identitySql({...base,actors:{[which]:base.actors[which]}})),prepared.strictIdentity,'STRICT_ACTOR_BASELINE_CHANGED');
   if(command.startsWith('observe-')){
    stage=command;assert.ok(state.sessions.length>0,'BROWSER_LOGIN_NOT_OBSERVED');
    if(command==='observe-reader'){const prior=rt.read('observe-profit-created-private.json').observation;assertAppendOnlyHistory(prior,observation);assert.deepEqual(observation,prior,'READER_MUTATED_HISTORY');}
    else{const index=stages.indexOf(observerStage),prior=index===0?editor.initial:rt.read('observe-'+stages[index-1]+'-private.json').observation;
     assertAppendOnlyHistory(prior,observation);
     if(observerStage.endsWith('-invalid')||observerStage.endsWith('-replayed')||observerStage==='finance-read-recovered')assert.deepEqual(observation,prior,'READ_INVALID_OR_REPLAY_CHANGED_HISTORY');
     if(observerStage.endsWith('-noop')){assert.deepEqual(observation.rows,prior.rows,'NOOP_CHANGED_TARGET');assert.deepEqual(observation.audits,prior.audits,'NOOP_ADDED_AUDIT');for(const old of prior.receipts)assert.deepEqual(observation.receipts.find(x=>x.operation_id===old.operation_id),old);}
    }
    rt.receipt(base,{stage:observerStage,observation,state,claims:'Exact database outcome only; browser interactions/validation/retry require separate main evidence'});
   }else if(command==='editor-retire'||command==='reader-retire'){
    assert.deepEqual(observation,rt.read('observe-profit-created-private.json').observation);stage=which+'-ban';const admin=await rt.authAdmin(base,which);rt.append('auth-ban-intent',{which,authId:base.actors[which].authId,sessions:state.sessions,refreshIds:state.refreshIds});
    const banned=await admin.updateUserById(base.actors[which].authId,{ban_duration:'876000h'});assert.equal(Boolean(banned.error),false);assert.equal(banned.data.user?.id,base.actors[which].authId);state=rt.query(actorSql(base,resources,which));assert.equal(state.auth.banned,true);
    stage=which+'-retirement';rt.append('actor-retire-intent',{which,authId:base.actors[which].authId,profileId:prepared.profileId,assignments:prepared.assignments,sessions:state.sessions,refreshIds:state.refreshIds});
    const removed=JSON.parse(rt.sql(actorRetireSql(base,resources,which,prepared,state),true));assert.deepEqual([...removed.sessions].sort(),state.sessions.map(s=>s.id).sort());assert.deepEqual([...removed.refreshIds].sort(),[...state.refreshIds].sort());rt.append('actor-retired',{which,removed});
    const after=rt.query(actorSql(base,resources,which));assertActor(after,base,resources,which,prepared,true);assertRoles(after,resources,false,which==='editor');assert.deepEqual(rt.query(observationSql(base,resources,editor)),observation);preserved(rt,base,resources,observation);rt.receipt(base,{state:after,removed,observation});
   }else{
    assert.equal(command,'resources-retire');const reader=rt.read('reader-prepare-private.json');const readerState=rt.query(actorSql(base,resources,'reader'));assertActor(readerState,base,resources,'reader',reader,true);assertRoles(readerState,resources,false,false);
    assert.deepEqual(observation,rt.read('observe-profit-created-private.json').observation);stage='exact-resource-retirement';rt.append('resources-retire-intent',{ids:resources.ids,rows,observation,roles:resources.roles,retainedHistory:true});
    assert.equal(rt.sql(guardRowsSql(resources,rows)+'\n'+resourceRetireSql(resources,observation),true),'RETIRED_EXACT_AC_RESOURCES');
    const afterRows=resourcesNow(rt,resources,true),after=rt.query(observationSql(base,resources,editor));assertObservation(after,base,resources,editor,finalStage,{retired:true});
    for(const key of Object.keys(resourceSpecs))preserveExcept(rows[key],afterRows[key],['is_active','updated_at','workspace_revision',...(['country','party','costType','profitType','costParent','profitParent'].includes(key)?['deactivated_at','deactivation_reason']:[])]);
    for(const key of ['finance','service','signatory'])assert.deepEqual(after.rows[key],observation.rows[key]);for(const key of ['cost','profit'])preserveExcept(observation.rows[key][0],after.rows[key][0],['is_active','deactivated_at','deactivation_reason','updated_at','workspace_revision']);assert.deepEqual(after.audits,observation.audits);assert.deepEqual(after.receipts,observation.receipts);preserved(rt,base,resources,after);
    rt.receipt(base,{rows:afterRows,observation:after,editorState:state,readerState,retainedHistory:true});
   }
  }
 }
 rt.success(base);process.stdout.write(JSON.stringify({marker:ac.marker,command,state:'PASS_AC_FIXTURE_BOUNDARY_ONLY',browserPassClaim:false})+'\n');return true;
 }catch{rt?.failure(stage);process.stderr.write(JSON.stringify({marker:ac.marker,command,state:'FAIL_RETAINED',stage,redacted:true,noAutomaticRetry:true})+'\n');return false;}finally{rt?.close();}}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){if(process.argv.length!==3){process.stderr.write('ONE_EXPLICIT_AC_COMMAND_REQUIRED\n');process.exitCode=1;}else if(!await runACFixture(process.argv[2]))process.exitCode=1;}
