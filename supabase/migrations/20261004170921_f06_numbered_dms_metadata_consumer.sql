begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- A normal uploader may SELECT the shared taxonomy but may not UPDATE it.
-- PostgreSQL applies UPDATE RLS to SELECT ... FOR SHARE, so doing these row
-- locks in the invoker would incorrectly require taxonomy management rights.
-- This private helper returns no row data and performs no writes. Its only
-- elevated operation is locking the two previously caller-visible references.
create function erp_private.lock_dms_creation_taxonomy(p_type bigint,p_category bigint,
 p_company bigint,p_branch bigint,p_confidentiality text)
returns void language plpgsql security definer set search_path='' as $$
declare type_category bigint; type_active boolean; type_deleted timestamptz;
 category_active boolean; category_deleted timestamptz;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active()
  or not public.current_user_has_permission('numbering.rules.generate')
  or not (public.current_user_has_permission_any_scope('dms.documents.view') or public.current_user_has_permission_any_scope('dms.admin'))
  or not erp_private.permission_in_scope('dms.documents.upload',p_company,p_branch)
  or p_confidentiality is null or p_confidentiality not in ('internal','company','hr','finance','legal','executive')
  or (p_confidentiality not in ('internal','company') and not erp_private.permission_in_scope('dms.documents.view.'||p_confidentiality,p_company,p_branch)) then
  raise exception 'Document creation permission denied' using errcode='42501';
 end if;
 if p_type is null or p_type<1 or p_category is null or p_category<1 then
  raise exception 'Invalid document taxonomy' using errcode='22023';
 end if;
 -- Existing type UPDATE takes its type row first, then the category FK lock.
 -- Category actions write only their category; F05 workflow locks type only.
 -- Do not reverse this order and do not lock entire shared taxonomy tables.
 select t.category_id,t.is_active,t.deleted_at into type_category,type_active,type_deleted
  from public.dms_document_types t where t.id=p_type for share;
 select c.is_active,c.deleted_at into category_active,category_deleted
  from public.dms_document_categories c where c.id=p_category for share;
 if not erp_private.business_principal_is_active()
  or not public.current_user_has_permission('numbering.rules.generate')
  or not (public.current_user_has_permission_any_scope('dms.documents.view') or public.current_user_has_permission_any_scope('dms.admin'))
  or not erp_private.permission_in_scope('dms.documents.upload',p_company,p_branch)
  or (p_confidentiality not in ('internal','company') and not erp_private.permission_in_scope('dms.documents.view.'||p_confidentiality,p_company,p_branch)) then
  raise exception 'Document creation permission denied' using errcode='42501';
 end if;
 if type_category is distinct from p_category or not coalesce(type_active,false)
  or type_deleted is not null or not coalesce(category_active,false) or category_deleted is not null then
  raise exception 'Document type or category unavailable' using errcode='23503';
 end if;
end $$;
alter function erp_private.lock_dms_creation_taxonomy(bigint,bigint,bigint,bigint,text) owner to postgres;
revoke all on function erp_private.lock_dms_creation_taxonomy(bigint,bigint,bigint,bigint,text) from public,anon,service_role;
grant execute on function erp_private.lock_dms_creation_taxonomy(bigint,bigint,bigint,bigint,text) to authenticated;

-- Standard metadata creation only. The caller's existing F03 row/column grants
-- remain authoritative: no privileged document write and no new RLS exception.
-- The established allocator owns actor+operation serialization and fingerprinting.
create function public.create_numbered_dms_document(p_operation uuid,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 actor bigint:=public.current_user_profile_id();
 allocation jsonb; reference text; document_id bigint; value public.dms_documents;
 item record; kind text;
 allowed text[]:=array['title','description','document_type_id','category_id','status','confidentiality_level',
  'owner_user_id','owning_company_id','owning_branch_id','party_id','issue_date','expiry_date','reminder_policy_id','legacy_document_code'];
begin
 if auth.uid() is null or actor is null or not erp_private.business_principal_is_active() then
  raise exception 'Document creation permission denied' using errcode='42501';
 end if;
 if p_operation is null or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>524288 then
  raise exception 'Invalid document creation request' using errcode='22023';
 end if;
 for item in select j.key,j.value from jsonb_each(p_data) j loop
  if not item.key=any(allowed) then raise exception 'Unknown document creation field' using errcode='22023'; end if;
  kind:=jsonb_typeof(item.value);
  if item.key in ('document_type_id','category_id','owner_user_id','owning_company_id','owning_branch_id','party_id','reminder_policy_id') then
   if kind<>'null' and (kind<>'number' or item.value::text !~ '^[1-9][0-9]*$' or (item.value::text)::numeric>9007199254740991) then
    raise exception 'Invalid document reference' using errcode='22023';
   end if;
  elsif kind not in ('null','string') then raise exception 'Invalid document field' using errcode='22023'; end if;
 end loop;
 if not (p_data ?& array['title','document_type_id','category_id','status','confidentiality_level'])
  or coalesce(length(p_data->>'title'),0) not between 1 and 500
  or p_data->>'document_type_id' is null or p_data->>'category_id' is null
  or coalesce(p_data->>'status','') not in ('draft','pending_review','approved','rejected','active','expired','archived','superseded')
  or coalesce(p_data->>'confidentiality_level','') not in ('internal','company','hr','finance','legal','executive') then
  raise exception 'Invalid document metadata' using errcode='22023';
 end if;
 -- Reject ambiguous date formats at the database boundary too; native date
 -- conversion rejects impossible calendar days before an allocation is made.
 if (nullif(p_data->>'issue_date','') is not null and p_data->>'issue_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
  or (nullif(p_data->>'expiry_date','') is not null and p_data->>'expiry_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
  raise exception 'Invalid document date' using errcode='22023';
 end if;
 value:=jsonb_populate_record(null::public.dms_documents,p_data||jsonb_build_object(
  'issue_date',nullif(p_data->>'issue_date',''),'expiry_date',nullif(p_data->>'expiry_date','')));
 if value.expiry_date<value.issue_date then raise exception 'Invalid document chronology' using errcode='22023';end if;
 -- Same scoped NEW-tuple admission as F03. dms.admin is not an upload or
 -- sensitive-data bypass; only the existing global-admin predicate can bypass.
 if not erp_private.permission_in_scope('dms.documents.upload',value.owning_company_id,value.owning_branch_id)
  or (value.confidentiality_level not in ('internal','company') and not
   erp_private.permission_in_scope('dms.documents.view.'||value.confidentiality_level,value.owning_company_id,value.owning_branch_id)) then
  raise exception 'Document creation permission denied' using errcode='42501';
 end if;
 allocation:=public.allocate_numbering_reference(p_operation,null,'MASTER_DMS_DOCUMENT',null,
  'reserved','dms_documents',null,'F06 DMS metadata creation '||encode(sha256(convert_to(p_data::text,'UTF8')),'hex'));
 -- Allocator/rule/numbering-audit waits may outlive a permission revocation.
 -- This is a new statement snapshot, not the admission decision above.
 if public.current_user_profile_id() is distinct from actor or not erp_private.business_principal_is_active()
  or not public.current_user_has_permission('numbering.rules.generate')
  or not erp_private.permission_in_scope('dms.documents.upload',value.owning_company_id,value.owning_branch_id)
  or (value.confidentiality_level not in ('internal','company') and not
   erp_private.permission_in_scope('dms.documents.view.'||value.confidentiality_level,value.owning_company_id,value.owning_branch_id)) then
  raise exception 'Document creation permission denied' using errcode='42501';
 end if;
 reference:=allocation->>'generated_reference_number';
 if allocation->>'generation_status'='consumed' then
  -- SELECT is intentionally a narrow safe projection and still enforces F03.
  -- Permission removal or a deleted/inaccessible record never leaks its receipt.
  select id into document_id from public.dms_documents where document_no=reference and created_by=actor and deleted_at is null;
  if document_id is null or not public.f03_has_document_permission(document_id,'dms.documents.upload') then
   raise exception 'Created document is unavailable' using errcode='42501';
  end if;
  perform public.finish_numbering_reservation(p_operation,'consumed','dms_documents',document_id,null);
  if public.current_user_profile_id() is distinct from actor or not erp_private.business_principal_is_active()
   or not public.current_user_has_permission('numbering.rules.generate')
   or not public.f03_has_document_permission(document_id,'dms.documents.upload') then
   raise exception 'Created document is unavailable' using errcode='42501';
  end if;
  return jsonb_build_object('id',document_id,'document_no',reference,'reference_id',(allocation->>'id')::bigint,
   'operation_id',p_operation,'replayed',true);
 end if;
 if allocation->>'generation_status'<>'reserved' then raise exception 'Creation request already closed' using errcode='PT409';end if;
 -- Ordinary caller-RLS visibility is mandatory BEFORE invoking the row-lock
 -- helper. The helper cannot be used to return an otherwise hidden taxonomy.
 if not exists(select 1 from public.dms_document_types where id=value.document_type_id)
  or not exists(select 1 from public.dms_document_categories where id=value.category_id) then
  raise exception 'Document type or category unavailable' using errcode='23503';
 end if;
 perform erp_private.lock_dms_creation_taxonomy(value.document_type_id,value.category_id,
  value.owning_company_id,value.owning_branch_id,value.confidentiality_level);
 -- Recheck caller visibility after waits too; activity/relationship was checked
 -- from the locked current rows by the helper and stays fixed until commit.
 if not exists(select 1 from public.dms_document_types where id=value.document_type_id)
  or not exists(select 1 from public.dms_document_categories where id=value.category_id) then
  raise exception 'Document type or category unavailable' using errcode='23503';
 end if;
 insert into public.dms_documents(document_no,title,description,document_type_id,category_id,status,confidentiality_level,
  owner_user_id,owning_company_id,owning_branch_id,party_id,issue_date,expiry_date,reminder_policy_id,legacy_document_code,created_by,updated_by)
 values(reference,value.title,value.description,value.document_type_id,value.category_id,value.status,value.confidentiality_level,
  value.owner_user_id,value.owning_company_id,value.owning_branch_id,value.party_id,value.issue_date,value.expiry_date,
  value.reminder_policy_id,value.legacy_document_code,actor,actor);
 -- The SELECT policy consults the persisted row through a STABLE permission
 -- function. RETURNING would evaluate it in the INSERT statement snapshot,
 -- before that function can see the new row. A separate caller-RLS SELECT
 -- observes our insert without relaxing either INSERT or SELECT admission.
 select id into document_id from public.dms_documents
  where document_no=reference and created_by=actor and deleted_at is null;
 if document_id is null then raise exception 'Created document is unavailable' using errcode='42501';end if;
 insert into public.dms_document_events(document_id,event_type,performed_by,description)
 values(document_id,'document_created',actor,'Document '||reference||' created');
 perform public.finish_numbering_reservation(p_operation,'consumed','dms_documents',document_id,null);
 insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
 values(actor,'DMS','dms_documents',document_id,reference,'create',jsonb_build_object('title',value.title,'document_no',reference));
 -- FK, child, reference-finalization and final audit writes can all wait. A
 -- revocation committed during any of them must roll this entire attempt back.
 if public.current_user_profile_id() is distinct from actor or not erp_private.business_principal_is_active()
  or not public.current_user_has_permission('numbering.rules.generate')
  or not public.f03_has_document_permission(document_id,'dms.documents.upload') then
  raise exception 'Document creation permission denied' using errcode='42501';
 end if;
 return jsonb_build_object('id',document_id,'document_no',reference,'reference_id',(allocation->>'id')::bigint,
  'operation_id',p_operation,'replayed',false);
end $$;
revoke all on function public.create_numbered_dms_document(uuid,jsonb) from public,anon,service_role;
grant execute on function public.create_numbered_dms_document(uuid,jsonb) to authenticated;
comment on function public.create_numbered_dms_document(uuid,jsonb) is
 'F06 standard DMS metadata create: caller-RLS atomic document, allocator consumption, event and audit; exact actor/request replay.';
-- Other DMS consumers are intentionally not migrated/revoked by this slice.
notify pgrst,'reload schema';
commit;
