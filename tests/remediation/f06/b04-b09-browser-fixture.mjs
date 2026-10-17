// MAIN ONLY. Own actor/roles only; provider create/archive remain main prerequisites.
// Never invokes an app action, health RPC, email adapter, browser or Storage API.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {openBoundaryRuntime} from './b04-b09-browser-runtime.mjs';
import {boundary,commands,id,json,quote,roleCreateSql,absenceSql,actorSql,assertRoles,assertActor,actorPrepareSql,retireSql,
 assertProvider,appendOnly,sameExcept,identitySql,inventorySql,preservationSql,assertArchiveProof} from './b04-b09-browser-contract.mjs';

function preserved(rt,base,r,snapshot){assert.deepEqual(rt.query(inventorySql),r.tables);assert.deepEqual(rt.query(identitySql(base,r)),r.identityBefore,'UNRELATED_IDENTITY_CHANGED');assert.deepEqual(rt.query(preservationSql(r.tables,base,snapshot)),r.businessBefore,'UNRELATED_BUSINESS_CHANGED');rt.prerequisitesGuard();}
const stateGuard=(base,r,state)=>`lock table public.user_profiles,public.user_roles,public.roles,public.role_permissions in share row exclusive mode;do $g$ begin if (${actorSql(base,r).replace(/;$/,'')}) is distinct from ${json(state)} then raise exception 'EXACT_ACTOR_CHANGED';end if;end $g$;`;
const liveHealth=(rt,p)=>({...rt.read('health-intent-private.json').health,profileId:p.profileId,observedAt:new Date().toISOString()});

export async function runBoundaryFixture(command){let rt,stage='preflight';try{
 assert.ok(commands.includes(command),'UNKNOWN_BOUNDARY_COMMAND');rt=openBoundaryRuntime({readOnly:command.startsWith('observe-')||command==='health-intent'});
 const base=command==='resources-prepare'?rt.freshReservation():rt.stored().base;rt.noOtherActor(['resources-prepare','actor-prepare','resources-retire'].includes(command)?null:base.authId);
 if(command==='resources-prepare'){assert.equal(rt.sql(absenceSql(base)),'0','EXACT_IDENTITY_OCCUPIED');assert.deepEqual(rt.provider(base),base.provider);}
 rt.start(command,base);
 if(command==='resources-prepare'){
  const tables=rt.query(inventorySql),identityBefore=rt.query(identitySql(base)),businessBefore=rt.query(preservationSql(tables,base,base.provider));
  stage='owned-role-creation';rt.append('role-create-intent',{roles:boundary.roles,tables,identityBefore,businessBefore,providerId:base.providerId,providerPreimage:base.provider,noProviderMutation:true});
  const results=rt.sql(Object.values(boundary.roles).map(mode=>roleCreateSql(mode,base.canonicalPermissions.filter(p=>mode.permissions.includes(p.code)))).join('\n'),true).split('\n').map(s=>JSON.parse(s));assert.equal(results.length,2);
  const r={roles:{reader:results[0],tester:results[1]},tables,identityBefore,businessBefore};rt.append('roles-created',{roles:r.roles});const state=rt.query(actorSql(base,r));assertRoles(state,r);assert.equal(state.auth,null);for(const k of ['profiles','assignments','sessions','refreshIds'])assert.deepEqual(state[k],[]);preserved(rt,base,r,base.provider);rt.receipt(base,{...r,state});
 }else{
  const r=rt.read('resources-prepare-private.json');let state=rt.query(actorSql(base,r));let snapshot=rt.provider(base);
  if(command==='actor-prepare'){
   assertRoles(state,r);assert.equal(state.auth,null);for(const k of ['profiles','assignments','sessions','refreshIds'])assert.deepEqual(state[k],[]);assert.deepEqual(snapshot,base.provider);preserved(rt,base,r,snapshot);
   const password=process.env.ALGT_F06_BROWSER_PASSWORD;assert.ok(typeof password==='string'&&password.length>=24&&password.length<=128&&/[A-Z]/.test(password)&&/[a-z]/.test(password)&&/[0-9]/.test(password)&&/[^a-z0-9]/i.test(password),'MAIN_RANDOM_PASSWORD_REQUIRED');
   rt.exclusive('credentials-private.json',{nonce:base.nonce,sourceSha256:base.sourceSha256,email:boundary.email,password,authId:base.authId});stage='auth-create';const admin=await rt.authAdmin(base);rt.append('auth-create-intent',{authId:base.authId,email:boundary.email,marker:boundary.marker,emailConfirm:true,sendsEmail:false});
   const created=await admin.createUser({id:base.authId,email:boundary.email,password,email_confirm:true,app_metadata:{f06_marker:boundary.marker},user_metadata:{full_name:boundary.fullName,display_name:boundary.fullName}});assert.equal(Boolean(created.error),false);assert.equal(created.data.user?.id,base.authId);assert.equal(created.data.user?.email,boundary.email);rt.append('auth-created',{authId:base.authId});
   state=rt.query(actorSql(base,r));assert.equal(state.profiles.length,1);assert.deepEqual(state.assignments,[]);const profileId=id(state.profiles[0].id);stage='reader-assignment';rt.append('reader-assignment-intent',{profileId,authId:base.authId,roleId:r.roles.reader.roleId,permissions:boundary.roles.reader.permissions,company:null,branch:null});
   const assignmentId=id(Number(rt.sql(actorPrepareSql(base,r,profileId),true)));const prepared={profileId,assignmentId};rt.append('reader-assignment-created',prepared);state=rt.query(actorSql(base,r));assertRoles(state,r);assertActor(state,base,r,prepared);assert.deepEqual(state.sessions,[]);assert.deepEqual(state.refreshIds,[]);preserved(rt,base,r,snapshot);rt.receipt(base,{...prepared,state,snapshot});
  }else{
   const p=rt.read('actor-prepare-private.json'),hasTester=commands.indexOf(command)>commands.indexOf('health-authorize'),tester=hasTester?{assignmentId:rt.read('health-authorize-private.json').assignmentId,active:commands.indexOf(command)<=commands.indexOf('health-retire')}:null;
   const retired=command==='resources-retire';assertRoles(state,r,{tested:!!tester&&!tester.active,retired});assertActor(state,base,r,p,{tester,retired});if(!retired&&command!=='actor-retire')assert.ok(state.sessions.length>0,'BROWSER_SESSION_REQUIRED');
   if(commands.indexOf(command)<=commands.indexOf('health-intent')){assert.deepEqual(snapshot,base.provider,'READ_PHASE_MUTATED_PROVIDER');preserved(rt,base,r,snapshot);}
   if(['observe-flags','observe-history-failed','observe-history-recovered'].includes(command)){
    rt.receipt(base,{state,snapshot,claim:'Database preservation only; visible flags/history unavailable and retry require separate main browser evidence'});
   }else if(command==='health-authorize'){
    stage='test-assignment';rt.append('health-authority-intent',{profileId:p.profileId,roleId:r.roles.tester.roleId,permission:'settings.email.test',company:null,branch:null});
    const assignmentId=id(Number(rt.sql(stateGuard(base,r,state)+`\ninsert into public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active) values(${p.profileId},${r.roles.tester.roleId},null,null,true) returning id;`,true)));rt.append('health-authority-created',{assignmentId});state=rt.query(actorSql(base,r));assertRoles(state,r);assertActor(state,base,r,p,{tester:{assignmentId,active:true}});preserved(rt,base,r,snapshot);rt.receipt(base,{assignmentId,state,snapshot});
   }else if(command==='health-intent'){
    // This is the sole pre-click intent. No health invocation is made here.
    const health={profileId:p.profileId,intentAt:new Date().toISOString()};rt.append('one-health-click-intent',{providerId:base.providerId,revision:1,providerType:'local_dev',isEnabled:false,health,allowedAction:'Test connection',forbiddenActions:['Send test email','Enable','Update secret'],automaticRetry:false});rt.receipt(base,{health,state,snapshot});
   }else if(command==='observe-health-failed'){
    const health=liveHealth(rt,p);assertProvider(snapshot,base,base.owner,'failed',health);appendOnly(base.provider,snapshot);sameExcept(base.provider.row,snapshot.row,['last_test_status','last_test_at','last_test_message','updated_by','updated_at','workspace_revision']);preserved(rt,base,r,snapshot);rt.receipt(base,{health,state,snapshot,claim:'One actual failed health receipt only, not provider connectivity, delivery or browser presentation'});
   }else if(command==='health-retire'){
    const observed=rt.read('observe-health-failed-private.json');assert.deepEqual(snapshot,observed.snapshot);assertProvider(snapshot,base,base.owner,'failed',observed.health);preserved(rt,base,r,snapshot);stage='test-authority-retirement';rt.append('health-authority-retire-intent',{assignmentId:tester.assignmentId,roleId:r.roles.tester.roleId,profileId:p.profileId});
    rt.sql(stateGuard(base,r,state)+`\nupdate public.user_roles set is_active=false where id=${id(tester.assignmentId)} and user_profile_id=${p.profileId} and role_id=${r.roles.tester.roleId};update public.roles set is_active=false where id=${r.roles.tester.roleId} and notes=${quote(boundary.roles.tester.marker)};`,true);
    state=rt.query(actorSql(base,r));assertRoles(state,r,{tested:true});assertActor(state,base,r,p,{tester:{...tester,active:false}});preserved(rt,base,r,snapshot);rt.receipt(base,{state,snapshot});
   }else if(command==='actor-retire'){
    assert.deepEqual(snapshot,rt.read('observe-health-failed-private.json').snapshot);preserved(rt,base,r,snapshot);stage='auth-ban';const admin=await rt.authAdmin(base);rt.append('auth-ban-intent',{authId:base.authId,sessions:state.sessions,refreshIds:state.refreshIds});
    const banned=await admin.updateUserById(base.authId,{ban_duration:'876000h'});assert.equal(Boolean(banned.error),false);assert.equal(banned.data.user?.id,base.authId);state=rt.query(actorSql(base,r));assert.equal(state.auth.banned,true);assertActor({...state,auth:{...state.auth,banned:false}},base,r,p,{tester});
    stage='exact-actor-retirement';rt.append('actor-retire-intent',{authId:base.authId,profileId:p.profileId,assignmentIds:[p.assignmentId,tester.assignmentId],sessions:state.sessions,refreshIds:state.refreshIds});
    const removed=JSON.parse(rt.sql(stateGuard(base,r,state)+'\n'+retireSql(base,r,p,tester,state),true));assert.deepEqual([...removed.sessions].sort(),state.sessions.map(s=>s.id).sort());assert.deepEqual([...removed.refreshIds].sort(),[...state.refreshIds].sort());rt.append('actor-retired',{removed});
    state=rt.query(actorSql(base,r));assertRoles(state,r,{retired:true});assertActor(state,base,r,p,{tester,retired:true});preserved(rt,base,r,snapshot);assert.deepEqual(rt.provider(base),snapshot);rt.receipt(base,{state,snapshot,removed});
   }else{
    assert.equal(command,'resources-retire');assert.deepEqual(state,rt.read('actor-retire-private.json').state);const health=rt.read('observe-health-failed-private.json'),proof=rt.archiveProof();assertArchiveProof(proof.value,base);assertProvider(snapshot,base,base.owner,'archived',health.health,proof.value);appendOnly(health.snapshot,snapshot);sameExcept(health.snapshot.row,snapshot.row,['is_active','deleted_at','updated_by','updated_at','workspace_revision']);preserved(rt,base,r,snapshot);rt.noOtherActor();
    rt.receipt(base,{state,snapshot,archiveProof:proof.value,archiveProofSha256:proof.sha256,retainedHistory:true,noProviderMutationByHelper:true});
   }
  }
 }
 rt.success(base);process.stdout.write(JSON.stringify({marker:boundary.marker,command,state:'PASS_BOUNDARY_FIXTURE_ONLY',browserPassClaim:false,providerSuccessClaim:false})+'\n');return true;
 }catch{rt?.failure(stage);process.stderr.write(JSON.stringify({marker:boundary.marker,command,state:'FAIL_RETAINED',stage,redacted:true,noAutomaticRetry:true})+'\n');return false;}finally{rt?.close();}}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){if(process.argv.length!==3){process.stderr.write('ONE_EXPLICIT_COMMAND_REQUIRED\n');process.exitCode=1;}else if(!await runBoundaryFixture(process.argv[2]))process.exitCode=1;}
