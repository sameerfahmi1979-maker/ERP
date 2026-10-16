// MAIN ONLY. Closed sequential B03/B05 windows; no browser action or test import.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {openCbRuntime} from './cb-browser-runtime.mjs';
import {projectionSql} from './scoped-browser-contract.mjs';
import {cb,modes,commands,id,permissionsSql,assertPermissions,denyPermissionSql,assertDenyPermission,absenceSql,identitySql,assertPreserved,
  registrySchemaSql,assertRegistrySchema,borrowedResources,resourceCreateSql,roleCreateSql,stateSql,assertRole,assertActor,assertActorRetirement,actorPrepareSql,actorRetireSql,
  snapshotSql,assertResourceCreation,assertTransition,resourceRetireSql,assertRetiredResources} from './cb-browser-contract.mjs';
const reservation=(base,resources,mode)=>({...base,mode,authId:base.actors[mode].authId,...resources.roles[mode]});
export async function runCbFixture(command){
  let rt,stage='preflight';
  try{
    assert.ok(commands.includes(command));rt=openCbRuntime({readOnly:command.startsWith('observe-')});
    const base=command==='resources-prepare'?rt.freshReservation():rt.validateStored().base;
    const branch=commands.indexOf(command)>=commands.indexOf('branch-prepare'),mode=branch?'branch':'company';
    rt.noOtherActor(['resources-prepare','branch-prepare','resources-retire'].includes(command)?null:base.actors[mode].authId);rt.start(command,base);
    const permissions=assertPermissions(rt.query(permissionsSql(modes.company))),denyPermission=rt.query(denyPermissionSql());assertDenyPermission(denyPermission);
    if(command==='resources-prepare'){
      stage='resource-preflight';assert.equal(rt.sql(absenceSql(base)),'0','EXACT_FRESH_IDENTITIES_REQUIRED');
      const schema=rt.query(registrySchemaSql());assertRegistrySchema(schema);
      const before=rt.query(snapshotSql(base)),borrowed=borrowedResources(rt.ledger,base,before),identityBefore=rt.query(identitySql(base));
      rt.append('resources-create-intent',{permissions,denyPermission,schema,borrowed,before,identityBefore,foreignCalendarCode:cb.calendarCode,registryCode:cb.registryCode,profileCode:cb.profileCode,profileCreatedOnlyViaUi:true,noPermissionDefinitionWrites:true,noDispatch:true});
      stage='create-fixed-resources';
      const lines=rt.sql(roleCreateSql(modes.company,permissions)+'\n'+roleCreateSql(modes.branch,permissions.filter(p=>modes.branch.permissions.includes(p.code)))+'\n'+resourceCreateSql(base),true).split('\n');assert.equal(lines.length,3);
      const roles={company:JSON.parse(lines[0]),branch:JSON.parse(lines[1])},resources={roles,...JSON.parse(lines[2]),borrowed,permissions,denyPermission,schema};
      for(const m of Object.keys(modes)){id(roles[m].roleId);const state=rt.query(stateSql(reservation(base,resources,m)));assertRole(state,reservation(base,resources,m));assert.equal(state.auth,null);assert.deepEqual(state.profiles,[]);assert.deepEqual(state.assignments,[]);roles[m].initialState=state;}
      rt.append('resources-created',{roles,foreignCalendarId:resources.foreignCalendarId,registryId:resources.registryId});
      const observed=rt.query(snapshotSql(base));assertResourceCreation(before,observed,base,resources);assertPreserved(identityBefore,rt.query(identitySql(base,resources)));
      rt.receipt(command+'-private.json',{...base,...resources,before,observed,identityBefore,browserPassClaim:false});
    }else{
      const resources=rt.read('resources-prepare-private.json');assert.equal(resources.nonce,base.nonce);assert.deepEqual(permissions,resources.permissions);assert.deepEqual(denyPermission,resources.denyPermission);assert.deepEqual(rt.query(registrySchemaSql()),resources.schema);
      assertPreserved(resources.identityBefore,rt.query(identitySql(base,resources)),true);
      const r=reservation(base,resources,mode),previous=rt.read(commands[commands.indexOf(command)-1]+'-private.json');
      let state=rt.query(stateSql(r));
      if(command.endsWith('-prepare')){
        stage=mode+'-actor-preimage';assertRole(state,r);assert.deepEqual(state,resources.roles[mode].initialState);
        if(mode==='branch'){
          const check=rt.read('company-check-private.json');assert.equal(check.nonce,base.nonce);assert.equal(check.sourceSha256,base.sourceSha256);assert.equal(check.state,'PASS_EXACT_CB_COMPANY_RESOURCES_ONLY');
          assert.equal(check.retirementSha256,rt.hashFile('company-retire-private.json'));rt.append('company-independent-check-bound',{sha256:rt.hashFile('company-check-private.json')});
          const company=rt.read('company-prepare-private.json'),retired=rt.read('company-retire-private.json'),companyState=rt.query(stateSql(reservation(base,resources,'company')));
          assertActor(companyState,reservation(base,resources,'company'),company,true);assertRole(companyState,reservation(base,resources,'company'),false);assert.deepEqual(companyState,retired.state,'COMPANY_WINDOW_CHANGED');
        }
        const observed=rt.query(snapshotSql(base));assert.deepEqual(observed,previous.observed,'BUSINESS_CHANGED_BETWEEN_WINDOWS');
        const identityBaseline=rt.query(projectionSql(r.authId,r.roleId));rt.append('strict-actor-baseline',{mode,identityBaseline});
        const password=process.env.ALGT_F06_BROWSER_PASSWORD;assert.ok(typeof password==='string'&&password.length>=24&&password.length<=128&&/[A-Z]/.test(password)&&/[a-z]/.test(password)&&/[0-9]/.test(password)&&/[^a-z0-9]/i.test(password),'MAIN_FRESH_PASSWORD_REQUIRED');
        rt.exclusive(mode+'-credentials-private.json',{nonce:base.nonce,email:modes[mode].email,password,authId:r.authId,sourceSha256:base.sourceSha256});
        const admin=await rt.authAdmin(base,mode);stage=mode+'-auth-create';rt.append('auth-create-intent',{mode,authId:r.authId,email:modes[mode].email,marker:modes[mode].marker,emailConfirm:true,sendsEmail:false});
        const created=await admin.createUser({id:r.authId,email:modes[mode].email,password,email_confirm:true,app_metadata:{f06_marker:modes[mode].marker},user_metadata:{full_name:modes[mode].fullName,display_name:modes[mode].fullName}});
        assert.equal(Boolean(created.error),false);assert.equal(created.data.user?.id,r.authId);assert.equal(created.data.user?.email,modes[mode].email);rt.append('auth-created',{mode,authId:r.authId});
        state=rt.query(stateSql(r));assert.equal(state.profiles.length,1);assert.deepEqual(state.assignments,[]);assert.deepEqual(state.sessions,[]);assert.deepEqual(state.refreshIds,[]);
        const profileId=id(state.profiles[0].id);stage=mode+'-assignment';rt.append('actor-assignment-intent',{mode,authId:r.authId,profileId,roleId:r.roleId,companyId:base.owner.companyId,branchId:mode==='branch'?base.owner.branchId:null});
        const prepared=JSON.parse(rt.sql(actorPrepareSql(r,profileId),true));rt.append('actor-assignment-created',{mode,...prepared});state=rt.query(stateSql(r));assertRole(state,r);assertActor(state,r,prepared);
        assertPreserved(identityBaseline,rt.query(projectionSql(r.authId,r.roleId)));assert.deepEqual(rt.query(snapshotSql(base)),observed);
        if(mode==='company'){
          rt.append('calendar-noop-intent',{id:resources.borrowed.calendar.id,revision:resources.borrowed.calendar.workspace_revision,actor:r.authId,unchangedFullRow:resources.borrowed.calendar});
          rt.append('ui-profile-create-intent',{profileCode:cb.profileCode,profileName:cb.profileName,companyId:base.owner.companyId,actor:r.authId,profileId,assetFree:true,nonDefault:true});
        }
        rt.receipt(command+'-private.json',{...base,...prepared,mode,roleId:r.roleId,state,observed,identityBaseline,browserPassClaim:false});
      }else if(command.startsWith('observe-')){
        stage=command;const prepared=rt.read(mode+'-prepare-private.json');assertRole(state,r);assertActor(state,r,prepared);assert.ok(state.sessions.length>0,'BROWSER_LOGIN_NOT_OBSERVED');
        assertPreserved(prepared.identityBaseline,rt.query(projectionSql(r.authId,r.roleId)),true);
        const observed=rt.query(snapshotSql(base)),earlier=commands.slice(0,commands.indexOf(command)).map(c=>rt.read(c+'-private.json').observed);
        const profileId=assertTransition(command,previous.observed,observed,base,resources,prepared,earlier);
        if(command==='observe-profile-created')rt.append('ui-profile-winner-intent',{id:profileId,expectedRevision:1,profileName:cb.winnerName,actor:r.authId,retainedStaleDraft:cb.staleDraft});
        if(command==='observe-company-readonly'){
          const p=observed.profiles.find(p=>p.profile_code===cb.profileCode);rt.append('ui-profile-retire-intent',{id:p.id,expectedRevision:p.workspace_revision,is_active:false,actor:r.authId});
        }
        rt.receipt(command+'-private.json',{...base,mode,state,observed,browserPassClaim:false,assertion:'EXACT_BUSINESS_EFFECTS_ONLY',visibleUiVerified:false,readFailureInjected:false});
      }else if(command==='company-retire'||command==='branch-retire'){
        const prepared=rt.read(mode+'-prepare-private.json');assertRole(state,r);assertActor(state,r,prepared);assertPreserved(prepared.identityBaseline,rt.query(projectionSql(r.authId,r.roleId)),true);
        const observed=rt.query(snapshotSql(base));assert.deepEqual(observed,previous.observed);stage=mode+'-ban';const admin=await rt.authAdmin(base,mode);
        rt.append('auth-ban-intent',{mode,authId:r.authId,banDuration:'876000h',sessions:state.sessions,refreshIds:state.refreshIds});
        const banned=await admin.updateUserById(r.authId,{ban_duration:'876000h'});assert.equal(Boolean(banned.error),false);assert.equal(banned.data.user?.id,r.authId);
        state=rt.query(stateSql(r));assert.equal(state.auth.banned,true);stage=mode+'-exact-retirement';
        const retirementBefore=state,sessionIds=state.sessions.map(s=>s.id).sort(),refreshIds=[...state.refreshIds].sort();
        rt.append('actor-retire-intent',{mode,authId:r.authId,profileId:prepared.profileId,assignmentId:prepared.assignmentId,roleId:r.roleId,sessionIds,refreshIds,state});
        const removed=JSON.parse(rt.sql(actorRetireSql(r,prepared,state),true));assert.deepEqual([...removed.sessionIds].sort(),sessionIds);assert.deepEqual([...removed.refreshIds].sort(),refreshIds);rt.append('actor-retired',{mode,...removed});
        state=rt.query(stateSql(r));assertRole(state,r,false);assertActor(state,r,prepared,true);assertActorRetirement(retirementBefore,state);assert.deepEqual(rt.query(snapshotSql(base)),observed);assertPreserved(prepared.identityBaseline,rt.query(projectionSql(r.authId,r.roleId)),true);
        rt.receipt(command+'-private.json',{...base,mode,state,removed,observed,browserPassClaim:false});rt.noOtherActor();
      }else{
        stage='resources-retirement';assert.equal(command,'resources-retire');
        for(const m of Object.keys(modes)){const prep=rt.read(m+'-prepare-private.json'),ret=rt.read(m+'-retire-private.json'),current=rt.query(stateSql(reservation(base,resources,m)));assertActor(current,reservation(base,resources,m),prep,true);assertRole(current,reservation(base,resources,m),false);assert.deepEqual(current,ret.state);}
        const before=rt.query(snapshotSql(base));assert.deepEqual(before,previous.observed);rt.append('resources-retire-intent',{foreignCalendarId:resources.foreignCalendarId,registryId:resources.registryId,before,retainedProfileInactive:true,historyRetained:true});
        assert.equal(rt.sql(resourceRetireSql(resources,before),true),'RETIRED_EXACT_CB_RESOURCES');const observed=rt.query(snapshotSql(base));assertRetiredResources(before,observed,resources);assertPreserved(resources.identityBefore,rt.query(identitySql(base,resources)),true);
        rt.receipt(command+'-private.json',{...base,observed,browserPassClaim:false,historyRetained:true});
      }
    }
    rt.providersOff();rt.succeed(base);process.stdout.write(JSON.stringify({marker:cb.marker,command,state:'PASS_CB_RESOURCE_BOUNDARY_ONLY',browserPassClaim:false})+'\n');return true;
  }catch{rt?.failure(stage);process.stderr.write(JSON.stringify({marker:cb.marker,command,state:'FAIL_RETAINED',stage,redacted:true,noAutomaticRetry:true})+'\n');return false;}
  finally{rt?.close();}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){if(process.argv.length!==3){process.stderr.write('ONE_EXPLICIT_CB_COMMAND_REQUIRED\n');process.exitCode=1;}else if(!await runCbFixture(process.argv[2]))process.exitCode=1;}
