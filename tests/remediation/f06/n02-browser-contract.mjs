// Pure finite N02 contracts: no file/process/network effects on import.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {id,uuid,quote,projectionSql} from './scoped-browser-contract.mjs';
export {id,uuid,quote,fixtureOwner,ownerSql,permissionsSql,validatePermissions,roleCreateSql,assertPreserved} from './scoped-browser-contract.mjs';
export {decimal,ownedRule,ruleSql,assertNumberingProgress,assertSequenceHistoryPreserved} from './n01-browser-contract.mjs';
import {decimal} from './n01-browser-contract.mjs';

const marker='F06N02B0517';
const dmsPermissions=Object.freeze(['dms.documents.view','dms.documents.upload','dms.documents.edit','dms.documents.preview']);
const numberPermissions=Object.freeze(['numbering.rules.generate']);
export const n02=Object.freeze({marker,email:'f06n02b0517@example.invalid',fullName:'F06 synthetic browser '+marker,
 title:marker+' uploaded document',categoryCode:marker+'_CAT',typeCode:marker+'_TYPE',sessionCode:marker+'S1',
 originalFilename:marker+'-source.txt',sourcePath:marker+'/source.txt',mime:'text/plain',
 sourceText:'Synthetic F06 N02 browser acceptance. No personal or business data. '+marker+'\n',
 permissions:Object.freeze([...dmsPermissions,...numberPermissions]),
 roles:Object.freeze({dms:Object.freeze({marker:marker+'_DMS',roleCode:'f06n02b0517_dms',fullName:marker+' scoped DMS',permissions:dmsPermissions}),
 numbering:Object.freeze({marker:marker+'_NUM',roleCode:'f06n02b0517_numbering',fullName:marker+' global numbering',permissions:numberPermissions})})});
export const commands=Object.freeze(['resources-prepare','actor-source-prepare','observe-invalid','observe-completed','observe-retained','actor-retire','resources-retire']);
export const sha=value=>createHash('sha256').update(value).digest('hex');
export const sourceBytes=()=>Buffer.from(n02.sourceText,'utf8');
export const sourceDigest=()=>sha(sourceBytes());
const json=value=>quote(JSON.stringify(value))+'::jsonb';
export const roleIds=resources=>Object.values(resources.roles).map(role=>id(role.roleId)).sort((a,b)=>a-b);
export const prefixFor=base=>{id(base.owner.companyId);assert.ok(Number.isInteger(base.storageYear)&&base.storageYear>=2000&&base.storageYear<=9999);return `${base.owner.companyId}/${base.storageYear}/${n02.typeCode}/`;};
export const destinationFor=(base,documentId)=>prefixFor(base)+id(documentId)+'/v1/original.txt';
export function expectedFileName(documentNo){assert.match(documentNo,/^F06DMC-[0-9]{6,16}$/);return `F06n02b0517_Type_Unknown_owner_${documentNo}_NoExpiry.txt`;}

// Preserve the reviewed projection, changing only its two exact exclusion sets.
export function identitySql(authId,resources=null){
 if(!resources)return projectionSql(authId);
 const ids=roleIds(resources),sql=projectionSql(authId,ids[0]);
 assert.equal((sql.match(new RegExp(`r.id<>${ids[0]}`,'g'))??[]).length,1);
 assert.equal((sql.match(new RegExp(`r.role_id<>${ids[0]}`,'g'))??[]).length,1);
 return sql.replace(`r.id<>${ids[0]}`,`r.id not in (${ids.join(',')})`).replace(`r.role_id<>${ids[0]}`,`r.role_id not in (${ids.join(',')})`);
}
export function resourceCreateSql(rule){
 id(rule.id);assert.equal(typeof rule.is_active,'boolean');
 return `do $guard$ begin perform 1 from public.global_numbering_rules where id=${rule.id} for update;end $guard$;
 lock table public.dms_document_categories,public.dms_document_types in share row exclusive mode;
 do $guard$ begin if exists(select 1 from public.dms_document_categories where category_code=${quote(n02.categoryCode)})
 or exists(select 1 from public.dms_document_types where type_code=${quote(n02.typeCode)})
 or not exists(select 1 from public.global_numbering_rules r where id=${rule.id} and
 (to_jsonb(r)||jsonb_build_object('current_sequence_number',current_sequence_number::text,'next_sequence_number',next_sequence_number::text,'workspace_revision',workspace_revision::text))=${json(rule)})
 then raise exception 'RESOURCE_PREIMAGE_CHANGED';end if;end $guard$;
 ${rule.is_active?'':`update public.global_numbering_rules set is_active=true where id=${rule.id} and rule_code='MASTER_DMS_DOCUMENT' and not is_active;`}
 with c as(insert into public.dms_document_categories(category_code,name_en,is_system,is_active)
 values(${quote(n02.categoryCode)},${quote(marker+' category')},false,true) returning id),
 t as(insert into public.dms_document_types(type_code,name_en,category_id,is_system,is_active,default_confidentiality,requires_expiry_tracking,is_renewable,requires_approval)
 select ${quote(n02.typeCode)},${quote(marker+' type')},id,false,true,'internal',false,false,false from c returning id)
 select jsonb_build_object('categoryId',(select id from c),'typeId',(select id from t));`;
}
export function taxonomySql(resources){return `select jsonb_build_object('category',(select to_jsonb(c) from public.dms_document_categories c where id=${id(resources.categoryId)}),
 'type',(select to_jsonb(t) from public.dms_document_types t where id=${id(resources.typeId)}));`;}
export function assertTaxonomy(value,resources,active=true){
 for(const [key,column,code] of [['category','category_code',n02.categoryCode],['type','type_code',n02.typeCode]]){
  const row=value[key];assert.equal(row?.id,id(resources[key+'Id']));assert.equal(row[column],code);assert.equal(row.name_en,marker+' '+key);
  assert.equal(row.is_active,active);assert.equal(row.is_system,false);assert.equal(row.deleted_at,null);
 }
 assert.equal(value.type.category_id,resources.categoryId);assert.equal(value.type.default_confidentiality,'internal');
 for(const key of ['requires_expiry_tracking','is_renewable','requires_approval'])assert.equal(value.type[key],false);
}
export function actorStateSql(base,resources){
 uuid(base.authId);const ids=roleIds(resources).join(',');return `select jsonb_build_object(
 'roles',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from public.roles r where id in (${ids})),
 'pairs',(select coalesce(jsonb_agg(to_jsonb(r) order by role_id,permission_id),'[]') from public.role_permissions r where role_id in (${ids})),
 'auth',(select jsonb_build_object('id',id,'email',email,'confirmed',email_confirmed_at is not null,'banned',banned_until>now(),'marker',raw_app_meta_data->>'f06_marker','role',role) from auth.users where id=${quote(base.authId)}::uuid),
 'profiles',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from public.user_profiles p where auth_user_id=${quote(base.authId)}::uuid),
 'assignments',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from public.user_roles a where role_id in (${ids}) or user_profile_id in(select id from public.user_profiles where auth_user_id=${quote(base.authId)}::uuid)),
 'sessions',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'userId',user_id) order by id),'[]') from auth.sessions where user_id=${quote(base.authId)}::uuid),
 'refreshIds',(select coalesce(jsonb_agg(id::text order by id),'[]') from auth.refresh_tokens where user_id=${quote(base.authId)}));`;
}
export function assertRoles(state,resources,active=true){
 assert.equal(state.roles.length,2);assert.equal(state.pairs.length,5);
 for(const [key,mode] of Object.entries(n02.roles)){
  const own=resources.roles[key],row=state.roles.find(r=>r.id===id(own.roleId));assert.ok(row);
  for(const [column,value] of Object.entries({role_code:mode.roleCode,role_name:mode.fullName,notes:mode.marker,is_active:active,is_system_role:false,is_assignable:false}))assert.equal(row[column],value);
  assert.deepEqual(state.pairs.filter(p=>p.role_id===row.id).map(p=>({id:p.id,role_id:p.role_id,permission_id:p.permission_id})),own.pairs);
 }
}
export function assertActor(state,base,prepared,retired=false){
 assert.equal(state.auth?.id,uuid(base.authId));assert.equal(state.auth.email,n02.email);assert.equal(state.auth.marker,marker);assert.equal(state.auth.role,'authenticated');assert.equal(state.auth.confirmed,true);
 if(retired)assert.equal(state.auth.banned,true);else assert.notEqual(state.auth.banned,true);
 assert.equal(state.profiles.length,1);const p=state.profiles[0];assert.equal(p.id,id(prepared.profileId));assert.equal(p.auth_user_id,base.authId);
 for(const field of ['full_name','display_name'])assert.equal(p[field],n02.fullName);assert.equal(p.notes,marker);assert.equal(p.owner_company_id,base.owner.companyId);assert.equal(p.branch_id,base.owner.branchId);
 assert.equal(p.status,retired?'inactive':'active');assert.equal(p.must_change_password,false);assert.equal(state.assignments.length,2);
 for(const key of ['dms','numbering']){const a=state.assignments.find(a=>a.id===id(prepared.assignmentIds[key]));assert.ok(a);assert.equal(a.user_profile_id,p.id);assert.equal(a.role_id,prepared.roles[key].roleId);
  assert.equal(a.owner_company_id,key==='dms'?base.owner.companyId:null);assert.equal(a.branch_id,key==='dms'?base.owner.branchId:null);assert.equal(a.is_active,!retired);}
 for(const s of state.sessions){assert.equal(s.userId,base.authId);assert.match(s.id,/^[0-9a-f-]{36}$/i);}
 if(retired){assert.deepEqual(state.sessions,[]);assert.deepEqual(state.refreshIds,[]);}
}
export function actorSourceSql(base,resources,profileId){
 uuid(base.authId);id(profileId);const ids=roleIds(resources);id(base.owner.companyId);id(base.owner.branchId);
 return `do $guard$ begin if (select count(*) from public.user_profiles where id=${profileId} and auth_user_id=${quote(base.authId)}::uuid and full_name=${quote(n02.fullName)})<>1
 or exists(select 1 from public.user_roles where user_profile_id=${profileId} or role_id in (${ids.join(',')}))
 or exists(select 1 from public.dms_upload_sessions where session_code=${quote(n02.sessionCode)} or temp_storage_path=${quote(n02.sourcePath)})
 then raise exception 'ACTOR_SOURCE_PREIMAGE_CHANGED';end if;end $guard$;
 update public.user_profiles set full_name=${quote(n02.fullName)},display_name=${quote(n02.fullName)},notes=${quote(marker)},status='active',must_change_password=false,
 owner_company_id=${base.owner.companyId},branch_id=${base.owner.branchId} where id=${profileId} and auth_user_id=${quote(base.authId)}::uuid;
 with d as(insert into public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active) values(${profileId},${resources.roles.dms.roleId},${base.owner.companyId},${base.owner.branchId},true) returning id),
 n as(insert into public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active) values(${profileId},${resources.roles.numbering.roleId},null,null,true) returning id)
 select jsonb_build_object('profileId',${profileId},'assignmentIds',jsonb_build_object('dms',(select id from d),'numbering',(select id from n)));
 insert into public.dms_upload_sessions(session_code,status,intake_status,review_status,original_filename,mime_type,file_size_bytes,sha256_hash,temp_storage_path,uploaded_by,is_duplicate,expires_at)
 values(${quote(n02.sessionCode)},'uploaded','uploaded','not_started',${quote(n02.originalFilename)},${quote(n02.mime)},${sourceBytes().length},${quote(sourceDigest())},${quote(n02.sourcePath)},${profileId},false,clock_timestamp()+interval '2 days') returning jsonb_build_object('uploadId',id);`;
}
export function sourceSql(prepared){return `select coalesce(jsonb_agg(to_jsonb(s) order by id),'[]') from public.dms_upload_sessions s where id=${id(prepared.uploadId)} or uploaded_by=${id(prepared.profileId)} or session_code=${quote(n02.sessionCode)} or temp_storage_path=${quote(n02.sourcePath)};`;}
export function assertSource(rows,base,prepared,{documentId=null,retired=false}={}){
 assert.equal(rows.length,1,'EXACT_SOURCE_REQUIRED');const s=rows[0];assert.equal(s.id,id(prepared.uploadId));assert.equal(s.uploaded_by,id(prepared.profileId));
 for(const [key,value] of Object.entries({session_code:n02.sessionCode,original_filename:n02.originalFilename,mime_type:n02.mime,file_size_bytes:sourceBytes().length,sha256_hash:sourceDigest(),temp_storage_path:n02.sourcePath,
  owning_company_id:base.owner.companyId,owning_branch_id:base.owner.branchId,is_duplicate:false,review_status:'not_started'}))assert.equal(s[key],value,'SOURCE_CHANGED:'+key);
 for(const key of ['deleted_at','duplicate_document_id','ai_job_id','ai_result_id','batch_id','temp_cleaned_at','cleanup_error_message','error_message','reviewed_by','review_completed_at','review_started_at'])assert.equal(s[key],null,'UNEXPECTED_SOURCE_EFFECT:'+key);
 assert.equal(s.document_id,documentId);assert.equal(s.status,retired?'cancelled':documentId===null?'uploaded':'completed');assert.equal(s.intake_status,retired?'discarded':'uploaded');
 assert.equal(s.completed_at!==null,documentId!==null);assert.ok(s.expires_at);return s;
}
export function expectedRequest(base,resources,prepared){
 const source=prepared.source;const keys=['id','session_code','uploaded_by','owning_company_id','owning_branch_id','temp_storage_path','original_filename','mime_type','file_size_bytes','sha256_hash'];
 return {uploadSessionId:id(prepared.uploadId),title:n02.title,document_type_id:id(resources.typeId),allowDuplicate:false,
  prepared:{source:Object.fromEntries(keys.map(key=>[key,source[key]])),type:{id:resources.typeId,category_id:id(resources.categoryId),type_code:n02.typeCode,default_confidentiality:'internal',requires_expiry_tracking:false},storage_year:base.storageYear,content_sha256:sourceDigest()}};
}
export function storageSql(base){return `select coalesce(jsonb_agg(to_jsonb(o)-'last_accessed_at' order by bucket_id,name),'[]') from storage.objects o where
 (bucket_id='dms-temp' and name=${quote(n02.sourcePath)}) or (bucket_id='dms-documents' and left(name,${prefixFor(base).length})=${quote(prefixFor(base))});`;}
export const bucketSql=()=>`select coalesce(jsonb_agg(to_jsonb(b) order by id),'[]') from storage.buckets b where id in ('dms-temp','dms-documents');`;
export const storageSecuritySql=()=>`select jsonb_build_object('policies',(select md5(coalesce(jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname),'[]')::text) from pg_policies p where schemaname='storage'),
 'tables',(select jsonb_agg(jsonb_build_object('table',c.relname,'owner',r.rolname,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'acl',c.relacl::text) order by c.relname)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles r on r.oid=c.relowner where n.nspname='storage' and c.relname in ('objects','buckets')));`;
export function assertBuckets(rows){assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.id),['dms-documents','dms-temp']);for(const row of rows){assert.equal(row.public,false);assert.equal(row.type,'STANDARD');}return rows;}
export function assertObject(row,bucket,path){
 assert.equal(row?.bucket_id,bucket);assert.equal(row.name,path);assert.match(row.id,/^[0-9a-f-]{36}$/i);assert.equal(typeof row.version,'string');assert.ok(row.version);assert.ok(row.updated_at);
 assert.equal(String(row.metadata?.size),String(sourceBytes().length));assert.equal(row.metadata?.mimetype,n02.mime);return row;
}
export function observationSql(base,resources,prepared){
 const actor=id(prepared.profileId),req=json(expectedRequest(base,resources,prepared));const digest=`encode(sha256(convert_to((${req})::text,'UTF8')),'hex')`;
 const docs=`select id from public.dms_documents where created_by=${actor} or title=${quote(n02.title)} or document_type_id=${id(resources.typeId)} or category_id=${id(resources.categoryId)}`;
 return `select jsonb_build_object(
 'documents',(select coalesce(jsonb_agg(to_jsonb(d) order by id),'[]') from public.dms_documents d where id in (${docs})),
 'references',(select coalesce(jsonb_agg(to_jsonb(g)||jsonb_build_object('generated_sequence_number',generated_sequence_number::text,'reasonMatches',generation_reason='F06 upload creation '||${digest}) order by id),'[]') from public.global_numbering_generated_references g where generated_by=${actor}),
 'requests',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('hashMatches',request_hash=md5(jsonb_build_array(null,'MASTER_DMS_DOCUMENT',null,'reserved','dms_documents',null,'F06 upload creation '||${digest})::text)) order by operation_id),'[]') from erp_private.numbering_requests r where actor_id=${actor}),
 'versions',(select coalesce(jsonb_agg(to_jsonb(v) order by id),'[]') from public.dms_document_versions v where document_id in (${docs}) or created_by=${actor}),
 'files',(select coalesce(jsonb_agg(to_jsonb(f) order by id),'[]') from public.dms_document_files f where document_id in (${docs}) or created_by=${actor}),
 'events',(select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') from public.dms_document_events e where document_id in (${docs}) or performed_by=${actor}),
 'audits',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from public.audit_logs a where actor_user_profile_id=${actor} or (entity_name='dms_documents' and entity_id in (${docs})) or (entity_name='global_numbering_generated_references' and entity_id in(select id from public.global_numbering_generated_references where generated_by=${actor}))),
 'verified',(select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('hashMatches',request_hash=${digest}) order by operation_id),'[]') from erp_private.upload_verified_copies p where actor_id=${actor} or upload_session_id=${id(prepared.uploadId)} or document_id in (${docs})),
 'completed',(select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('hashMatches',request_hash=${digest}) order by operation_id),'[]') from erp_private.upload_creation_completions p where actor_id=${actor} or document_id in (${docs})),
 'sequences',(select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('last_sequence_number',last_sequence_number::text,'next_sequence_number',next_sequence_number::text) order by id),'[]') from public.global_numbering_sequence_states s where numbering_rule_id=${id(resources.rule.id)}));`;
}
export function assertObservation(value,base,resources,prepared,{empty=false,archived=false}={}){
 for(const key of ['documents','references','requests','versions','files','events','audits','verified','completed','sequences'])assert.ok(Array.isArray(value[key]));
 if(empty){for(const key of ['documents','references','requests','versions','files','events','audits','verified','completed'])assert.deepEqual(value[key],[],'UNEXPECTED_N02_EFFECT:'+key);return null;}
 for(const key of ['documents','references','requests','versions','files','verified','completed'])assert.equal(value[key].length,1,'EXACT_ONE_REQUIRED:'+key);
 assert.equal(value.events.length,3);assert.equal(value.audits.length,4);const d=value.documents[0],g=value.references[0],r=value.requests[0],v=value.versions[0],f=value.files[0],p=value.verified[0],c=value.completed[0],actor=id(prepared.profileId);
 for(const row of [d,g,v,f])id(row.id);uuid(r.operation_id);assert.equal(r.actor_id,actor);assert.equal(r.reference_id,g.id);assert.equal(r.hashMatches,true);assert.equal(g.reasonMatches,true);
 for(const [key,expected] of Object.entries({title:n02.title,document_type_id:resources.typeId,category_id:resources.categoryId,status:'active',confidentiality_level:'internal',owner_user_id:actor,owning_company_id:base.owner.companyId,owning_branch_id:base.owner.branchId,created_by:actor,updated_by:actor,current_version_id:v.id,is_archived:archived}))assert.equal(d[key],expected,'DOCUMENT_CHANGED:'+key);
 for(const key of ['description','issue_date','expiry_date','party_id','reminder_policy_id','legacy_document_code','deleted_at'])assert.equal(d[key],null);assert.equal(d.archived_at!==null,archived);
 assert.equal(g.numbering_rule_id,resources.rule.id);assert.equal(g.generation_status,'consumed');assert.equal(g.target_table_name,'dms_documents');assert.equal(g.target_record_id,d.id);assert.equal(g.generated_by,actor);assert.equal(g.generated_reference_number,d.document_no);assert.equal(g.manual_override_used,false);assert.ok(g.reserved_at);assert.ok(g.consumed_at);
 for(const [key,expected] of Object.entries({document_id:d.id,version_number:1,version_label:'v1',change_notes:'Initial upload',is_current:true,created_by:actor}))assert.equal(v[key],expected);
 for(const [key,expected] of Object.entries({document_id:d.id,version_id:v.id,file_role:'original',storage_bucket:'dms-documents',storage_path:destinationFor(base,d.id),sha256_hash:sourceDigest(),file_size_bytes:sourceBytes().length,mime_type:n02.mime,created_by:actor,deleted_at:null}))assert.equal(f[key],expected);
 assert.equal(f.file_name,expectedFileName(d.document_no));
 for(const proof of [p,c]){assert.equal(proof.actor_id,actor);assert.equal(proof.operation_id,r.operation_id);assert.equal(proof.document_id,d.id);assert.equal(proof.hashMatches,true);assert.match(proof.request_hash,/^[0-9a-f]{64}$/);}
 assert.equal(c.request_hash,p.request_hash);assert.equal(p.upload_session_id,prepared.uploadId);assert.equal(p.storage_path,f.storage_path);assert.equal(p.content_sha256,f.sha256_hash);assert.equal(p.file_size_bytes,f.file_size_bytes);assert.equal(p.mime_type,f.mime_type);assert.equal(p.file_name,f.file_name);assert.match(p.verified_session_id,/^[0-9a-f-]{36}$/i);
 assert.deepEqual(c.result,{documentId:d.id,documentNo:d.document_no,upload_session_id:prepared.uploadId,operation_id:r.operation_id,completed:true,replayed:false});
 const expectedEvents={document_created:{operation_id:r.operation_id,upload_session_id:prepared.uploadId,attachment_complete:false},file_uploaded:{operation_id:r.operation_id,file_id:f.id,version_id:v.id,version_number:1},version_uploaded:{operation_id:r.operation_id,version_id:v.id,version_number:1,is_current:true}};
 for(const [type,metadata] of Object.entries(expectedEvents)){const rows=value.events.filter(e=>e.event_type===type);assert.equal(rows.length,1);assert.equal(rows[0].document_id,d.id);assert.equal(rows[0].performed_by,actor);id(rows[0].id);assert.deepEqual(rows[0].metadata_json,metadata);}
 for(const a of value.audits){id(a.id);assert.equal(a.actor_user_profile_id,actor);assert.equal(a.entity_reference,d.document_no);assert.equal(a.new_values?.operation_id,r.operation_id);}
 for(const [action,status] of [['generate','reserved'],['update','consumed']]){const rows=value.audits.filter(a=>a.entity_name==='global_numbering_generated_references'&&a.action===action);assert.equal(rows.length,1);assert.equal(rows[0].entity_id,g.id);assert.deepEqual(rows[0].new_values,{status,operation_id:r.operation_id});}
 for(const [action,event,extra] of [['create','document_retained_from_upload',{attachment_complete:false}],['update','document_upload_completed',{version_id:v.id,file_id:f.id}]]){const rows=value.audits.filter(a=>a.entity_name==='dms_documents'&&a.action===action);assert.equal(rows.length,1);assert.equal(rows[0].entity_id,d.id);assert.deepEqual(rows[0].new_values,{event,operation_id:r.operation_id,upload_session_id:prepared.uploadId,...extra});}
 const seq=value.sequences.filter(s=>s.id===g.sequence_state_id);assert.equal(seq.length,1);assert.equal(seq[0].numbering_rule_id,resources.rule.id);assert.equal(seq[0].reset_period_key,'GLOBAL');assert.equal(decimal(seq[0].last_sequence_number),decimal(g.generated_sequence_number));assert.equal(decimal(seq[0].next_sequence_number),decimal(g.generated_sequence_number)+BigInt(1));assert.equal(seq[0].last_generated_reference,d.document_no);assert.equal(seq[0].updated_by,actor);
 return {documentId:d.id,documentNo:d.document_no,referenceId:g.id,operationId:r.operation_id,versionId:v.id,fileId:f.id,sequenceId:g.sequence_state_id,eventIds:value.events.map(e=>e.id),auditIds:value.audits.map(a=>a.id),destination:f.storage_path,verifiedSessionId:p.verified_session_id};
}
export function assertStorage(rows,base,observed=null){
 assert.equal(rows.length,observed?2:1,'EXACT_OBJECT_SET_REQUIRED');const source=assertObject(rows.find(o=>o.bucket_id==='dms-temp'),'dms-temp',n02.sourcePath);
 if(!observed)return {source};const d=observed.documents[0],p=observed.verified[0],destination=assertObject(rows.find(o=>o.bucket_id==='dms-documents'),'dms-documents',destinationFor(base,d.id));
 assert.equal(destination.id,p.object_id);assert.equal(destination.version,p.object_version);assert.equal(destination.updated_at,p.object_updated_at);return {source,destination};
}
export function businessSql(base,ruleId,resources=null,prepared=null,identity=null){
 id(ruleId);const actor=prepared?.profileId??null,doc=identity?.documentId??null,skip=(column,value)=>value===null||value===undefined?'true':`${column} is distinct from ${id(value)}`;
 const tables=[['public.dms_document_categories',skip('id',resources?.categoryId)],['public.dms_document_types',skip('id',resources?.typeId)],['public.dms_upload_sessions',skip('id',prepared?.uploadId)],
  ['public.dms_documents',skip('created_by',actor)],['public.dms_document_files',skip('document_id',doc)],['public.dms_document_versions',skip('document_id',doc)],['public.dms_document_events',skip('performed_by',actor)],['public.audit_logs',skip('actor_user_profile_id',actor)],
  ['public.global_numbering_rules',`id<>${ruleId}`],['public.global_numbering_sequence_states',`numbering_rule_id<>${ruleId}`],['public.global_numbering_generated_references',skip('generated_by',actor)],
  ...['numbering_requests','upload_verified_copies','upload_creation_completions'].map(t=>['erp_private.'+t,skip('actor_id',actor)]),
  ...['dms_document_links','dms_expiry_reminders','dms_upload_batches','dms_ai_extraction_jobs','dms_ai_extraction_results','dms_intake_review_values','dms_review_queue','dms_approve_runs','erp_email_queue','erp_email_provider_configs','erp_ai_provider_configs'].map(t=>['public.'+t,'true']),
  ['storage.buckets','true'],['storage.objects',`not (bucket_id='dms-temp' and name=${quote(n02.sourcePath)})${identity?` and not (bucket_id='dms-documents' and name=${quote(destinationFor(base,doc))})`:''}`]];
 return `select jsonb_object_agg(name,hash) from (${tables.map(([table,where])=>`select ${quote(table)} name,md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) hash from ${table} r where ${where}`).join(' union all ')}) x;`;
}
export function actorRetireSql(base,prepared,state){
 assertActor({...state,auth:{...state.auth,banned:false}},base,prepared);assert.equal(state.auth.banned,true);
 const sessions=state.sessions.map(s=>quote(s.id)),refresh=state.refreshIds.map(r=>{decimal(r);return quote(r);}),assignments=Object.values(prepared.assignmentIds).map(id);
 return `do $guard$ begin if not exists(select 1 from public.user_profiles where id=${prepared.profileId} and auth_user_id=${quote(base.authId)}::uuid and notes=${quote(marker)} and status='active')
 or (select count(*) from public.user_roles where id in (${assignments.join(',')}) and user_profile_id=${prepared.profileId} and role_id in (${roleIds(prepared).join(',')}) and is_active)<>2 then raise exception 'ACTOR_PREIMAGE_CHANGED';end if;end $guard$;
 update public.user_roles set is_active=false where id in (${assignments.join(',')}) and user_profile_id=${prepared.profileId};
 update public.user_profiles set status='inactive' where id=${prepared.profileId} and auth_user_id=${quote(base.authId)}::uuid and notes=${quote(marker)};
 with r as(delete from auth.refresh_tokens where user_id=${quote(base.authId)} and id in (${refresh.join(',')||'null'}) returning id),
 s as(delete from auth.sessions where user_id=${quote(base.authId)}::uuid and id in (${sessions.join(',')||'null'}) and (select count(*) from r)>=0 returning id)
 select jsonb_build_object('sessionIds',(select coalesce(jsonb_agg(id::text order by id),'[]') from s),'refreshIds',(select coalesce(jsonb_agg(id::text order by id),'[]') from r));`;
}
export function resourceRetireSql(base,resources,prepared,observation){
 const identity=assertObservation(observation,base,resources,prepared);return `do $guard$ begin if not exists(select 1 from public.user_profiles p join auth.users u on u.id=p.auth_user_id where p.id=${prepared.profileId} and p.auth_user_id=${quote(base.authId)}::uuid and p.notes=${quote(marker)} and p.status='inactive' and u.banned_until>now())
 or exists(select 1 from public.user_roles where role_id in (${roleIds(resources).join(',')}) and is_active)
 or exists(select 1 from auth.sessions where user_id=${quote(base.authId)}::uuid) or exists(select 1 from auth.refresh_tokens where user_id=${quote(base.authId)})
 or not exists(select 1 from public.dms_documents where id=${identity.documentId} and created_by=${prepared.profileId} and title=${quote(n02.title)} and not is_archived and deleted_at is null)
 or not exists(select 1 from public.dms_upload_sessions where id=${prepared.uploadId} and uploaded_by=${prepared.profileId} and session_code=${quote(n02.sessionCode)} and document_id=${identity.documentId} and status='completed') then raise exception 'RETIREMENT_PREIMAGE_CHANGED';end if;end $guard$;
 update public.dms_documents set is_archived=true,archived_at=clock_timestamp() where id=${identity.documentId} and created_by=${prepared.profileId} and title=${quote(n02.title)};
 update public.dms_upload_sessions set status='cancelled',intake_status='discarded' where id=${prepared.uploadId} and uploaded_by=${prepared.profileId} and session_code=${quote(n02.sessionCode)} and document_id=${identity.documentId};
 update public.dms_document_types set is_active=false where id=${resources.typeId} and type_code=${quote(n02.typeCode)} and category_id=${resources.categoryId} and not is_system;
 update public.dms_document_categories set is_active=false where id=${resources.categoryId} and category_code=${quote(n02.categoryCode)} and not is_system;
 update public.roles set is_active=false where id in (${roleIds(resources).join(',')}) and notes in (${Object.values(n02.roles).map(r=>quote(r.marker)).join(',')}) and role_code in (${Object.values(n02.roles).map(r=>quote(r.roleCode)).join(',')});
 ${resources.rule.is_active?'':`update public.global_numbering_rules set is_active=false where id=${resources.rule.id} and rule_code='MASTER_DMS_DOCUMENT' and rule_name=${quote(resources.rule.rule_name)} and is_active;`}
 select 'RETIRED_EXACT_N02_RESOURCES';`;
}
export function preserveExcept(before,after,allowed,message){const keys=new Set(allowed),stable=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!keys.has(key)));assert.deepEqual(stable(after),stable(before),message);}
