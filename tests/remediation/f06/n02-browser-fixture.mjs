// MAIN ONLY finite N02 lifecycle. Never imports/calls an actual test or consumer.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {openN02Runtime} from './n02-browser-runtime.mjs';
import {n02,commands,id,quote,roleCreateSql,validatePermissions,permissionsSql,identitySql,assertPreserved,
 resourceCreateSql,taxonomySql,assertTaxonomy,actorStateSql,assertRoles,assertActor,actorSourceSql,sourceSql,assertSource,
 sourceBytes,sourceDigest,storageSql,assertStorage,observationSql,assertObservation,expectedRequest,businessSql,
 ruleSql,assertNumberingProgress,assertSequenceHistoryPreserved,preserveExcept,actorRetireSql,resourceRetireSql} from './n02-browser-contract.mjs';

export async function runN02Fixture(command){
 let rt,stage='preflight';
 try{
  assert.ok(commands.includes(command),'UNKNOWN_N02_COMMAND');rt=openN02Runtime({readOnly:command.startsWith('observe-')});
  const base=command==='resources-prepare'?rt.freshReservation():rt.validateStored().base;rt.noOtherActor(base.authId);
  // All checks above are read-only and precede any lifetime/journal creation.
  rt.start(command,base);const permissions=validatePermissions(n02,rt.query(permissionsSql(n02)));assert.deepEqual(permissions,base.permissions);
  if(command==='resources-prepare'){
   stage='fresh-resource-reservation';assert.equal(rt.sql(`select ((select count(*) from auth.users where id=${quote(base.authId)}::uuid or lower(email)=${quote(n02.email)} or raw_app_meta_data->>'f06_marker'=${quote(n02.marker)})
    +(select count(*) from public.user_profiles where auth_user_id=${quote(base.authId)}::uuid or notes=${quote(n02.marker)} or full_name=${quote(n02.fullName)})
    +(select count(*) from public.roles where role_code in (${Object.values(n02.roles).map(r=>quote(r.roleCode)).join(',')}) or notes in (${Object.values(n02.roles).map(r=>quote(r.marker)).join(',')}))
    +(select count(*) from public.dms_upload_sessions where session_code=${quote(n02.sessionCode)} or temp_storage_path=${quote(n02.sourcePath)})
    +(select count(*) from public.dms_documents where title=${quote(n02.title)}))::text;`),'0','FRESH_N02_IDENTITIES_REQUIRED');
   assert.deepEqual(rt.query(storageSql(base)),[],'RESERVED_SOURCE_AND_DESTINATION_PREFIX_MUST_BE_EMPTY');
   const identityBefore=rt.query(identitySql(base.authId)),businessBefore=rt.query(businessSql(base,rt.rule.id));
   rt.append('resources-create-intent',{ruleBefore:rt.rule,permissions,identityBefore,businessBefore,taxonomy:{categoryCode:n02.categoryCode,typeCode:n02.typeCode},source:{sessionCode:n02.sessionCode,path:n02.sourcePath,sha256:sourceDigest(),size:sourceBytes().length,mime:n02.mime},destinationPrefix:base.destinationPrefix,destinationFormula:base.destinationFormula,noExistingDefinitionMutation:true,noCounterReset:true});
   stage='create-exact-resources';const statements=Object.values(n02.roles).map(mode=>roleCreateSql(mode,permissions.filter(p=>mode.permissions.includes(p.code))));
   const lines=rt.sql([...statements,resourceCreateSql(rt.rule)].join('\n'),true).split('\n');assert.equal(lines.length,3);
   const resources={...base,roles:{dms:JSON.parse(lines[0]),numbering:JSON.parse(lines[1])},...JSON.parse(lines[2]),permissions,rule:rt.rule};
   for(const r of Object.values(resources.roles))id(r.roleId);id(resources.typeId);id(resources.categoryId);rt.append('resources-created',resources);
   const state=rt.query(actorStateSql(base,resources)),taxonomy=rt.query(taxonomySql(resources));assertRoles(state,resources);assertTaxonomy(taxonomy,resources);assert.equal(state.auth,null);assert.deepEqual(state.profiles,[]);assert.deepEqual(state.assignments,[]);
   assertPreserved(identityBefore,rt.query(identitySql(base.authId,resources)));assert.deepEqual(businessBefore,rt.query(businessSql(base,rt.rule.id,resources)));
   const ruleAfter=rt.query(ruleSql())[0];assert.equal(ruleAfter.is_active,true);assertNumberingProgress(rt.rule,ruleAfter,null);
   rt.receipt('resources-prepare-private.json',{...resources,state,taxonomy,identityBefore,businessBefore,ruleAfter,browserPassClaim:false});
  }else{
   rt.completed('resources-prepare');const resources=rt.read('resources-prepare-private.json');assert.equal(resources.nonce,base.nonce);assert.deepEqual(resources.permissions,permissions);
   assertPreserved(resources.identityBefore,rt.query(identitySql(base.authId,resources)),true);assert.equal(rt.exists('resources-retire-private.json'),false);
   const taxonomy=rt.query(taxonomySql(resources));assertTaxonomy(taxonomy,resources);assert.deepEqual(taxonomy,resources.taxonomy,'OWNED_TAXONOMY_CHANGED');
   let state=rt.query(actorStateSql(base,resources));assertRoles(state,resources);
   if(command==='actor-source-prepare'){
    stage='actor-source-preimage';assert.equal(state.auth,null);assert.deepEqual(state.profiles,[]);assert.deepEqual(state.assignments,[]);assert.deepEqual(rt.query(storageSql(base)),[]);
    assert.deepEqual(resources.businessBefore,rt.query(businessSql(base,resources.rule.id,resources)));
    const identityBaseline=rt.query(identitySql(base.authId));rt.append('strict-actor-baseline',{identityBaseline});
    const password=process.env.ALGT_F06_BROWSER_PASSWORD;assert.ok(typeof password==='string'&&password.length>=24&&password.length<=128&&/[A-Z]/.test(password)&&/[a-z]/.test(password)&&/[0-9]/.test(password)&&/[^a-z0-9]/i.test(password),'MAIN_RANDOM_PASSWORD_REQUIRED');
    rt.exclusive('credentials-private.json',{nonce:base.nonce,email:n02.email,password,authId:base.authId,sourceSha256:base.sourceSha256});
    const admin=await rt.authAdmin(base);stage='auth-create';rt.append('auth-create-intent',{authId:base.authId,email:n02.email,marker:n02.marker,emailConfirm:true,sendsEmail:false});
    const created=await admin.createUser({id:base.authId,email:n02.email,password,email_confirm:true,app_metadata:{f06_marker:n02.marker},user_metadata:{full_name:n02.fullName,display_name:n02.fullName}});
    assert.equal(Boolean(created.error),false);assert.equal(created.data.user?.id,base.authId);assert.equal(created.data.user?.email,n02.email);rt.append('auth-created',{authId:base.authId});
    state=rt.query(actorStateSql(base,resources));assert.equal(state.profiles.length,1);assert.deepEqual(state.assignments,[]);assert.deepEqual(state.sessions,[]);assert.deepEqual(state.refreshIds,[]);
    const profileId=id(state.profiles[0].id);stage='actor-source-create';rt.append('actor-source-create-intent',{authId:base.authId,profileId,roles:resources.roles,companyId:base.owner.companyId,branchId:base.owner.branchId,sessionCode:n02.sessionCode,sourcePath:n02.sourcePath,sha256:sourceDigest(),size:sourceBytes().length,status:'uploaded',intakeStatus:'uploaded',reviewStatus:'not_started',noAiRows:true});
    const lines=rt.sql(actorSourceSql(base,resources,profileId),true).split('\n');assert.equal(lines.length,2);const prepared={...resources,...JSON.parse(lines[0]),...JSON.parse(lines[1])};id(prepared.uploadId);
    for(const a of Object.values(prepared.assignmentIds))id(a);rt.append('actor-source-created',{profileId,assignmentIds:prepared.assignmentIds,uploadId:prepared.uploadId});
    const source=assertSource(rt.query(sourceSql(prepared)),base,prepared);assert.equal(Date.parse(source.expires_at)>Date.now(),true);prepared.source=source;
    stage='source-byte-upload';assert.deepEqual(rt.query(storageSql(base)),[]);rt.append('source-upload-intent',{bucket:'dms-temp',path:n02.sourcePath,sha256:sourceDigest(),size:sourceBytes().length,mime:n02.mime,upsert:false,retained:true});
    const uploaded=await rt.uploadSource(base);assert.equal(uploaded.path,n02.sourcePath);rt.append('source-upload-returned',uploaded);
    const objects=rt.query(storageSql(base));const stored=assertStorage(objects,base);assert.equal(stored.source.id,uploaded.id);const byteProofs=await rt.verifyBytes(base,objects);
    assert.deepEqual(rt.query(storageSql(base)),objects,'SOURCE_IDENTITY_CHANGED_DURING_BYTE_PROOF');
    state=rt.query(actorStateSql(base,resources));assertRoles(state,resources);assertActor(state,base,prepared);assert.deepEqual(state.sessions,[]);assert.deepEqual(state.refreshIds,[]);
    assertPreserved(identityBaseline,rt.query(identitySql(base.authId)));assert.deepEqual(resources.businessBefore,rt.query(businessSql(base,resources.rule.id,resources,prepared)));
    const initial=rt.query(observationSql(base,resources,prepared));assertObservation(initial,base,resources,prepared,{empty:true});
    rt.receipt('actor-source-prepare-private.json',{...prepared,state,identityBaseline,initial,objects,byteProofs,expectedRequest:expectedRequest(base,resources,prepared),browserPassClaim:false});
   }else{
    rt.completed('actor-source-prepare');const prepared=rt.read('actor-source-prepare-private.json');assert.equal(prepared.nonce,base.nonce);assert.deepEqual(prepared.roles,resources.roles);
    const identityNow=rt.query(identitySql(base.authId));assertPreserved(prepared.identityBaseline,identityNow,true);assertActor(state,base,prepared,command==='resources-retire');
    const observation=rt.query(observationSql(base,resources,prepared)),currentRule=rt.query(ruleSql())[0];assert.equal(currentRule.is_active,true);
    if(command==='observe-invalid'){
     stage='observe-invalid';assert.ok(state.sessions.length>0,'BROWSER_LOGIN_NOT_OBSERVED');assert.equal(rt.exists('observe-completed-private.json'),false);
     assertObservation(observation,base,resources,prepared,{empty:true});assert.deepEqual(observation.sequences,prepared.initial.sequences);assertNumberingProgress(resources.rule,currentRule,null);
     const source=assertSource(rt.query(sourceSql(prepared)),base,prepared);assert.deepEqual(source,prepared.source);
     const objects=rt.query(storageSql(base));assertStorage(objects,base);assert.deepEqual(objects,prepared.objects);assert.deepEqual(resources.businessBefore,rt.query(businessSql(base,resources.rule.id,resources,prepared)));
     rt.receipt('observe-invalid-private.json',{...base,profileId:prepared.profileId,observation,source,objects,currentRule,state,browserPassClaim:false,assertion:'NO_COMMITTED_CONSUMER_EFFECTS_ONLY'});
    }else{
     rt.completed('observe-invalid');const identity=assertObservation(observation,base,resources,prepared);assertNumberingProgress(resources.rule,currentRule,observation);assertSequenceHistoryPreserved(prepared.initial.sequences,observation.sequences,identity.sequenceId);
     const source=assertSource(rt.query(sourceSql(prepared)),base,prepared,{documentId:identity.documentId});preserveExcept(prepared.source,source,['document_id','status','completed_at','updated_at'],'SOURCE_PREIMAGE_CHANGED');
     const objects=rt.query(storageSql(base)),stored=assertStorage(objects,base,observation);assert.deepEqual(stored.source,prepared.objects[0],'ORIGINAL_SOURCE_OBJECT_CHANGED');
     assert.deepEqual(resources.businessBefore,rt.query(businessSql(base,resources.rule.id,resources,prepared,identity)));
     if(command==='observe-completed'){
      stage='observe-completed';assert.ok(state.sessions.some(s=>s.id===identity.verifiedSessionId),'VERIFIED_BROWSER_SESSION_NOT_CURRENT');
      const byteProofs=await rt.verifyBytes(base,objects);assert.deepEqual(rt.query(storageSql(base)),objects,'OBJECT_IDENTITY_CHANGED_DURING_BYTE_PROOF');
      rt.append('browser-operation-observed',{identity,uploadId:prepared.uploadId,expectedRequest:prepared.expectedRequest,objects,byteProofs});
      rt.receipt('observe-completed-private.json',{...base,profileId:prepared.profileId,identity,observation,source,objects,byteProofs,currentRule,state,browserPassClaim:false,assertion:'ONE_EXACT_COMPLETED_UPLOAD_CONSUMER_ONLY'});
     }else{
      rt.completed('observe-completed');const completed=rt.read('observe-completed-private.json');assert.deepEqual(identity,completed.identity);assert.deepEqual(observation,completed.observation,'COMPLETION_HISTORY_CHANGED');assert.deepEqual(source,completed.source);assert.deepEqual(objects,completed.objects);assert.deepEqual(currentRule,completed.currentRule);
      if(command==='observe-retained'){
       stage='observe-retained';assert.ok(state.sessions.some(s=>s.id===identity.verifiedSessionId));const byteProofs=await rt.verifyBytes(base,objects);assert.deepEqual(rt.query(storageSql(base)),objects);
       rt.receipt('observe-retained-private.json',{...base,identity,observation,source,objects,byteProofs,currentRule,state,browserPassClaim:false,responseLossTested:false,replayClaim:false,assertion:'UNCHANGED_EXACT_UPLOAD_IDENTITY_AND_HISTORY_ONLY'});
      }else if(command==='actor-retire'){
       rt.completed('observe-retained');stage='ban-owned-actor';const admin=await rt.authAdmin(base);rt.append('auth-ban-intent',{authId:base.authId,banDuration:'876000h',sessions:state.sessions,refreshIds:state.refreshIds});
       const banned=await admin.updateUserById(base.authId,{ban_duration:'876000h'});assert.equal(Boolean(banned.error),false);assert.equal(banned.data.user?.id,base.authId);
       state=rt.query(actorStateSql(base,resources));assertRoles(state,resources);assert.equal(state.auth.banned,true);stage='retire-exact-actor';
       const sessionIds=state.sessions.map(s=>s.id).sort(),refreshIds=[...state.refreshIds].sort();rt.append('actor-retire-intent',{authId:base.authId,profileId:prepared.profileId,assignmentIds:prepared.assignmentIds,roles:prepared.roles,sessionIds,refreshIds});
       const removed=JSON.parse(rt.sql(actorRetireSql(base,prepared,state),true));assert.deepEqual([...removed.sessionIds].sort(),sessionIds);assert.deepEqual([...removed.refreshIds].sort(),refreshIds);rt.append('actor-retired',removed);
       state=rt.query(actorStateSql(base,resources));assertRoles(state,resources);assertActor(state,base,prepared,true);assertPreserved(identityNow,rt.query(identitySql(base.authId)));
       rt.receipt('actor-retire-private.json',{...base,identity,state,removed,browserPassClaim:false});
      }else{
       rt.completed('actor-retire');stage='retire-exact-resources';rt.append('resources-retire-intent',{identity,uploadId:prepared.uploadId,taxonomy,ruleBefore:currentRule,restoreRuleActive:resources.rule.is_active,objects,roles:resources.roles,historyAndBytesRetained:true});
       assert.equal(rt.sql(resourceRetireSql(base,resources,prepared,observation),true),'RETIRED_EXACT_N02_RESOURCES');
       state=rt.query(actorStateSql(base,resources));assertRoles(state,resources,false);assertActor(state,base,prepared,true);const afterTaxonomy=rt.query(taxonomySql(resources));assertTaxonomy(afterTaxonomy,resources,false);
       for(const key of ['type','category'])preserveExcept(taxonomy[key],afterTaxonomy[key],['is_active','updated_at'],'OWNED_TAXONOMY_CHANGED');
       const after=rt.query(observationSql(base,resources,prepared));assert.deepEqual(assertObservation(after,base,resources,prepared,{archived:true}),identity);
       for(const key of ['references','requests','versions','files','events','audits','verified','completed','sequences'])assert.deepEqual(after[key],observation[key]);preserveExcept(observation.documents[0],after.documents[0],['is_archived','archived_at','updated_at'],'DOCUMENT_HISTORY_CHANGED');
       const afterSource=assertSource(rt.query(sourceSql(prepared)),base,prepared,{documentId:identity.documentId,retired:true});preserveExcept(source,afterSource,['status','intake_status','updated_at'],'SOURCE_HISTORY_CHANGED');
       const afterObjects=rt.query(storageSql(base));assert.deepEqual(afterObjects,objects,'RETAINED_STORAGE_CHANGED');assertStorage(afterObjects,base,after);
       const ruleAfter=rt.query(ruleSql())[0];assert.equal(ruleAfter.is_active,resources.rule.is_active);assertNumberingProgress(resources.rule,ruleAfter,after);assert.equal(ruleAfter.current_sequence_number,currentRule.current_sequence_number);assert.equal(ruleAfter.next_sequence_number,currentRule.next_sequence_number);
       assertPreserved(resources.identityBefore,rt.query(identitySql(base.authId,resources)),true);assert.deepEqual(resources.businessBefore,rt.query(businessSql(base,resources.rule.id,resources,prepared,identity)));
       rt.receipt('resources-retire-private.json',{...base,identity,state,taxonomy:afterTaxonomy,observation:after,source:afterSource,objects:afterObjects,ruleAfter,browserPassClaim:false,retainedHistory:true});
      }
     }
    }
   }
  }
  rt.providersOff();rt.succeed(base);process.stdout.write(JSON.stringify({marker:n02.marker,command,state:'PASS_N02_FIXTURE_BOUNDARY_ONLY',browserPassClaim:false})+'\n');return true;
 }catch{rt?.failure(stage);process.stderr.write(JSON.stringify({marker:n02.marker,command,state:'FAIL_RETAINED',stage,redacted:true,noAutomaticRetry:true})+'\n');return false;}
 finally{rt?.close();}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 if(process.argv.length!==3){process.stderr.write('ONE_EXPLICIT_N02_COMMAND_REQUIRED\n');process.exitCode=1;}else if(!await runN02Fixture(process.argv[2]))process.exitCode=1;
}
