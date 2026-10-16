// Pure synthetic/source-only checks. Never import a runtime, actual suite or app action.
import fs from 'node:fs';
import ts from 'typescript';
import {describe,expect,it} from 'vitest';
import {n02,commands,sourceBytes,sourceDigest,sha,prefixFor,destinationFor,expectedFileName,identitySql,resourceCreateSql,
 assertTaxonomy,assertRoles,assertActor,actorSourceSql,assertSource,expectedRequest,assertBuckets,assertObject,
 observationSql,assertObservation,assertStorage,businessSql,actorRetireSql,resourceRetireSql,preserveExcept,
 validatePermissions,roleCreateSql,assertSequenceHistoryPreserved} from './n02-browser-contract.mjs';

const op='11111111-1111-4111-8111-111111111111',authId='22222222-2222-4222-8222-222222222222';
const objectId='33333333-3333-4333-8333-333333333333',destId='44444444-4444-4444-8444-444444444444',sessionId='55555555-5555-4555-8555-555555555555';
const time='2026-10-05T00:00:00.123456+00:00';
const rule=()=>({id:701,rule_code:'MASTER_DMS_DOCUMENT',rule_name:'FDMCRSYNTHETIC',is_active:false,current_sequence_number:'40',next_sequence_number:'41',workspace_revision:'3'});
const permissions=()=>n02.permissions.map((code:string,i:number)=>({id:1001+i,code,active:true}));
function resources(){const permissionsNow=permissions();return {rule:rule(),categoryId:801,typeId:802,permissions:permissionsNow,roles:{
 dms:{roleId:803,pairs:permissionsNow.slice(0,4).map((p:{id:number},i:number)=>({id:1101+i,role_id:803,permission_id:p.id}))},
 numbering:{roleId:804,pairs:[{id:1105,role_id:804,permission_id:permissionsNow[4].id}]}}};}
const base=()=>({authId,owner:{companyId:901,branchId:902},storageYear:2026});
function source(){return {id:805,uploaded_by:903,session_code:n02.sessionCode,original_filename:n02.originalFilename,mime_type:n02.mime,file_size_bytes:sourceBytes().length,sha256_hash:sourceDigest(),temp_storage_path:n02.sourcePath,
 owning_company_id:901,owning_branch_id:902,is_duplicate:false,review_status:'not_started',status:'uploaded',intake_status:'uploaded',document_id:null as number|null,completed_at:null as string|null,expires_at:'2026-10-07T00:00:00Z',
 deleted_at:null,duplicate_document_id:null,ai_job_id:null,ai_result_id:null,batch_id:null,temp_cleaned_at:null,cleanup_error_message:null,error_message:null,reviewed_by:null,review_completed_at:null,review_started_at:null};}
const prepared=()=>({...resources(),profileId:903,uploadId:805,assignmentIds:{dms:904,numbering:905},source:source()});
function state(){return {roles:Object.entries(n02.roles).map(([key,mode]:[string,{roleCode:string;fullName:string;marker:string}])=>({id:key==='dms'?803:804,role_code:mode.roleCode,role_name:mode.fullName,notes:mode.marker,is_active:true,is_system_role:false,is_assignable:false})),pairs:[...resources().roles.dms.pairs,...resources().roles.numbering.pairs],
 auth:{id:authId,email:n02.email,marker:n02.marker,role:'authenticated',confirmed:true,banned:null as boolean|null},
 profiles:[{id:903,auth_user_id:authId,full_name:n02.fullName,display_name:n02.fullName,notes:n02.marker,owner_company_id:901,branch_id:902,status:'active',must_change_password:false}],
 assignments:[{id:904,user_profile_id:903,role_id:803,owner_company_id:901 as number|null,branch_id:902 as number|null,is_active:true},{id:905,user_profile_id:903,role_id:804,owner_company_id:null as number|null,branch_id:null as number|null,is_active:true}],
 sessions:[{id:sessionId,userId:authId}],refreshIds:['2001']};}
function objects(documentId?:number){const original={id:objectId,bucket_id:'dms-temp',name:n02.sourcePath,version:'source-v1',updated_at:time,metadata:{size:sourceBytes().length as number|string,mimetype:n02.mime}};
 return documentId?[original,{...original,id:destId,bucket_id:'dms-documents',name:destinationFor(base(),documentId),version:'destination-v1'}]:[original];}
function observed(){const documentNo='F06DMC-000041',fileName=expectedFileName(documentNo);return {
 documents:[{id:1301,document_no:documentNo,title:n02.title,document_type_id:802,category_id:801,status:'active',confidentiality_level:'internal',owner_user_id:903,owning_company_id:901,owning_branch_id:902,created_by:903,updated_by:903,current_version_id:1304,is_archived:false,archived_at:null as string|null,
  description:null,issue_date:null,expiry_date:null,party_id:null,reminder_policy_id:null,legacy_document_code:null,deleted_at:null}],
 references:[{id:1302,numbering_rule_id:701,generation_status:'consumed',target_table_name:'dms_documents',target_record_id:1301,generated_by:903,generated_reference_number:documentNo,generated_sequence_number:'41',sequence_state_id:1303,manual_override_used:false,reserved_at:time,consumed_at:time,reasonMatches:true}],
 requests:[{actor_id:903,operation_id:op,reference_id:1302,hashMatches:true}],
 versions:[{id:1304,document_id:1301,version_number:1,version_label:'v1',change_notes:'Initial upload',is_current:true,created_by:903}],
 files:[{id:1305,document_id:1301,version_id:1304,file_role:'original',storage_bucket:'dms-documents',storage_path:destinationFor(base(),1301),sha256_hash:sourceDigest(),file_size_bytes:sourceBytes().length,mime_type:n02.mime,created_by:903,deleted_at:null,file_name:fileName}],
 verified:[{actor_id:903,operation_id:op,document_id:1301,hashMatches:true,request_hash:'a'.repeat(64),upload_session_id:805,storage_path:destinationFor(base(),1301),content_sha256:sourceDigest(),file_size_bytes:sourceBytes().length,mime_type:n02.mime,file_name:fileName,verified_session_id:sessionId,object_id:destId,object_version:'destination-v1',object_updated_at:time}],
 completed:[{actor_id:903,operation_id:op,document_id:1301,hashMatches:true,request_hash:'a'.repeat(64),result:{documentId:1301,documentNo,upload_session_id:805,operation_id:op,completed:true,replayed:false}}],
 events:[['document_created',{operation_id:op,upload_session_id:805,attachment_complete:false}],['file_uploaded',{operation_id:op,file_id:1305,version_id:1304,version_number:1}],['version_uploaded',{operation_id:op,version_id:1304,version_number:1,is_current:true}]].map(([event_type,metadata_json],i)=>({id:1401+i,event_type,metadata_json,document_id:1301,performed_by:903})),
 audits:[...(['reserved','consumed'] as const).map((status,i)=>({id:1501+i,actor_user_profile_id:903,entity_name:'global_numbering_generated_references',entity_id:1302,entity_reference:documentNo,action:i?'update':'generate',new_values:{status,operation_id:op}})),
 {id:1503,actor_user_profile_id:903,entity_name:'dms_documents',entity_id:1301,entity_reference:documentNo,action:'create',new_values:{event:'document_retained_from_upload',operation_id:op,upload_session_id:805,attachment_complete:false}},
 {id:1504,actor_user_profile_id:903,entity_name:'dms_documents',entity_id:1301,entity_reference:documentNo,action:'update',new_values:{event:'document_upload_completed',operation_id:op,upload_session_id:805,version_id:1304,file_id:1305}}],
 sequences:[{id:1303,numbering_rule_id:701,reset_period_key:'GLOBAL',last_sequence_number:'41',next_sequence_number:'42',last_generated_reference:documentNo,updated_by:903}]};}
const read=(file:string)=>fs.readFileSync('tests/remediation/f06/'+file,'utf8');

describe('N02 closed role/source reservation',()=>{
 it('reserves one marker and only four scoped DMS capabilities plus independent numbering',()=>{
  expect(n02.marker).toBe('F06N02B0517');expect(n02.permissions).toEqual(['dms.documents.view','dms.documents.upload','dms.documents.edit','dms.documents.preview','numbering.rules.generate']);
  expect(n02.roles.numbering.permissions).toEqual(['numbering.rules.generate']);expect(n02.roles.dms.permissions).toHaveLength(4);expect(Object.isFrozen(n02.roles.dms.permissions)).toBe(true);
  expect(n02.roles.dms.marker).not.toBe(n02.roles.numbering.marker);expect(commands).toEqual(['resources-prepare','actor-source-prepare','observe-invalid','observe-completed','observe-retained','actor-retire','resources-retire']);
 });
 it('requires active exact canonical permissions and never auto-seeds inactive definitions',()=>{
  expect(validatePermissions(n02,permissions())).toEqual(permissions());const inactive=permissions();inactive[0].active=false;expect(()=>validatePermissions(n02,inactive)).toThrow('CANONICAL_PERMISSION_INACTIVE');expect(()=>validatePermissions(n02,permissions().slice(1))).toThrow();
 });
 it('two role creation statements do not collide on the generic marker guard',()=>{
  const d=roleCreateSql(n02.roles.dms,permissions().slice(0,4)),n=roleCreateSql(n02.roles.numbering,permissions().slice(4));expect(d).toContain("notes='F06N02B0517_DMS'");expect(n).toContain("notes='F06N02B0517_NUM'");expect(n).not.toContain("notes='F06N02B0517_DMS'");
 });
 it('excludes exactly both owned roles/pairs, not all baseline authority',()=>{
  const sql=identitySql(authId,resources());expect(sql).toContain('r.id not in (803,804)');expect(sql).toContain('r.role_id not in (803,804)');expect(sql).toContain('from public.permissions p');expect(sql).not.toContain('r.id<>803');
 });
 it('uses reserved ASCII text and deterministic source/path digest',()=>{
  expect(sourceDigest()).toBe(sha(sourceBytes()));expect(sourceBytes().length).toBeGreaterThan(0);expect(sourceBytes().length).toBeLessThan(200);expect(n02.sourcePath).toBe('F06N02B0517/source.txt');
  expect(prefixFor(base())).toBe('901/2026/F06N02B0517_TYPE/');expect(destinationFor(base(),1301)).toBe('901/2026/F06N02B0517_TYPE/1301/v1/original.txt');expect(()=>destinationFor(base(),0)).toThrow();expect(()=>prefixFor({...base(),storageYear:2026.5})).toThrow();
 });
 it('source scope comes from the profile trigger without a trusted scope reassignment',()=>{
  const sql=actorSourceSql(base(),resources(),903);expect(sql).toContain('owner_company_id=901,branch_id=902');expect(sql).toContain('values(903,803,901,902,true)');expect(sql).toContain('values(903,804,null,null,true)');
  expect(sql).toContain("'uploaded','uploaded','not_started'");expect(sql).toContain("clock_timestamp()+interval '2 days'");expect(sql).not.toContain('update public.dms_upload_sessions');
  expect(sql).not.toMatch(/insert into public\.dms_ai_|insert into public\.dms_intake_/);
 });
 it('enables only an owned rule flag without resetting counters or creating a canonical rule',()=>{
  const sql=resourceCreateSql(rule());expect(sql).toContain('RESOURCE_PREIMAGE_CHANGED');expect(sql).toContain('set is_active=true where id=701');expect(sql).not.toMatch(/insert into public\.global_numbering|set (?:next|current)_sequence/);expect(resourceCreateSql({...rule(),is_active:true})).not.toContain('set is_active=true');
 });
 it('accepts one exact branch-role plus global-numbering assignment and rejects swaps/extra rights',()=>{
  expect(()=>assertRoles(state(),resources())).not.toThrow();expect(()=>assertActor(state(),base(),prepared())).not.toThrow();
  const globalDms=state();globalDms.assignments[0].owner_company_id=null;globalDms.assignments[0].branch_id=null;expect(()=>assertActor(globalDms,base(),prepared())).toThrow();
  const scopedNumber=state();scopedNumber.assignments[1].owner_company_id=901;expect(()=>assertActor(scopedNumber,base(),prepared())).toThrow();const extra=state();extra.assignments.push({...extra.assignments[0],id:999});expect(()=>assertActor(extra,base(),prepared())).toThrow();
 });
 it('checks the exact source, no AI/batch/duplicate bindings and real lifecycle transitions',()=>{
  expect(assertSource([source()],base(),prepared())).toEqual(source());const ai={...source(),ai_result_id:999};expect(()=>assertSource([ai],base(),prepared())).toThrow();expect(()=>assertSource([{...source(),intake_status:'review_pending'}],base(),prepared())).toThrow();
  const complete={...source(),document_id:1301,status:'completed',completed_at:time};expect(()=>assertSource([complete],base(),prepared(),{documentId:1301})).not.toThrow();
  expect(()=>assertSource([{...complete,status:'cancelled',intake_status:'discarded'}],base(),prepared(),{documentId:1301,retired:true})).not.toThrow();expect(()=>assertSource([source(),source()],base(),prepared())).toThrow('EXACT_SOURCE_REQUIRED');
 });
 it('builds exact normalized request without optional nulls, destination override or mutable status',()=>{
  const request=expectedRequest(base(),resources(),prepared());expect(request).toMatchObject({uploadSessionId:805,title:n02.title,document_type_id:802,allowDuplicate:false,prepared:{content_sha256:sourceDigest(),storage_year:2026,type:{category_id:801,default_confidentiality:'internal',requires_expiry_tracking:false}}});
  expect(Object.keys(request).sort()).toEqual(['allowDuplicate','document_type_id','prepared','title','uploadSessionId'].sort());expect(request.prepared.source).not.toHaveProperty('status');expect(request.prepared.source).not.toHaveProperty('document_id');
 });
 it('private STANDARD bucket admission rejects missing, public or wrong-type buckets',()=>{
  const buckets=[{id:'dms-documents',public:false,type:'STANDARD'},{id:'dms-temp',public:false,type:'STANDARD'}];expect(assertBuckets(buckets)).toEqual(buckets);expect(()=>assertBuckets(buckets.slice(1))).toThrow();expect(()=>assertBuckets([{...buckets[0],public:true},buckets[1]])).toThrow();expect(()=>assertBuckets([{...buckets[0],type:'ANALYTICS'},buckets[1]])).toThrow();
 });
});

describe('exact N02 observer/history',()=>{
 it('requires zero consumer effects for the required-field observation',()=>{
  const empty={...observed(),documents:[],references:[],requests:[],versions:[],files:[],events:[],audits:[],verified:[],completed:[]};expect(assertObservation(empty,base(),resources(),prepared(),{empty:true})).toBeNull();expect(()=>assertObservation(observed(),base(),resources(),prepared(),{empty:true})).toThrow();
 });
 it('binds exactly one completed scoped consumer, three events and four audits',()=>{
  expect(assertObservation(observed(),base(),resources(),prepared())).toEqual({documentId:1301,documentNo:'F06DMC-000041',referenceId:1302,operationId:op,versionId:1304,fileId:1305,sequenceId:1303,eventIds:[1401,1402,1403],auditIds:[1501,1502,1503,1504],destination:destinationFor(base(),1301),verifiedSessionId:sessionId});
 });
 it.each(['documents','references','requests','versions','files','events','audits','verified','completed'])('rejects extra %s instead of broad marker adoption',key=>{
  const value=observed() as unknown as Record<string,unknown[]>;value[key].push({...value[key][0] as object});expect(()=>assertObservation(value,base(),resources(),prepared())).toThrow();
 });
 it('rejects hash, source, destination, actor, standard filename and fabricated completion mismatches',()=>{
  const h=observed();h.requests[0].hashMatches=false;expect(()=>assertObservation(h,base(),resources(),prepared())).toThrow();const r=observed();r.references[0].reasonMatches=false;expect(()=>assertObservation(r,base(),resources(),prepared())).toThrow();
  const s=observed();s.verified[0].upload_session_id=999;expect(()=>assertObservation(s,base(),resources(),prepared())).toThrow();const d=observed();d.documents[0].owning_branch_id=999;expect(()=>assertObservation(d,base(),resources(),prepared())).toThrow();
  const a=observed();a.files[0].created_by=999;expect(()=>assertObservation(a,base(),resources(),prepared())).toThrow();const f=observed();f.files[0].file_name='wrong.txt';f.verified[0].file_name='wrong.txt';expect(()=>assertObservation(f,base(),resources(),prepared())).toThrow();
  const c=observed();c.completed[0].result.completed=false;expect(()=>assertObservation(c,base(),resources(),prepared())).toThrow();
 });
 it('matches exact source and destination UUID/version/full database timestamp and strict metadata',()=>{
  expect(assertStorage(objects(),base()).source.id).toBe(objectId);expect(assertStorage(objects(1301),base(),observed()).destination.id).toBe(destId);
  for(const field of ['id','version','updated_at']){const value=objects(1301);value[1][field]='different';expect(()=>assertStorage(value,base(),observed())).toThrow();}
  const extra=objects(1301);extra.push({...extra[0],name:'foreign.txt'});expect(()=>assertStorage(extra,base(),observed())).toThrow('EXACT_OBJECT_SET_REQUIRED');
  const metadata=objects()[0];metadata.metadata.size='0x'+sourceBytes().length.toString(16);expect(()=>assertObject(metadata,'dms-temp',n02.sourcePath)).toThrow();
 });
 it('permits archiving only with full retained versions/files/private history',()=>{
  const value=observed();value.documents[0].is_archived=true;value.documents[0].archived_at=time;expect(()=>assertObservation(value,base(),resources(),prepared(),{archived:true})).not.toThrow();value.files=[];expect(()=>assertObservation(value,base(),resources(),prepared(),{archived:true})).toThrow();
 });
 it('preserves the reviewed selected-sequence rule including future immutable columns',()=>{
  const after={...observed().sequences[0],created_by:77,future:'preserve'},before={...after,last_sequence_number:'40',next_sequence_number:'41',last_generated_reference:'F06DMC-000040',updated_by:77};
  expect(()=>assertSequenceHistoryPreserved([before],[after],1303)).not.toThrow();expect(()=>assertSequenceHistoryPreserved([before],[{...after,future:'changed'}],1303)).toThrow();expect(()=>assertSequenceHistoryPreserved([],[after,{...after,id:1999}],1303)).toThrow();
 });
 it('SQL hashes exact prepared request and includes all own source/proof/child observations',()=>{
  const sql=observationSql(base(),resources(),prepared());for(const term of ['F06 upload creation ','hashMatches','reasonMatches','upload_verified_copies','upload_creation_completions',"jsonb_build_array(null,'MASTER_DMS_DOCUMENT',null,'reserved','dms_documents',null",'where actor_id=903'])expect(sql).toContain(term);
  expect(sql).toContain('or upload_session_id=805');expect(sql).toContain('document_type_id=802');
 });
 it('baseline excludes exact known object names, never the destination prefix',()=>{
  const before=businessSql(base(),701,resources(),prepared()),after=businessSql(base(),701,resources(),prepared(),{documentId:1301});expect(before).toContain("name='F06N02B0517/source.txt'");expect(before).not.toContain("name='901/2026/F06N02B0517_TYPE/");
  expect(after).toContain("name='901/2026/F06N02B0517_TYPE/1301/v1/original.txt'");expect(after).not.toMatch(/\blike\b|left\(name/);for(const table of ['storage.buckets','public.dms_intake_review_values','public.dms_review_queue','public.erp_email_queue'])expect(after).toContain(table);
 });
 it('retires only captured Auth sessions after ban and retains business/Storage history',()=>{
  expect(()=>actorRetireSql(base(),prepared(),state())).toThrow();const banned=state();banned.auth.banned=true;const sql=actorRetireSql(base(),prepared(),banned);expect(sql).toContain("id in ('2001')");expect(sql).toContain(`id in ('${sessionId}')`);expect(sql).not.toMatch(/delete from public\.|delete from storage\.|delete from auth\.(users|identities)/);
  const retire=resourceRetireSql(base(),resources(),prepared(),observed());expect(retire).toContain('set is_archived=true');expect(retire).toContain("set status='cancelled',intake_status='discarded'");expect(retire).toContain('set is_active=false where id=701');expect(retire).not.toMatch(/delete\s+from|truncate|cascade|set (?:current|next)_sequence|update public\.permissions/);
 });
 it('full-row preservation fails for non-whitelisted state changes',()=>{
  expect(()=>preserveExcept({id:1,status:'completed',next:2},{id:1,status:'cancelled',next:2},['status'],'unexpected')).not.toThrow();expect(()=>preserveExcept({id:1,status:'completed',next:2},{id:1,status:'cancelled',next:3},['status'],'unexpected')).toThrow('unexpected');
 });
});

describe('source-only runtime boundary',()=>{
 const runtime=read('n02-browser-runtime.mjs'),fixture=read('n02-browser-fixture.mjs'),checker=read('n02-browser-resource-check.mjs'),contract=read('n02-browser-contract.mjs');
 it('pins unchanged reviewed pure dependencies and keeps source bundle separate from content hash',()=>{
  expect(runtime).toContain('0133e989085edece067a45e6bd97bd1980411cc0525ef4ce64d84260ff8a32ed');expect(runtime).toContain('21394d4a60a74ea54307ecfcd714a12bda5801d180fea5144437b8758c040aa1');
  expect(runtime).toContain('sourceContentSha256:sourceDigest()');expect(runtime).not.toContain('sourceSha256:sourceDigest()');expect(runtime).toContain('REVIEWED_N02_SOURCE_REQUIRED');
 });
 it('uses the exact main supplied local pins and active canonical preflight before any journaling',()=>{
  for(const term of ['c:/dev/agt-erp-f06','68ba17ecef10f3f77ae563b68d68bd146331bf844eeb735a3dae0d7831fd1d0c','sha256:21ab971149317ea9cd12a8126fe4ebb34def08c8972956b0958cba0924409dab','2026-10-04T09:36:19.169643508Z','http://127.0.0.1:16621','16622','project-ref','protected-local-parent'])expect(runtime).toContain(term);
  expect(runtime.indexOf('validatePermissions(n02')).toBeLessThan(runtime.indexOf('function start('));expect(runtime).toContain('EXACT_BUCKET_PROVENANCE_REQUIRED');expect(runtime).toContain('EXACT_BUCKET_INTENT_REQUIRED');expect(runtime).toContain('STORAGE_SECURITY_CHANGED');
 });
 it('has factories and direct entry guards, no actual/runtime imports from offline contracts',()=>{
  expect(runtime.indexOf('fs.readFileSync')).toBeGreaterThan(runtime.indexOf('export function openN02Runtime'));expect(runtime).toContain("await import('@supabase/supabase-js')");
  for(const source of [fixture,checker])expect(source).toContain('pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url');
  for(const source of [runtime,fixture,checker,contract])expect(source).not.toMatch(/from ['"].*(?:local-db|local\.test|fixtures\.mjs|n01-browser-runtime|n01-browser-fixture)/);
 });
 it('allows only one source POST without overwrite and exact object GETs; no provider or destination writer',()=>{
  for(const term of ['EXACT_LOCAL_API_ALLOWLIST_ONLY','NO_SOURCE_RETRY',"get('x-upsert'),'false'","command,'actor-source-prepare'","redirect:'error'",'AbortSignal.timeout(15000)'])expect(runtime).toContain(term);
  expect(runtime).toContain(".upload(n02.sourcePath,sourceBytes(),{contentType:n02.mime,upsert:false})");expect(runtime).not.toMatch(/\.remove\(|\.updateBucket\(|\.createBucket\(|\.rpc\(|sendEmail|resetPasswordForEmail/);
 });
 it('observer database calls are read-only and checker makes no Storage/Auth request or repair',()=>{
  expect(runtime).toContain('N02_OBSERVER_CHECKER_IS_READ_ONLY');expect(fixture).toContain("openN02Runtime({readOnly:command.startsWith('observe-')})");expect(checker).toContain('openN02Runtime({readOnly:true})');
  for(const term of ['.sql(','.verifyBytes(','.uploadSource(','.authAdmin(','runN02Fixture'])expect(checker).not.toContain(term);
  expect(checker).toContain('historicalByteProofsCaptured:true,currentByteDownload:false');expect(checker).toContain('responseLossTested:false,replayClaim:false,browserPassClaim:false');
 });
 it('preserves one-shot failures, intents before writes and the original private ledger',()=>{
  for(const term of ['ORIGINAL_LEDGER_CHANGED','FAILED_OUTCOME_REQUIRES_MAIN_RECONCILIATION','previousEventHash',"fs.openSync(lifetimeLock,'wx',0o600)","command+'-attempt-private.json'",'noAutomaticRetry:true'])expect(runtime).toContain(term);
  expect(fixture.indexOf("rt.append('source-upload-intent'")).toBeLessThan(fixture.indexOf('await rt.uploadSource(base)'));expect(fixture).toContain('RESERVED_SOURCE_AND_DESTINATION_PREFIX_MUST_BE_EMPTY');
  for(const source of [runtime,fixture,checker,contract])expect(source).not.toMatch(/writeFileSync|insert into public\.permissions|update public\.permissions|alter policy|disable trigger|signInWithPassword/);
 });
 it('retirement/checker bind exact identities, history, byte observations and unchanged security',()=>{
  for(const term of ['RETAINED_COMPLETION_HISTORY_CHANGED','EXACT_PERMISSION_PAIRS_CHANGED','VERIFICATION_SESSION_WAS_NOT_OBSERVED','source-upload-intent','source-upload-returned','storageSecuritySql()','assertSequenceHistoryPreserved','PASS_EXACT_N02_RESOURCES_ONLY','repairs:0'])expect(checker).toContain(term);
  expect(fixture).toContain('rt.completed(\'actor-retire\')');expect(fixture).toContain('MAIN_RANDOM_PASSWORD_REQUIRED');expect(fixture).toContain('sendsEmail:false');expect(fixture).not.toMatch(/rt\.append\([^\n]*password/);
 });
 it('all public table references exist in generated source and scope columns have explicit F03 provenance',()=>{
  const database=fs.readFileSync('src/types/database.ts','utf8'),sql=[actorSourceSql(base(),resources(),903),businessSql(base(),701,resources(),prepared()),observationSql(base(),resources(),prepared()),resourceRetireSql(base(),resources(),prepared(),observed())].join('\n');
  for(const table of new Set([...sql.matchAll(/(?:from|into|update|join) public\.([a-z_]+)/gi)].map(m=>m[1])))expect(database).toContain('      '+table+': {');
  const migration=fs.readFileSync('supabase/migrations/20260924113604_f03_unlinked_upload_admission.sql','utf8');expect(migration).toContain('SELECT owner_company_id,branch_id INTO NEW.owning_company_id,NEW.owning_branch_id');
  const upload=database.split('      dms_upload_sessions: {')[1].split('        Insert: {')[0];for(const field of ['expires_at','status','intake_status','review_status','sha256_hash','temp_storage_path'])expect(upload).toContain('          '+field+':');
 });
 it.each(['n02-browser-contract.mjs','n02-browser-runtime.mjs','n02-browser-fixture.mjs','n02-browser-resource-check.mjs'])('parses %s without importing its runtime',file=>{
  const parsed=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);expect((parsed as unknown as {parseDiagnostics:unknown[]}).parseDiagnostics).toEqual([]);
 });
 it('taxonomy strictness retains non-system internal no-expiry/no-approval defaults',()=>{
  const value={category:{id:801,category_code:n02.categoryCode,name_en:n02.marker+' category',is_active:true,is_system:false,deleted_at:null},type:{id:802,type_code:n02.typeCode,name_en:n02.marker+' type',category_id:801,is_active:true,is_system:false,deleted_at:null,default_confidentiality:'internal',requires_expiry_tracking:false,is_renewable:false,requires_approval:false}};
  expect(()=>assertTaxonomy(value,resources())).not.toThrow();value.type.requires_approval=true;expect(()=>assertTaxonomy(value,resources())).toThrow();
 });
});
