// MAIN ONLY. Fixed N01 metadata fixture; never imports an actual test suite.
// Observer commands are enforced read-only by their runtime connection factory.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {openN01Runtime} from './n01-browser-runtime.mjs';
import {n01,commands,id,quote,permissionsSql,validatePermissions,roleCreateSql,projectionSql,assertPreserved,stateSql,
  resourceCreateSql,taxonomySql,assertTaxonomy,assertRole,assertActor,actorPrepareSql,actorRetireSql,
  businessSql,observationSql,assertObservation,assertSequenceHistoryPreserved,assertNumberingProgress,ruleSql,retireResourcesSql} from './n01-browser-contract.mjs';

export async function runN01Fixture(command){
  let rt,stage='preflight';
  try{
    assert.ok(commands.includes(command),'UNKNOWN_N01_COMMAND');rt=openN01Runtime({readOnly:command.startsWith('observe-')});
    const base=command==='resources-prepare'?rt.freshReservation():rt.validateStored().base;
    rt.noOtherActor(base.authId);rt.start(command,base);
    const permissions=validatePermissions(n01,rt.query(permissionsSql(n01)));
    if(command==='resources-prepare'){
      stage='resource-reservation';
      assert.equal(rt.sql(`select ((select count(*) from auth.users where id=${quote(base.authId)}::uuid or lower(email)=${quote(n01.email)} or raw_app_meta_data->>'f06_marker'=${quote(n01.marker)})
        +(select count(*) from public.user_profiles where auth_user_id=${quote(base.authId)}::uuid or notes=${quote(n01.marker)} or full_name=${quote(n01.fullName)})
        +(select count(*) from public.roles where role_code=${quote(n01.roleCode)} or notes=${quote(n01.marker)})
        +(select count(*) from public.dms_documents where title=${quote(n01.title)}))::text;`),'0','FRESH_N01_IDENTITIES_REQUIRED');
      const identityBefore=rt.query(projectionSql(base.authId)),businessBefore=rt.query(businessSql(rt.rule.id));
      rt.append('resources-create-intent',{ruleBefore:rt.rule,permissions,identityBefore,businessBefore,
        categoryCode:n01.categoryCode,typeCode:n01.typeCode,title:n01.title,noExistingRoleMutation:true,noCounterReset:true});
      stage='create-exact-resources';
      // Both JSON result lines belong to ONE transaction: role/pairs, taxonomy and
      // the optional owned-rule active flag roll back together on any SQL error.
      const lines=rt.sql(roleCreateSql(n01,permissions)+'\n'+resourceCreateSql(rt.rule),true).split('\n');assert.equal(lines.length,2);
      const resources={...JSON.parse(lines[0]),...JSON.parse(lines[1]),permissions,rule:rt.rule};id(resources.roleId);id(resources.typeId);id(resources.categoryId);
      rt.append('resources-created',resources);
      const actorState=rt.query(stateSql({...base,...resources})),taxonomy=rt.query(taxonomySql(resources));assertRole(actorState,resources);assertTaxonomy(taxonomy,resources);
      assert.equal(actorState.auth,null);assert.deepEqual(actorState.profiles,[]);assert.deepEqual(actorState.assignments,[]);
      assertPreserved(identityBefore,rt.query(projectionSql(base.authId,resources.roleId)));
      assert.deepEqual(businessBefore,rt.query(businessSql(rt.rule.id,resources)));
      const ruleAfter=rt.query(ruleSql())[0];assert.equal(ruleAfter.is_active,true);assertNumberingProgress(rt.rule,ruleAfter,null);
      rt.receipt('resources-prepare-private.json',{...base,...resources,actorState,taxonomy,ruleAfter,identityBefore,businessBefore,browserPassClaim:false});
    }else{
      rt.completed('resources-prepare');const resources=rt.read('resources-prepare-private.json');
      assert.equal(resources.nonce,base.nonce);assert.deepEqual(resources.permissions,permissions);
      assertPreserved(resources.identityBefore,rt.query(projectionSql(base.authId,resources.roleId)),true);
      const currentTaxonomy=rt.query(taxonomySql(resources));assertTaxonomy(currentTaxonomy,resources);assert.deepEqual(currentTaxonomy,resources.taxonomy,'OWNED_TAXONOMY_CHANGED');
      let state=rt.query(stateSql({...base,...resources}));assertRole(state,resources);
      assert.equal(rt.exists('resources-retire-private.json'),false);
      if(command==='actor-prepare'){
        stage='actor-preimage';assert.equal(state.auth,null);assert.deepEqual(state.profiles,[]);assert.deepEqual(state.assignments,[]);
        assert.deepEqual(resources.businessBefore,rt.query(businessSql(resources.rule.id,resources)));
        const identityBaseline=rt.query(projectionSql(base.authId));rt.append('strict-actor-baseline',{identityBaseline});
        const password=process.env.ALGT_F06_BROWSER_PASSWORD;
        assert.ok(typeof password==='string'&&password.length>=24&&password.length<=128&&/[A-Z]/.test(password)&&/[a-z]/.test(password)&&/[0-9]/.test(password)&&/[^a-z0-9]/i.test(password),'MAIN_RANDOM_PASSWORD_REQUIRED');
        // Never journal or print credentials. Main chooses a fresh random value.
        rt.exclusive('credentials-private.json',{nonce:base.nonce,email:n01.email,password,authId:base.authId,sourceSha256:base.sourceSha256});
        const admin=await rt.authAdmin(base);stage='auth-create';rt.append('auth-create-intent',{authId:base.authId,email:n01.email,marker:n01.marker,emailConfirm:true,sendsEmail:false});
        const created=await admin.createUser({id:base.authId,email:n01.email,password,email_confirm:true,app_metadata:{f06_marker:n01.marker},user_metadata:{full_name:n01.fullName,display_name:n01.fullName}});
        assert.equal(Boolean(created.error),false);assert.equal(created.data.user?.id,base.authId);assert.equal(created.data.user?.email,n01.email);
        rt.append('auth-created',{authId:base.authId});state=rt.query(stateSql({...base,...resources}));assert.equal(state.profiles.length,1);assert.deepEqual(state.assignments,[]);assert.deepEqual(state.sessions,[]);assert.deepEqual(state.refreshIds,[]);
        const profileId=id(state.profiles[0].id);stage='actor-assignment';rt.append('actor-assignment-intent',{profileId,roleId:resources.roleId,companyId:null,branchId:null});
        const assigned=JSON.parse(rt.sql(actorPrepareSql(base,resources,profileId),true));id(assigned.assignmentId);
        const prepared={...resources,...assigned};rt.append('actor-assignment-created',assigned);state=rt.query(stateSql({...base,...resources}));assertRole(state,resources);assertActor(state,base,prepared);
        assertPreserved(identityBaseline,rt.query(projectionSql(base.authId)));
        assert.deepEqual(resources.businessBefore,rt.query(businessSql(resources.rule.id,resources,profileId)));
        const initial=rt.query(observationSql(resources,profileId));assertObservation(initial,resources,profileId,{empty:true});
        rt.receipt('actor-prepare-private.json',{...prepared,state,identityBaseline,initial,browserPassClaim:false});
      }else{
        rt.completed('actor-prepare');const prepared=rt.read('actor-prepare-private.json');assert.equal(prepared.nonce,base.nonce);assert.equal(prepared.roleId,resources.roleId);
        const identityNow=rt.query(projectionSql(base.authId));assertPreserved(prepared.identityBaseline,identityNow,true);
        assertActor(state,base,prepared,command==='resources-retire');
        assert.deepEqual(resources.businessBefore,rt.query(businessSql(resources.rule.id,resources,prepared.profileId)));
        const observed=rt.query(observationSql(resources,prepared.profileId)),currentRule=rt.query(ruleSql())[0];assert.equal(currentRule.is_active,true);
        if(command==='observe-invalid'){
          stage='observe-invalid';assert.equal(rt.exists('observe-created-private.json'),false);assert.ok(state.sessions.length>0,'BROWSER_LOGIN_NOT_OBSERVED');
          assertObservation(observed,resources,prepared.profileId,{empty:true});assert.deepEqual(observed.sequences,prepared.initial.sequences);
          assertNumberingProgress(resources.rule,currentRule,null);
          rt.receipt('observe-invalid-private.json',{...base,profileId:prepared.profileId,observed,currentRule,state,browserPassClaim:false,assertion:'NO_COMMITTED_EFFECTS_ONLY'});
        }else{
          rt.completed('observe-invalid');const identity=assertObservation(observed,resources,prepared.profileId);assertNumberingProgress(resources.rule,currentRule,observed);
          // Preserve every pre-existing sequence row except the exact consumed
          // reference's one sequence state. Never treat a whole rule as disposable.
          assertSequenceHistoryPreserved(prepared.initial.sequences,observed.sequences,identity.sequenceId);
          if(command==='observe-created'){
            stage='observe-created';assert.ok(state.sessions.length>0,'BROWSER_LOGIN_NOT_OBSERVED');
            rt.append('browser-operation-observed',{identity,sessions:state.sessions,refreshIds:state.refreshIds});
            rt.receipt('observe-created-private.json',{...base,profileId:prepared.profileId,identity,observed,currentRule,state,browserPassClaim:false,assertion:'ONE_EXACT_METADATA_CONSUMER_ONLY'});
          }else{
            rt.completed('observe-created');const created=rt.read('observe-created-private.json');assert.deepEqual(identity,created.identity);assert.deepEqual(observed,created.observed,'COMMITTED_N01_HISTORY_CHANGED');
            assert.deepEqual(currentRule,created.currentRule,'NUMBERING_CHANGED_AFTER_CREATE');
            if(command==='observe-retained'){
              stage='observe-retained';assert.ok(state.sessions.length>0);rt.receipt('observe-retained-private.json',{...base,identity,observed,currentRule,state,browserPassClaim:false,assertion:'UNCHANGED_IDENTITY_AND_HISTORY_ONLY',responseLossTested:false,replayClaim:false});
            }else if(command==='actor-retire'){
              rt.completed('observe-retained');stage='ban-owned-actor';const admin=await rt.authAdmin(base);
              rt.append('auth-ban-intent',{authId:base.authId,banDuration:'876000h',sessions:state.sessions,refreshIds:state.refreshIds});
              const banned=await admin.updateUserById(base.authId,{ban_duration:'876000h'});assert.equal(Boolean(banned.error),false);assert.equal(banned.data.user?.id,base.authId);
              state=rt.query(stateSql({...base,...resources}));assertRole(state,resources);assert.equal(state.auth.banned,true);
              stage='retire-exact-actor';const sessionIds=state.sessions.map(s=>s.id).sort(),refreshIds=[...state.refreshIds].sort();
              rt.append('actor-retire-intent',{authId:base.authId,profileId:prepared.profileId,assignmentId:prepared.assignmentId,roleId:resources.roleId,sessionIds,refreshIds});
              const removed=JSON.parse(rt.sql(actorRetireSql(base,prepared,state),true));assert.deepEqual([...removed.sessionIds].sort(),sessionIds);assert.deepEqual([...removed.refreshIds].sort(),refreshIds);rt.append('actor-retired',removed);
              state=rt.query(stateSql({...base,...resources}));assertRole(state,resources);assertActor(state,base,prepared,true);
              assertPreserved(identityNow,rt.query(projectionSql(base.authId)));
              rt.receipt('actor-retire-private.json',{...base,identity,state,removed,browserPassClaim:false});
            }else{
              rt.completed('actor-retire');stage='retire-exact-resources';
              const taxonomy=rt.query(taxonomySql(resources));rt.append('resources-retire-intent',{identity,taxonomy,ruleBefore:currentRule,restoreActive:resources.rule.is_active,roleId:resources.roleId,countersAndHistoryRetained:true});
              assert.equal(rt.sql(retireResourcesSql(resources,prepared,observed),true),'RETIRED_EXACT_N01_RESOURCES');
              state=rt.query(stateSql({...base,...resources}));assertRole(state,resources,false);assertActor(state,base,prepared,true);
              const retiredTaxonomy=rt.query(taxonomySql(resources));assertTaxonomy(retiredTaxonomy,resources,false);
              const stableTaxonomy=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['is_active','updated_at'].includes(key)));
              for(const key of ['type','category'])assert.deepEqual(stableTaxonomy(retiredTaxonomy[key]),stableTaxonomy(taxonomy[key]));
              const after=rt.query(observationSql(resources,prepared.profileId));assert.deepEqual(assertObservation(after,resources,prepared.profileId,{archived:true}),identity);
              for(const key of ['references','requests','events','audits','sequences'])assert.deepEqual(after[key],observed[key]);
              const retainedDoc=doc=>Object.fromEntries(Object.entries(doc).filter(([key])=>!['is_archived','archived_at','updated_at'].includes(key)));
              assert.deepEqual(retainedDoc(after.documents[0]),retainedDoc(observed.documents[0]));
              const ruleAfter=rt.query(ruleSql())[0];assert.equal(ruleAfter.is_active,resources.rule.is_active);assertNumberingProgress(resources.rule,ruleAfter,after);
              assert.equal(ruleAfter.current_sequence_number,currentRule.current_sequence_number);assert.equal(ruleAfter.next_sequence_number,currentRule.next_sequence_number);
              assertPreserved(resources.identityBefore,rt.query(projectionSql(base.authId,resources.roleId)),true);
              assert.deepEqual(resources.businessBefore,rt.query(businessSql(resources.rule.id,resources,prepared.profileId)));
              rt.receipt('resources-retire-private.json',{...base,identity,state,taxonomy:rt.query(taxonomySql(resources)),observed:after,ruleAfter,browserPassClaim:false,historyRetained:true});
            }
          }
        }
      }
    }
    rt.providersOff();rt.succeed(base);process.stdout.write(JSON.stringify({marker:n01.marker,command,state:'PASS_N01_FIXTURE_BOUNDARY_ONLY',browserPassClaim:false})+'\n');return true;
  }catch{rt?.failure(stage);process.stderr.write(JSON.stringify({marker:n01.marker,command,state:'FAIL_RETAINED',stage,redacted:true,noAutomaticRetry:true})+'\n');return false;}
  finally{rt?.close();}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  if(process.argv.length!==3){process.stderr.write('ONE_EXPLICIT_N01_COMMAND_REQUIRED\n');process.exitCode=1;}
  else if(!await runN01Fixture(process.argv[2]))process.exitCode=1;
}
