// Pure N01 contracts. No filesystem/process/network effects on import.
import assert from 'node:assert/strict';
import {id,uuid,quote} from './scoped-browser-contract.mjs';
export {id,uuid,quote,fixtureOwner,ownerSql,permissionsSql,validatePermissions,roleCreateSql,
  projectionSql,assertPreserved,stateSql} from './scoped-browser-contract.mjs';

export const n01=Object.freeze({marker:'F06N01B0516',roleCode:'f06n01b0516',
  email:'f06n01b0516@example.invalid',fullName:'F06 synthetic browser F06N01B0516',
  title:'F06N01B0516 metadata document',categoryCode:'F06N01B0516_CAT',typeCode:'F06N01B0516_TYPE',
  permissions:Object.freeze(['dms.documents.view','dms.documents.upload','numbering.rules.generate'])});
export const commands=Object.freeze(['resources-prepare','actor-prepare','observe-invalid','observe-created','observe-retained','actor-retire','resources-retire']);
export const decimal=value=>{assert.equal(typeof value,'string');assert.match(value,/^(0|[1-9][0-9]*)$/);return BigInt(value);};
export const stableRule=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['is_active','current_sequence_number','next_sequence_number','updated_at','updated_by','workspace_revision'].includes(key)));
export function ownedRule(ledger,rows){
  assert.equal(ledger.marker,'F06_LOCAL_20261001');assert.equal(ledger.productionRowsCopied,0);
  assert.equal(rows.length,1,'EXISTING_CANONICAL_RULE_REQUIRED');const rule=rows[0];id(rule.id);
  const owned=ledger.rows.filter(row=>row.table==='global_numbering_rules'&&row.id===rule.id);
  assert.equal(owned.length,1,'EXACT_ORIGINAL_RULE_OWNERSHIP_REQUIRED');assert.match(owned[0].marker,/^FDMCR[A-Z0-9]+$/);
  assert.ok(ledger.intents.some(i=>i.marker===owned[0].marker&&i.table==='global_numbering_rules'&&i.operation==='Create exact synthetic DMS numbering resource'),'ORIGINAL_RULE_INTENT_REQUIRED');
  const expected={rule_code:'MASTER_DMS_DOCUMENT',rule_name:owned[0].marker,module_code:'DMS',module_name:'F06 synthetic DMS',
    document_type_code:'F06DMC',document_type_name:'F06 synthetic DMS',document_prefix:'F06DMC',format_template:'{DOC}-{SEQ6}',
    sequence_length:6,padding_character:'0',separator:'-',starting_sequence_number:1,reset_policy:'never',is_locked:false};
  for(const [key,value] of Object.entries(expected))assert.equal(rule[key],value,'OWNED_RULE_DEFINITION_CHANGED:'+key);
  assert.equal(typeof rule.is_active,'boolean');assert.equal(rule.effective_from,null);assert.equal(rule.effective_to,null);
  decimal(rule.current_sequence_number);decimal(rule.next_sequence_number);decimal(rule.workspace_revision);
  return rule;
}
export const ruleSql=()=>`select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('current_sequence_number',current_sequence_number::text,'next_sequence_number',next_sequence_number::text,'workspace_revision',workspace_revision::text) order by id),'[]') from public.global_numbering_rules r where rule_code='MASTER_DMS_DOCUMENT';`;
export function expectedPayload(resources){return {title:n01.title,description:null,document_type_id:id(resources.typeId),category_id:id(resources.categoryId),status:'draft',confidentiality_level:'internal',issue_date:null,expiry_date:null,owning_company_id:null,owning_branch_id:null,party_id:null};}
const json=value=>quote(JSON.stringify(value))+'::jsonb';

export function resourceCreateSql(rule){
  id(rule.id);assert.equal(typeof rule.is_active,'boolean');
  return `do $guard$ begin perform 1 from public.global_numbering_rules where id=${rule.id} for update;end $guard$;
    lock table public.dms_document_categories,public.dms_document_types in share row exclusive mode;
    do $guard$ begin if exists(select 1 from public.dms_document_categories where category_code=${quote(n01.categoryCode)})
      or exists(select 1 from public.dms_document_types where type_code=${quote(n01.typeCode)})
      or not exists(select 1 from public.global_numbering_rules r where id=${rule.id} and
        (to_jsonb(r)||jsonb_build_object('current_sequence_number',current_sequence_number::text,'next_sequence_number',next_sequence_number::text,'workspace_revision',workspace_revision::text))=${json(rule)})
      then raise exception 'RESOURCE_PREIMAGE_CHANGED';end if;end $guard$;
    ${rule.is_active?'':`update public.global_numbering_rules set is_active=true where id=${rule.id} and rule_code='MASTER_DMS_DOCUMENT' and is_active=false;`}
    with c as(insert into public.dms_document_categories(category_code,name_en,is_system,is_active)
      values(${quote(n01.categoryCode)},${quote(n01.marker+' category')},false,true) returning id),
    t as(insert into public.dms_document_types(type_code,name_en,category_id,is_system,is_active,default_confidentiality,requires_expiry_tracking,is_renewable,requires_approval)
      select ${quote(n01.typeCode)},${quote(n01.marker+' type')},id,false,true,'internal',false,false,false from c returning id)
    select jsonb_build_object('categoryId',(select id from c),'typeId',(select id from t));`;
}
export function taxonomySql(resources){return `select jsonb_build_object(
  'category',(select to_jsonb(c) from public.dms_document_categories c where id=${id(resources.categoryId)}),
  'type',(select to_jsonb(t) from public.dms_document_types t where id=${id(resources.typeId)}));`;}
export function assertTaxonomy(state,resources,active=true){
  assert.equal(state.category?.id,id(resources.categoryId));assert.equal(state.category.category_code,n01.categoryCode);
  assert.equal(state.category.name_en,n01.marker+' category');assert.equal(state.category.is_system,false);assert.equal(state.category.is_active,active);assert.equal(state.category.deleted_at,null);
  assert.equal(state.type?.id,id(resources.typeId));assert.equal(state.type.type_code,n01.typeCode);assert.equal(state.type.name_en,n01.marker+' type');
  assert.equal(state.type.category_id,resources.categoryId);assert.equal(state.type.is_system,false);assert.equal(state.type.is_active,active);assert.equal(state.type.deleted_at,null);
  assert.equal(state.type.default_confidentiality,'internal');for(const key of ['requires_expiry_tracking','is_renewable','requires_approval'])assert.equal(state.type[key],false);
}
export function assertRole(state,resources,active=true){
  assert.equal(state.role?.id,id(resources.roleId));assert.equal(state.role.role_code,n01.roleCode);assert.equal(state.role.role_name,n01.fullName);
  assert.equal(state.role.notes,n01.marker);assert.equal(state.role.is_active,active);assert.equal(state.role.is_system_role,false);assert.equal(state.role.is_assignable,false);
  assert.deepEqual(state.pairs.map(p=>({id:p.id,role_id:p.role_id,permission_id:p.permission_id})),resources.pairs);
}
export function assertActor(state,base,prepared,retired=false){
  uuid(base.authId);assert.equal(state.auth?.id,base.authId);assert.equal(state.auth.email,n01.email);assert.equal(state.auth.marker,n01.marker);
  assert.equal(state.auth.role,'authenticated');assert.equal(state.auth.confirmed,true);if(retired)assert.equal(state.auth.banned,true);else assert.notEqual(state.auth.banned,true);
  assert.equal(state.profiles.length,1);const p=state.profiles[0];assert.equal(p.id,id(prepared.profileId));assert.equal(p.auth_user_id,base.authId);
  assert.equal(p.full_name,n01.fullName);assert.equal(p.display_name,n01.fullName);assert.equal(p.notes,n01.marker);assert.equal(p.owner_company_id,base.owner.companyId);
  assert.equal(p.branch_id,null);assert.equal(p.status,retired?'inactive':'active');assert.equal(p.must_change_password,false);
  assert.equal(state.assignments.length,1);const a=state.assignments[0];assert.equal(a.id,id(prepared.assignmentId));assert.equal(a.role_id,prepared.roleId);assert.equal(a.user_profile_id,p.id);
  assert.equal(a.owner_company_id,null);assert.equal(a.branch_id,null);assert.equal(a.is_active,!retired);
  for(const session of state.sessions){assert.equal(session.userId,base.authId);assert.match(session.id,/^[0-9a-f-]{36}$/i);}
  if(retired){assert.deepEqual(state.sessions,[]);assert.deepEqual(state.refreshIds,[]);}
}
export function actorPrepareSql(base,resources,profileId){
  uuid(base.authId);id(profileId);id(resources.roleId);id(base.owner.companyId);
  return `do $guard$ begin if (select count(*) from public.user_profiles where id=${profileId} and auth_user_id=${quote(base.authId)}::uuid and full_name=${quote(n01.fullName)})<>1
    or exists(select 1 from public.user_roles where user_profile_id=${profileId} or role_id=${resources.roleId}) then raise exception 'ACTOR_PREIMAGE_CHANGED';end if;end $guard$;
    update public.user_profiles set full_name=${quote(n01.fullName)},display_name=${quote(n01.fullName)},notes=${quote(n01.marker)},status='active',must_change_password=false,
      owner_company_id=${base.owner.companyId},branch_id=null where id=${profileId} and auth_user_id=${quote(base.authId)}::uuid;
    with a as(insert into public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
      values(${profileId},${resources.roleId},null,null,true) returning id)
    select jsonb_build_object('profileId',${profileId},'assignmentId',(select id from a));`;
}
export function actorRetireSql(base,prepared,state){
  assertActor({...state,auth:{...state.auth,banned:false}},base,prepared);assert.equal(state.auth.banned,true);
  const sessions=state.sessions.map(s=>quote(s.id));const refresh=state.refreshIds.map(value=>{decimal(value);return quote(value);});
  return `do $guard$ begin if not exists(select 1 from public.user_profiles where id=${prepared.profileId} and auth_user_id=${quote(base.authId)}::uuid and notes=${quote(n01.marker)} and status='active')
    or not exists(select 1 from public.user_roles where id=${prepared.assignmentId} and user_profile_id=${prepared.profileId} and role_id=${prepared.roleId} and owner_company_id is null and branch_id is null and is_active)
    then raise exception 'ACTOR_PREIMAGE_CHANGED';end if;end $guard$;
    update public.user_roles set is_active=false where id=${prepared.assignmentId} and user_profile_id=${prepared.profileId} and role_id=${prepared.roleId};
    update public.user_profiles set status='inactive' where id=${prepared.profileId} and auth_user_id=${quote(base.authId)}::uuid and notes=${quote(n01.marker)};
    with r as(delete from auth.refresh_tokens where user_id=${quote(base.authId)} and id in (${refresh.join(',')||'null'}) returning id),
    s as(delete from auth.sessions where user_id=${quote(base.authId)}::uuid and id in (${sessions.join(',')||'null'}) and (select count(*) from r)>=0 returning id)
    select jsonb_build_object('sessionIds',(select coalesce(jsonb_agg(id::text order by id),'[]') from s),'refreshIds',(select coalesce(jsonb_agg(id::text order by id),'[]') from r));`;
}

// Finite full-row fingerprints of unrelated N01 business and side-effect tables.
// Owned actor writes are separately checked in both directions by observationSql.
export function businessSql(ruleId,resources=null,profileId=null){
  id(ruleId);if(profileId!==null)id(profileId);
  const skip=(field,value)=>value==null?'true':`${field} is distinct from ${id(value)}`;
  const tables=[['public.dms_document_categories',skip('id',resources?.categoryId)],['public.dms_document_types',skip('id',resources?.typeId)],
    ['public.dms_documents',skip('created_by',profileId)],['public.dms_document_events',skip('performed_by',profileId)],
    ['public.global_numbering_rules',`id<>${ruleId}`],['public.global_numbering_generated_references',skip('generated_by',profileId)],
    ['public.global_numbering_sequence_states',`numbering_rule_id<>${ruleId}`],['erp_private.numbering_requests',skip('actor_id',profileId)],
    ['public.audit_logs',skip('actor_user_profile_id',profileId)],...['dms_document_files','dms_document_versions','dms_document_links','dms_expiry_reminders',
      'dms_upload_sessions','dms_upload_batches','dms_ai_extraction_jobs','dms_ai_extraction_results','erp_email_queue','erp_email_provider_configs','erp_ai_provider_configs'].map(t=>['public.'+t,'true']),
    ['storage.objects','true'],['storage.buckets','true']];
  return `select jsonb_object_agg(name,hash) from (${tables.map(([table,where])=>`select ${quote(table)} name,md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) hash from ${table} r where ${where}`).join(' union all ')}) fingerprints;`;
}
export function observationSql(resources,profileId){
  id(profileId);id(resources.rule.id);const payload=expectedPayload(resources);
  return `select jsonb_build_object(
    'documents',(select coalesce(jsonb_agg(to_jsonb(d) order by id),'[]') from public.dms_documents d where created_by=${profileId} or title=${quote(n01.title)} or document_type_id=${resources.typeId} or category_id=${resources.categoryId}),
    'references',(select coalesce(jsonb_agg(to_jsonb(g)||jsonb_build_object('generated_sequence_number',generated_sequence_number::text) order by id),'[]') from public.global_numbering_generated_references g where generated_by=${profileId}),
    'requests',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('hashMatches',request_hash=md5(jsonb_build_array(null,'MASTER_DMS_DOCUMENT',null,'reserved','dms_documents',null,
      'F06 DMS metadata creation '||encode(sha256(convert_to((${json(payload)})::text,'UTF8')),'hex'))::text)) order by operation_id),'[]') from erp_private.numbering_requests r where actor_id=${profileId}),
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') from public.dms_document_events e where performed_by=${profileId} or document_id in(select id from public.dms_documents where created_by=${profileId})),
    'audits',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from public.audit_logs a where actor_user_profile_id=${profileId} or
      (entity_name='dms_documents' and entity_id in(select id from public.dms_documents where created_by=${profileId})) or
      (entity_name='global_numbering_generated_references' and entity_id in(select id from public.global_numbering_generated_references where generated_by=${profileId}))),
    'sequences',(select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('last_sequence_number',last_sequence_number::text,'next_sequence_number',next_sequence_number::text) order by id),'[]') from public.global_numbering_sequence_states s where numbering_rule_id=${resources.rule.id}));`;
}
export function assertObservation(state,resources,profileId,{empty=false,archived=false}={}){
  id(profileId);for(const key of ['documents','references','requests','events','audits','sequences'])assert.ok(Array.isArray(state[key]));
  if(empty){for(const key of ['documents','references','requests','events','audits'])assert.deepEqual(state[key],[],'UNEXPECTED_N01_EFFECT:'+key);return null;}
  assert.equal(state.documents.length,1);assert.equal(state.references.length,1);assert.equal(state.requests.length,1);assert.equal(state.events.length,1);assert.equal(state.audits.length,3);
  const d=state.documents[0],g=state.references[0],r=state.requests[0],e=state.events[0];
  id(d.id);id(g.id);id(e.id);uuid(r.operation_id);assert.match(r.request_hash,/^[0-9a-f]{32}$/);assert.equal(r.hashMatches,true,'REQUEST_PAYLOAD_HASH_MISMATCH');
  for(const [key,value] of Object.entries(expectedPayload(resources)))assert.equal(d[key],value,'DOCUMENT_PAYLOAD_MISMATCH:'+key);
  for(const key of ['owner_user_id','reminder_policy_id','legacy_document_code','deleted_at','current_version_id'])assert.equal(d[key],null);
  assert.equal(d.created_by,profileId);assert.equal(d.updated_by,profileId);assert.equal(d.is_archived,archived);assert.equal(d.archived_at!==null,archived);
  assert.equal(g.numbering_rule_id,resources.rule.id);assert.equal(g.generation_status,'consumed');assert.equal(g.target_table_name,'dms_documents');assert.equal(g.target_record_id,d.id);
  assert.equal(g.generated_reference_number,d.document_no);assert.equal(g.generated_by,profileId);assert.ok(g.consumed_at);assert.ok(g.reserved_at);assert.equal(g.manual_override_used,false);
  assert.equal(r.reference_id,g.id);assert.equal(r.actor_id,profileId);assert.equal(e.document_id,d.id);assert.equal(e.event_type,'document_created');assert.equal(e.performed_by,profileId);
  assert.equal(e.description,'Document '+d.document_no+' created');
  const create=state.audits.filter(a=>a.entity_name==='dms_documents');assert.equal(create.length,1);assert.equal(create[0].entity_id,d.id);
  assert.equal(create[0].action,'create');assert.deepEqual(create[0].new_values,{title:n01.title,document_no:d.document_no});
  for(const [action,status] of [['generate','reserved'],['update','consumed']]){
    const audits=state.audits.filter(a=>a.entity_name==='global_numbering_generated_references'&&a.action===action);assert.equal(audits.length,1);
    assert.equal(audits[0].entity_id,g.id);assert.equal(audits[0].new_values.status,status);assert.equal(audits[0].new_values.operation_id,r.operation_id);
  }
  for(const a of state.audits){id(a.id);assert.equal(a.actor_user_profile_id,profileId);assert.equal(a.entity_reference,d.document_no);}
  const seq=state.sequences.filter(s=>s.id===g.sequence_state_id);assert.equal(seq.length,1);assert.equal(seq[0].numbering_rule_id,resources.rule.id);
  assert.equal(seq[0].reset_period_key,'GLOBAL');assert.equal(decimal(seq[0].last_sequence_number),decimal(g.generated_sequence_number));
  assert.equal(decimal(seq[0].next_sequence_number),decimal(g.generated_sequence_number)+BigInt(1));
  assert.equal(seq[0].last_generated_reference,d.document_no);assert.equal(seq[0].updated_by,profileId);
  return {documentId:d.id,documentNo:d.document_no,referenceId:g.id,operationId:r.operation_id,eventId:e.id,auditIds:state.audits.map(a=>a.id),sequenceId:g.sequence_state_id};
}
export function assertSequenceHistoryPreserved(before,after,sequenceId){
  id(sequenceId);for(const rows of [before,after]){assert.ok(Array.isArray(rows));for(const row of rows)id(row.id);assert.equal(new Set(rows.map(row=>row.id)).size,rows.length,'DUPLICATE_SEQUENCE_ID');}
  const selected=after.filter(row=>row.id===sequenceId);assert.equal(selected.length,1,'CONSUMED_SEQUENCE_REQUIRED');
  const initialIds=new Set(before.map(row=>row.id));
  assert.ok(after.filter(row=>!initialIds.has(row.id)).every(row=>row.id===sequenceId),'UNRELATED_SEQUENCE_CREATED');
  assert.deepEqual(after.filter(row=>row.id!==sequenceId),before.filter(row=>row.id!==sequenceId),'UNRELATED_SEQUENCE_CHANGED');
  const original=before.find(row=>row.id===sequenceId);
  if(original){
    // The allocator changes these five columns plus the established updated_at
    // trigger. Every other column, including future columns, must be preserved.
    const written=new Set(['last_sequence_number','next_sequence_number','last_generated_reference','last_generated_at','updated_by','updated_at']);
    const immutable=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!written.has(key)));
    assert.deepEqual(immutable(selected[0]),immutable(original),'CONSUMED_SEQUENCE_IMMUTABLE_CHANGED');
    assert.equal(decimal(selected[0].last_sequence_number),decimal(original.next_sequence_number),'EXISTING_SEQUENCE_NEXT_CHANGED');
  }
  // A newly introduced selected state may legitimately catch up from retained
  // historical references; never force it to equal the old rule-level counter.
}
export function assertNumberingProgress(before,after,observation){
  assert.deepEqual(stableRule(after),stableRule(before),'RULE_DEFINITION_CHANGED');assert.ok(decimal(after.workspace_revision)>=decimal(before.workspace_revision));
  if(!observation){assert.equal(after.current_sequence_number,before.current_sequence_number);assert.equal(after.next_sequence_number,before.next_sequence_number);return;}
  const g=observation.references[0];assert.ok(decimal(g.generated_sequence_number)>=decimal(before.next_sequence_number),'NUMBER_REUSE');
  assert.equal(decimal(after.current_sequence_number),decimal(g.generated_sequence_number));assert.equal(decimal(after.next_sequence_number),decimal(g.generated_sequence_number)+BigInt(1));
}
export function retireResourcesSql(resources,prepared,observed){
  const doc=observed.documents[0];assertObservation(observed,resources,prepared.profileId);id(resources.roleId);
  return `do $guard$ begin if not exists(select 1 from public.user_profiles p join auth.users u on u.id=p.auth_user_id where p.id=${id(prepared.profileId)} and p.status='inactive' and u.banned_until>now())
    or exists(select 1 from public.user_roles where role_id=${resources.roleId} and is_active)
    or not exists(select 1 from public.roles where id=${resources.roleId} and role_code=${quote(n01.roleCode)} and notes=${quote(n01.marker)} and is_active and not is_system_role)
    or not exists(select 1 from public.dms_documents where id=${id(doc.id)} and title=${quote(n01.title)} and created_by=${prepared.profileId} and category_id=${resources.categoryId} and document_type_id=${resources.typeId} and not is_archived and deleted_at is null)
    then raise exception 'RETIREMENT_PREIMAGE_CHANGED';end if;end $guard$;
    update public.dms_documents set is_archived=true,archived_at=clock_timestamp() where id=${doc.id} and created_by=${prepared.profileId} and title=${quote(n01.title)};
    update public.dms_document_types set is_active=false where id=${resources.typeId} and type_code=${quote(n01.typeCode)} and category_id=${resources.categoryId} and not is_system;
    update public.dms_document_categories set is_active=false where id=${resources.categoryId} and category_code=${quote(n01.categoryCode)} and not is_system;
    update public.roles set is_active=false where id=${resources.roleId} and role_code=${quote(n01.roleCode)} and notes=${quote(n01.marker)};
    ${resources.rule.is_active?'':`update public.global_numbering_rules set is_active=false where id=${resources.rule.id} and rule_code='MASTER_DMS_DOCUMENT' and rule_name=${quote(resources.rule.rule_name)} and is_active;`}
    select 'RETIRED_EXACT_N01_RESOURCES';`;
}
