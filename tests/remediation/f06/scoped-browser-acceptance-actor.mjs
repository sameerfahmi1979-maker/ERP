// MAIN ONLY. Authoring is not authorization to execute. No runtime effects on import.
// Explicit one-shot sequence per closed mode: role-prepare, prepare, observe,
// retire, role-retire. Failed/unknown outcomes retain locks/evidence: no retries.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {openScopedRuntime} from './scoped-browser-runtime.mjs';
import {commands,id,quote,permissionsSql,validatePermissions,roleCreateSql,projectionSql,
  assertPreserved,stateSql,assertRole,assertActor,actorPrepareSql,actorRetireSql,roleRetireSql} from './scoped-browser-contract.mjs';

export async function runScopedBrowserActor(modeName,command){
  let rt,stage='preflight';
  try{
    assert.ok(commands.includes(command));rt=openScopedRuntime(modeName);
    const base=command==='role-prepare'?rt.freshReservation():rt.validateStored().reservation;
    rt.noOtherActor(base.authId);rt.start(command,base);
    const mode=rt.mode;
    const permissions=validatePermissions(mode,rt.query(permissionsSql(mode)));
    rt.append('canonical-permissions-verified',{permissions,flagsChanged:false});
    if(command==='role-prepare'){
      stage='reserve-role';
      assert.equal(rt.sql(`select ((select count(*) from auth.users where id=${quote(base.authId)}::uuid or lower(email)=${quote(mode.email)} or raw_app_meta_data->>'f06_marker'=${quote(mode.marker)})
        +(select count(*) from public.user_profiles where auth_user_id=${quote(base.authId)}::uuid or full_name=${quote(mode.fullName)} or notes=${quote(mode.marker)})
        +(select count(*) from public.roles where role_code=${quote(mode.roleCode)} or notes=${quote(mode.marker)}))::text;`),'0');
      const before=rt.query(projectionSql(base.authId));
      rt.append('role-create-intent',{permissions,roleCode:mode.roleCode,marker:mode.marker,before,noExistingRoleMutation:true});
      stage='role-create';const created=JSON.parse(rt.sql(roleCreateSql(mode,permissions),true));id(created.roleId);
      const reservation={...base,...created,permissions};
      rt.append('role-created',{roleId:created.roleId,pairs:created.pairs});
      const state=rt.query(stateSql(reservation));assertRole(state,reservation);
      assert.equal(state.auth,null);assert.deepEqual(state.profiles,[]);assert.deepEqual(state.assignments,[]);
      assertPreserved(before,rt.query(projectionSql(base.authId,created.roleId)));rt.providersOff();
      rt.receipt('role-prepare-private.json',{...reservation,state,preservedBaseline:before});
    }else{
      rt.completed('role-prepare');const roleReceipt=rt.read('role-prepare-private.json');
      const reservation={...base,roleId:roleReceipt.roleId,pairs:roleReceipt.pairs,permissions:roleReceipt.permissions};
      assert.deepEqual(roleReceipt.sourceSha256,base.sourceSha256);assert.equal(roleReceipt.nonce,base.nonce);
      assert.deepEqual(permissions,reservation.permissions);
      assertPreserved(roleReceipt.preservedBaseline,rt.query(projectionSql(base.authId,reservation.roleId)),true);
      const before=rt.query(projectionSql(base.authId));rt.append('actor-window-preimage',{before});
      let state=rt.query(stateSql(reservation));assertRole(state,reservation);
      assert.equal(rt.exists('role-retire-private.json'),false);
      if(command==='prepare'){
        stage='reserve-credentials';assert.equal(state.auth,null);assert.deepEqual(state.profiles,[]);assert.deepEqual(state.assignments,[]);
        const password=process.env.ALGT_F06_BROWSER_PASSWORD;
        assert.ok(typeof password==='string'&&password.length>=24&&password.length<=128&&/[A-Z]/.test(password)&&/[a-z]/.test(password)&&/[0-9]/.test(password)&&/[^a-z0-9]/i.test(password));
        // Credentials are only in this protected, ignored receipt. Never journal password.
        rt.receipt('credentials-private.json',{nonce:base.nonce,email:mode.email,authId:base.authId,password,sourceSha256:base.sourceSha256});
        const admin=await rt.authAdmin(reservation);
        stage='auth-create';rt.append('auth-create-intent',{authId:base.authId,email:mode.email,marker:mode.marker,emailConfirm:true,sendsEmail:false});
        const created=await admin.createUser({id:base.authId,email:mode.email,password,email_confirm:true,
          app_metadata:{f06_marker:mode.marker},user_metadata:{full_name:mode.fullName,display_name:mode.fullName}});
        assert.equal(Boolean(created.error),false);assert.equal(created.data.user?.id,base.authId);assert.equal(created.data.user?.email,mode.email);
        rt.append('auth-created',{authId:base.authId});state=rt.query(stateSql(reservation));
        assert.equal(state.profiles.length,1);assert.deepEqual(state.assignments,[]);assert.deepEqual(state.sessions,[]);assert.deepEqual(state.refreshIds,[]);
        const profileId=id(state.profiles[0].id);stage='actor-assignment';
        rt.append('actor-assignment-intent',{profileId,authId:base.authId,roleId:reservation.roleId,scope:mode.scope,owner:base.owner});
        const prepared=JSON.parse(rt.sql(actorPrepareSql(reservation,profileId),true));id(prepared.assignmentId);
        rt.append('actor-assignment-created',prepared);state=rt.query(stateSql(reservation));assertRole(state,reservation);assertActor(state,reservation,prepared);assert.notEqual(state.auth.banned,true);
        assertPreserved(before,rt.query(projectionSql(base.authId)));rt.providersOff();
        rt.receipt('prepare-private.json',{...reservation,...prepared,state,preservedBaseline:before});
      }else{
        rt.completed('prepare');const prepared=rt.read('prepare-private.json');
        assert.equal(prepared.nonce,base.nonce);assert.equal(prepared.roleId,reservation.roleId);
        assertPreserved(prepared.preservedBaseline,before,true);
        assertActor(state,reservation,prepared,command==='role-retire');
        if(command!=='role-retire')assert.notEqual(state.auth.banned,true);
        if(command==='observe'){
          assert.equal(rt.exists('retire-private.json'),false);stage='observe-browser';
          assert.ok(state.sessions.length>0,'NO_OBSERVED_BROWSER_LOGIN');
          for(const session of state.sessions){assert.match(session.id,/^[0-9a-f-]{36}$/i);assert.equal(session.userId,base.authId);}
          rt.append('browser-sessions-observed',{sessions:state.sessions,refreshIds:state.refreshIds});
        }else if(command==='retire'){
          assert.equal(rt.exists('retire-private.json'),false);stage='ban-owned-actor';
          const admin=await rt.authAdmin(reservation);
          rt.append('auth-ban-intent',{authId:base.authId,banDuration:'876000h',sessions:state.sessions,refreshIds:state.refreshIds});
          const banned=await admin.updateUserById(base.authId,{ban_duration:'876000h'});
          assert.equal(Boolean(banned.error),false);assert.equal(banned.data.user?.id,base.authId);
          state=rt.query(stateSql(reservation));assertRole(state,reservation);assertActor(state,reservation,prepared);assert.equal(state.auth.banned,true);
          const exactSessions=state.sessions.map(s=>s.id),exactRefresh=state.refreshIds;
          rt.append('exact-retirement-intent',{authId:base.authId,profileId:prepared.profileId,assignmentId:prepared.assignmentId,
            roleId:reservation.roleId,sessionIds:exactSessions,refreshIds:exactRefresh,historyRetained:true});
          stage='retire-exact-actor';const removed=JSON.parse(rt.sql(actorRetireSql(reservation,prepared,state),true));
          rt.append('exact-retirement-result',removed);
          assert.deepEqual([...removed.removedSessionIds].sort(),[...exactSessions].sort());
          assert.deepEqual([...removed.removedRefreshIds].sort(),[...exactRefresh].sort());
          state=rt.query(stateSql(reservation));assertRole(state,reservation);assertActor(state,reservation,prepared,true);
        }else{
          rt.completed('retire');stage='retire-owned-role';
          rt.append('role-retire-intent',{roleId:reservation.roleId,roleCode:mode.roleCode,marker:mode.marker,permissionPairsRetained:true});
          assert.equal(rt.sql(roleRetireSql(reservation,prepared),true),String(reservation.roleId));
          state=rt.query(stateSql(reservation));assertRole(state,reservation,false);assertActor(state,reservation,prepared,true);
        }
        if(command==='role-retire')assertPreserved(roleReceipt.preservedBaseline,rt.query(projectionSql(base.authId,reservation.roleId)),true);
        else assertPreserved(before,rt.query(projectionSql(base.authId)));
        rt.providersOff();rt.receipt(command+'-private.json',{...reservation,profileId:prepared.profileId,assignmentId:prepared.assignmentId,
          state,unrelatedPreserved:true,historyRetained:true,browserPassClaim:false});
      }
    }
    rt.succeed(base);
    process.stdout.write(JSON.stringify({mode:modeName,command,state:'PASS_SCOPED_FIXTURE_ONLY',browserPassClaim:false})+'\n');
    return true;
  }catch{
    rt?.failure(stage);process.stderr.write(JSON.stringify({mode:modeName,command,state:'FAIL_RETAINED',stage,redacted:true,noAutomaticRetry:true})+'\n');return false;
  }finally{rt?.close();}
}
// Direct execution only. Pure tests do not import this runtime entry point.
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  if(process.argv.length!==3){process.stderr.write('ONE_EXPLICIT_COMMAND_REQUIRED\n');process.exitCode=1;}
  else if(!await runScopedBrowserActor(process.env.ALGT_F06_SCOPED_MODE,process.argv[2]))process.exitCode=1;
}
