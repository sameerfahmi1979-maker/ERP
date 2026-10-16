begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Single-file AI approval only. Storage/provider calls never occur while a DB
-- transaction is open. A reserved number/ID is not an approved document.
create function erp_private.validate_ai_approval_request(p_request jsonb,p_prepared boolean)
returns void language plpgsql immutable security invoker set search_path='' as $$
declare item record; v jsonb; issue date; expiry date; a jsonb;
begin
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>524288
  or not(p_request ?& array['uploadSessionId','title','documentTypeId','metadataValues','tagIds','links','allowDuplicate'])
  or p_request-array['uploadSessionId','title','documentTypeId','description','issueDate','expiryDate','confidentialityLevel',
   'owningCompanyId','owningBranchId','partyId','metadataValues','tagIds','links','aiResultId','allowDuplicate','standardFileName','prepared']<>'{}'::jsonb then
  raise exception 'Invalid approval request' using errcode='22023';end if;
 for item in select * from jsonb_each(p_request) loop
  if item.key in ('uploadSessionId','documentTypeId','owningCompanyId','owningBranchId','partyId','aiResultId') then
   if jsonb_typeof(item.value)<>'null' and (jsonb_typeof(item.value)<>'number' or item.value::text !~ '^[1-9][0-9]*$'
    or item.value::text::numeric>9007199254740991) then raise exception 'Invalid approval identity' using errcode='22023';end if;
  elsif item.key in ('title','description','issueDate','expiryDate','confidentialityLevel','standardFileName')
   and jsonb_typeof(item.value) not in ('string','null') then raise exception 'Invalid approval value' using errcode='22023';end if;
 end loop;
 if p_request->>'uploadSessionId' is null or p_request->>'documentTypeId' is null
  or coalesce(length(btrim(p_request->>'title')),0) not between 1 and 500 or length(p_request->>'description')>2000
  or jsonb_typeof(p_request->'allowDuplicate') is distinct from 'boolean'
  or (p_request->>'confidentialityLevel' is not null and p_request->>'confidentialityLevel' not in ('internal','company','hr','finance','legal','executive'))
  or (p_request->>'owningBranchId' is not null and p_request->>'owningCompanyId' is null)
  or (p_request->>'standardFileName' is not null and length(btrim(p_request->>'standardFileName')) not between 1 and 200) then
  raise exception 'Invalid approval values' using errcode='22023';end if;
 if (nullif(p_request->>'issueDate','') is not null and p_request->>'issueDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
  or (nullif(p_request->>'expiryDate','') is not null and p_request->>'expiryDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
  raise exception 'Invalid approval date' using errcode='22023';end if;
 issue:=nullif(p_request->>'issueDate','')::date;expiry:=nullif(p_request->>'expiryDate','')::date;
 if expiry<issue then raise exception 'Invalid approval chronology' using errcode='22023';end if;
 foreach a in array array[p_request->'metadataValues',p_request->'tagIds',p_request->'links'] loop
  if jsonb_typeof(a) is distinct from 'array' or jsonb_array_length(a)>200 then raise exception 'Invalid approval children' using errcode='22023';end if;
 end loop;
 if jsonb_array_length(p_request->'tagIds')>100 or jsonb_array_length(p_request->'links')>100 then raise exception 'Too many approval children' using errcode='22023';end if;
 for v in select value from jsonb_array_elements(p_request->'metadataValues') loop
  if jsonb_typeof(v)<>'object' or not(v ?& array['definitionId','fieldType','rawValue']) or v-array['definitionId','fieldType','rawValue']<>'{}'::jsonb
   or jsonb_typeof(v->'definitionId') is distinct from 'number' or v->>'definitionId' !~ '^[1-9][0-9]*$'
   or (v->>'definitionId')::numeric>9007199254740991 or jsonb_typeof(v->'fieldType') is distinct from 'string'
   or jsonb_typeof(v->'rawValue') is distinct from 'string' or length(v->>'rawValue')>16384 then raise exception 'Invalid metadata field' using errcode='22023';end if;
 end loop;
 for v in select value from jsonb_array_elements(p_request->'tagIds') loop
  if jsonb_typeof(v)<>'number' or v::text !~ '^[1-9][0-9]*$' or v::text::numeric>9007199254740991 then raise exception 'Invalid tag' using errcode='22023';end if;
 end loop;
 for v in select value from jsonb_array_elements(p_request->'links') loop
  if jsonb_typeof(v)<>'object' or not(v ?& array['entityType','entityId']) or v-array['entityType','entityId','linkRole','isPrimary']<>'{}'::jsonb
   or jsonb_typeof(v->'entityType') is distinct from 'string' or jsonb_typeof(v->'entityId') is distinct from 'number'
   or v->>'entityId' !~ '^[1-9][0-9]*$' or (v->>'entityId')::numeric>9007199254740991
   or (v ? 'linkRole' and (jsonb_typeof(v->'linkRole')<>'string' or length(v->>'linkRole')>100))
   or (v ? 'isPrimary' and jsonb_typeof(v->'isPrimary')<>'boolean') then raise exception 'Invalid document link' using errcode='22023';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_request->'metadataValues') child(value) group by child.value->>'definitionId' having count(*)>1)
  or exists(select 1 from jsonb_array_elements(p_request->'tagIds') child(value) group by child.value having count(*)>1)
  or exists(select 1 from jsonb_array_elements(p_request->'links') child(value) group by child.value->>'entityType',child.value->>'entityId' having count(*)>1) then
  raise exception 'Duplicate approval child' using errcode='22023';end if;
 if p_prepared and (jsonb_typeof(p_request->'prepared') is distinct from 'object'
  or not(p_request->'prepared' ?& array['source','type','source_fingerprint','context_fingerprint','analysis_result_id','analysis_fingerprint','storage_year','content_sha256'])
  or (p_request->'prepared')-array['source','type','source_fingerprint','context_fingerprint','analysis_result_id','analysis_fingerprint','storage_year','content_sha256']<>'{}'::jsonb
  or coalesce(p_request#>>'{prepared,content_sha256}','') !~ '^[a-f0-9]{64}$'
  or p_request#>'{prepared,source,id}' is distinct from p_request->'uploadSessionId'
  or p_request#>'{prepared,type,id}' is distinct from p_request->'documentTypeId') then raise exception 'Invalid prepared approval' using errcode='22023';end if;
end $$;
revoke all on function erp_private.validate_ai_approval_request(jsonb,boolean) from public,anon,service_role;
grant execute on function erp_private.validate_ai_approval_request(jsonb,boolean) to authenticated;

-- Current original-source authorization remains independent of the selected
-- destination, even after F03's bound-session helper follows the new document.
create function erp_private.assert_ai_approval_authority(p_request jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare s record; company bigint:=(p_request->>'owningCompanyId')::bigint; branch bigint:=(p_request->>'owningBranchId')::bigint;
 confidentiality text:=coalesce(p_request->>'confidentialityLevel',p_request#>>'{prepared,type,default_confidentiality}','internal');
begin
 if auth.uid() is null or not erp_private.business_principal_is_active() or not public.current_user_has_permission('numbering.rules.generate') then
  raise exception 'Approval unavailable' using errcode='42501';end if;
 select id,uploaded_by,owning_company_id,owning_branch_id,document_id,ai_result_id into s from public.dms_upload_sessions
  where id=(p_request->>'uploadSessionId')::bigint and deleted_at is null;
 if not found or not erp_private.upload_row_allowed(s.uploaded_by,s.owning_company_id,s.owning_branch_id,null)
  or not erp_private.upload_session_allowed(s.id)
  or not erp_private.permission_in_scope('dms.documents.upload',s.owning_company_id,s.owning_branch_id)
  or not erp_private.permission_in_scope('dms.documents.preview',s.owning_company_id,s.owning_branch_id)
  or (s.ai_result_id is not null and not erp_private.permission_in_scope('dms.documents.review_ai',s.owning_company_id,s.owning_branch_id))
  or not erp_private.permission_in_scope('dms.documents.upload',company,branch)
  or not erp_private.permission_in_scope('dms.documents.edit',company,branch)
  or not erp_private.permission_in_scope('dms.documents.preview',company,branch)
  or not (erp_private.permission_in_scope('dms.documents.view',company,branch) or erp_private.permission_in_scope('dms.admin',company,branch))
  or (confidentiality not in ('internal','company') and not erp_private.permission_in_scope('dms.documents.view.'||confidentiality,company,branch)) then
  raise exception 'Approval source or destination unavailable' using errcode='42501';end if;
 if s.document_id is not null and (not public.f03_has_document_permission(s.document_id,'dms.documents.upload')
  or not public.f03_has_document_permission(s.document_id,'dms.documents.edit') or not public.f03_has_document_permission(s.document_id,'dms.documents.preview')
  or (s.ai_result_id is not null and not public.f03_has_document_permission(s.document_id,'dms.documents.review_ai'))) then
  raise exception 'Approved destination unavailable' using errcode='42501';end if;
end $$;
revoke all on function erp_private.assert_ai_approval_authority(jsonb) from public,anon,service_role;
grant execute on function erp_private.assert_ai_approval_authority(jsonb) to authenticated;

-- Only entity IDs actually supplied by the existing picker are supported. The
-- ambiguous employee medical/access/training aliases are deliberately NOT
-- remapped to either employee IDs or child IDs here; see the slice handoff.
create function erp_private.ai_approval_link_target(p_kind text,p_id bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare value jsonb; target text; predicate text;
begin
 select x.t,x.p into target,predicate from (values
  ('party','parties','is_active and not is_locked'),('party_license','party_licenses','is_active'),
  ('party_tax_registration','party_tax_registrations','is_active'),('company','owner_companies','status=''active'''),
  ('branch','branches','status=''active'''),('bank','banks','is_active'),('site','work_sites','deleted_at is null'),
  ('employee','employees','deleted_at is null'),('employee_compliance','employees','deleted_at is null'),
  ('employee_contract','employees','deleted_at is null'),('employee_leave_request','employees','deleted_at is null'),
  ('employee_dependent','employee_dependents','deleted_at is null'),('employee_identity_document','employee_identity_documents','true')
 ) x(k,t,p) where x.k=p_kind;
 if target is null then raise exception 'This link target requires a reviewed entity mapping' using errcode='22023';end if;
 execute format('select to_jsonb(t) from public.%I t where id=$1 and %s',target,predicate) into value using p_id;
 if value is null then raise exception 'Selected link target unavailable' using errcode='23503';end if;
 return jsonb_build_object('type',p_kind,'id',p_id,'fingerprint',encode(sha256(convert_to(value::text,'UTF8')),'hex'));
end $$;
revoke all on function erp_private.ai_approval_link_target(text,bigint) from public,anon,service_role;
grant execute on function erp_private.ai_approval_link_target(text,bigint) to authenticated;

-- Preserve the existing approval storage columns (currency/select/ref values
-- remain text); validate against the real definition, never caller fieldType.
create function erp_private.ai_approval_metadata(p_request jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item jsonb; d record; raw text; value jsonb; output jsonb:='[]';
begin
 for item in select v from jsonb_array_elements(p_request->'metadataValues') v order by (v->>'definitionId')::bigint loop
  select id,field_type into d from public.dms_metadata_definitions where id=(item->>'definitionId')::bigint
   and document_type_id=(p_request->>'documentTypeId')::bigint and is_active and deleted_at is null;
  if not found or d.field_type is distinct from item->>'fieldType' then raise exception 'Metadata definition unavailable or changed' using errcode='23503';end if;
  raw:=item->>'rawValue';if raw='' then continue;end if;
  value:=jsonb_build_object('definition_id',d.id,'value_text',null,'value_number',null,'value_date',null,'value_datetime',null,'value_boolean',null,'value_json',null);
  case d.field_type
   when 'number','decimal' then
    if raw !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$' then raise exception 'Invalid metadata number' using errcode='22023';end if;
    value:=value||jsonb_build_object('value_number',raw::numeric);
   when 'date' then
    if raw !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid metadata date' using errcode='22023';end if;
    value:=value||jsonb_build_object('value_date',raw::date);
   when 'datetime' then value:=value||jsonb_build_object('value_datetime',raw::timestamptz);
   when 'boolean' then
    if raw not in ('true','false','1','0') then raise exception 'Invalid metadata boolean' using errcode='22023';end if;
    value:=value||jsonb_build_object('value_boolean',raw in ('true','1'));
   when 'json' then
    begin value:=value||jsonb_build_object('value_json',raw::jsonb);
    exception when invalid_text_representation then value:=value||jsonb_build_object('value_json',raw);end;
   else value:=value||jsonb_build_object('value_text',raw);
  end case;
  output:=output||jsonb_build_array(value);
 end loop;
 return output;
end $$;
revoke all on function erp_private.ai_approval_metadata(jsonb) from public,anon,service_role;
grant execute on function erp_private.ai_approval_metadata(jsonb) to authenticated;

-- DMS destination selection does not grant organization master-data access.
-- Return only the authorized identity/revision needed to detect context changes;
-- optional business links still use their independent caller-RLS target reader.
create function erp_private.ai_approval_destination_snapshot(p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare company jsonb; branch jsonb;
begin
 perform erp_private.validate_ai_approval_request(p_request,false);
 perform erp_private.assert_ai_approval_authority(p_request);
 if p_request->>'owningCompanyId' is not null then
  select jsonb_build_object('id',c.id,'status',c.status,'workspace_revision',c.workspace_revision) into company
   from public.owner_companies c where c.id=(p_request->>'owningCompanyId')::bigint and c.status='active';
  if company is null then raise exception 'Destination company unavailable' using errcode='23503';end if;
 end if;
 if p_request->>'owningBranchId' is not null then
  select jsonb_build_object('id',b.id,'owner_company_id',b.owner_company_id,'status',b.status,'workspace_revision',b.workspace_revision) into branch
   from public.branches b where b.id=(p_request->>'owningBranchId')::bigint and b.status='active' and b.owner_company_id=(p_request->>'owningCompanyId')::bigint;
  if branch is null then raise exception 'Destination branch unavailable' using errcode='23503';end if;
 end if;
 perform erp_private.assert_ai_approval_authority(p_request);
 return jsonb_build_object('company',company,'branch',branch);
end $$;
alter function erp_private.ai_approval_destination_snapshot(jsonb) owner to postgres;
revoke all on function erp_private.ai_approval_destination_snapshot(jsonb) from public,anon,service_role;
grant execute on function erp_private.ai_approval_destination_snapshot(jsonb) to authenticated;

create function erp_private.ai_approval_snapshot(p_request jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s record; t record; a record; source jsonb; context jsonb; item jsonb; value jsonb;
 analysis_id bigint; analysis_hash text;
begin
 perform erp_private.validate_ai_approval_request(p_request,false);
 perform erp_private.assert_ai_approval_authority(p_request);
 select id,session_code,uploaded_by,owning_company_id,owning_branch_id,temp_storage_path,original_filename,mime_type,
  file_size_bytes,sha256_hash,ai_result_id,document_id,status,intake_status,is_duplicate,duplicate_document_id into s
  from public.dms_upload_sessions where id=(p_request->>'uploadSessionId')::bigint and deleted_at is null;
 if not found then raise exception 'Intake unavailable' using errcode='42501';end if;
 if s.document_id is not null or s.status in ('completed','cancelled','expired') or s.intake_status not in ('review_pending','review_in_progress') then
  raise exception 'Intake is not awaiting single-file approval' using errcode='PT409';end if;
 if s.temp_storage_path is null or s.file_size_bytes is null or s.mime_type is null then raise exception 'Intake file unavailable' using errcode='23503';end if;
 if s.is_duplicate and not (p_request->>'allowDuplicate')::boolean then raise exception 'Duplicate file requires explicit review' using errcode='22023';end if;
 analysis_id:=s.ai_result_id;
 if p_request->>'aiResultId' is not null and (p_request->>'aiResultId')::bigint is distinct from analysis_id then raise exception 'Analysis selection changed' using errcode='PT409';end if;
 if analysis_id is not null then
  select r.* into a from public.dms_ai_extraction_results r where r.id=analysis_id and r.upload_session_id=s.id;
  if not found then raise exception 'Analysis unavailable' using errcode='42501';end if;
  if a.document_id is not null or a.ai_status<>'pending_review' or a.review_action is not null then raise exception 'Analysis already reviewed' using errcode='PT409';end if;
  analysis_hash:=encode(sha256(convert_to(to_jsonb(a)::text,'UTF8')),'hex');
 end if;
 select id,category_id,type_code,coalesce(default_confidentiality,'internal') as default_confidentiality,
  coalesce(requires_expiry_tracking,false) as requires_expiry_tracking into t from public.dms_document_types
  where id=(p_request->>'documentTypeId')::bigint and is_active and deleted_at is null;
 if not found or t.category_id is null or not exists(select 1 from public.dms_document_categories where id=t.category_id and is_active and deleted_at is null) then
  raise exception 'Approval taxonomy unavailable' using errcode='23503';end if;
 context:=erp_private.ai_approval_destination_snapshot(p_request)||jsonb_build_object('metadata',erp_private.ai_approval_metadata(p_request),'links','[]'::jsonb,'tags','[]'::jsonb);
 if p_request->>'partyId' is not null then context:=context||jsonb_build_object('party',erp_private.ai_approval_link_target('party',(p_request->>'partyId')::bigint));end if;
 for item in select v from jsonb_array_elements(p_request->'links') v order by v->>'entityType',(v->>'entityId')::bigint loop
  context:=jsonb_set(context,'{links}',context->'links'||jsonb_build_array(erp_private.ai_approval_link_target(item->>'entityType',(item->>'entityId')::bigint)));
 end loop;
 for item in select v from jsonb_array_elements(p_request->'tagIds') v order by v::text::bigint loop
  select to_jsonb(x) into value from public.dms_tags x where id=item::text::bigint and is_active and deleted_at is null;
  if value is null then raise exception 'Selected tag unavailable' using errcode='23503';end if;
  context:=jsonb_set(context,'{tags}',context->'tags'||jsonb_build_array(value));
 end loop;
 source:=to_jsonb(s)-array['document_id','status','intake_status','is_duplicate','duplicate_document_id'];
 return jsonb_build_object('source',source,'type',to_jsonb(t),'source_fingerprint',encode(sha256(convert_to((source||jsonb_build_object('is_duplicate',s.is_duplicate,'duplicate_document_id',s.duplicate_document_id))::text,'UTF8')),'hex'),
  'context_fingerprint',encode(sha256(convert_to(context::text,'UTF8')),'hex'),'analysis_result_id',analysis_id,'analysis_fingerprint',analysis_hash,'storage_year',extract(year from current_timestamp)::integer);
end $$;
revoke all on function erp_private.ai_approval_snapshot(jsonb) from public,anon,service_role;
grant execute on function erp_private.ai_approval_snapshot(jsonb) to authenticated;
create function public.prepare_numbered_ai_intake(p_request jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select erp_private.ai_approval_snapshot(p_request); $$;
revoke all on function public.prepare_numbered_ai_intake(jsonb) from public,anon,service_role;
grant execute on function public.prepare_numbered_ai_intake(jsonb) to authenticated;

create table erp_private.ai_approval_plans(
 actor_id bigint not null,operation_id uuid not null,request_hash text not null,request_json jsonb not null,
 upload_session_id bigint not null unique,reference_id bigint not null unique,document_id bigint not null unique,
 document_no text not null,approve_run_id bigint not null unique,storage_path text not null,
 result jsonb,created_at timestamptz not null default clock_timestamp(),completed_at timestamptz,
 primary key(actor_id,operation_id)
);
alter table erp_private.ai_approval_plans enable row level security;
alter table erp_private.ai_approval_plans owner to postgres;
revoke all on erp_private.ai_approval_plans from public,anon,authenticated,service_role;
create table erp_private.ai_approval_verified_copies(
 actor_id bigint not null,operation_id uuid not null,verified_session_id uuid not null,
 request_hash text not null,object_id uuid not null,object_version text not null,object_updated_at timestamptz not null,
 content_sha256 text not null,file_size_bytes bigint not null,file_name text not null,
 verified_at timestamptz not null default clock_timestamp(),primary key(actor_id,operation_id),
 foreign key(actor_id,operation_id) references erp_private.ai_approval_plans(actor_id,operation_id)
);
alter table erp_private.ai_approval_verified_copies enable row level security;
alter table erp_private.ai_approval_verified_copies owner to postgres;
revoke all on erp_private.ai_approval_verified_copies from public,anon,authenticated,service_role;

-- Narrow private reservation bookkeeping, not a DMS writer. A direct caller
-- still needs its own exact reserved allocator request and its own RLS-written
-- run. The protected plan never derives authority from its stored snapshot.
create function erp_private.ai_approval_plan(p_operation uuid,p_request jsonb,p_run bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor bigint:=public.current_user_profile_id(); h text:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
 plan erp_private.ai_approval_plans; g record; s record; ext text; target bigint; path text; current_snapshot jsonb;
begin
 perform erp_private.validate_ai_approval_request(p_request,true);
 perform erp_private.assert_ai_approval_authority(p_request);
 if p_operation is null then raise exception 'Approval identity required' using errcode='22023';end if;
 select * into plan from erp_private.ai_approval_plans where actor_id=actor and operation_id=p_operation;
 if found then
  if plan.request_hash is distinct from h or plan.request_json is distinct from p_request then raise exception 'Approval request conflict' using errcode='PT409';end if;
 else
  if exists(select 1 from erp_private.ai_approval_plans where upload_session_id=(p_request->>'uploadSessionId')::bigint) then
   raise exception 'Intake has another retained approval' using errcode='PT409';end if;
  if p_run is null then return null;end if;
  select r.id,r.generated_reference_number,r.generation_status,r.generation_reason,r.generated_by,r.target_table_name,r.target_record_id,
   n.request_hash as allocation_hash,rule.rule_code into g
   from erp_private.numbering_requests n join public.global_numbering_generated_references r on r.id=n.reference_id
   join public.global_numbering_rules rule on rule.id=r.numbering_rule_id
   where n.actor_id=actor and n.operation_id=p_operation;
  -- This callable private bookkeeping helper must not accept another rule or
  -- an alternate allocation argument tuple merely because its reason matches.
  -- MD5 here compares the unchanged allocator receipt format, not metadata.
  perform id from public.dms_upload_sessions where id=(p_request->>'uploadSessionId')::bigint and deleted_at is null for update;
  select id,document_id,status,intake_status,original_filename,mime_type into s from public.dms_upload_sessions
   where id=(p_request->>'uploadSessionId')::bigint and deleted_at is null for update;
  if g.id is null or g.generation_status is distinct from 'reserved' or g.generated_by is distinct from actor
   or g.rule_code is distinct from 'MASTER_DMS_DOCUMENT'
   or g.allocation_hash is distinct from md5(jsonb_build_array(null::bigint,'MASTER_DMS_DOCUMENT'::text,null::text,
    'reserved'::text,'dms_documents'::text,null::bigint,'F06 AI approval '||h)::text)
   or g.target_table_name is distinct from 'dms_documents' or g.target_record_id is not null
   or g.generation_reason is distinct from 'F06 AI approval '||h or s.id is null or s.document_id is not null
   or s.status in ('completed','cancelled','expired') or s.intake_status not in ('review_pending','review_in_progress')
   or not exists(select 1 from public.dms_approve_runs where id=p_run and upload_session_id=s.id and started_by=actor
    and run_key='f06-ai:'||actor||':'||p_operation and status='started' and document_id is null) then
   raise exception 'Matching approval reservation unavailable' using errcode='42501';end if;
  current_snapshot:=erp_private.ai_approval_snapshot(p_request);
  if (p_request->'prepared')-array['content_sha256','storage_year'] is distinct from current_snapshot-'storage_year'
   or (p_request#>>'{prepared,storage_year}')::integer not between 2000 and extract(year from current_timestamp)::integer
   or (p_request#>>'{prepared,source,sha256_hash}' is not null and lower(p_request#>>'{prepared,source,sha256_hash}') is distinct from p_request#>>'{prepared,content_sha256}') then
   raise exception 'Prepared approval changed' using errcode='PT409';end if;
  perform erp_private.assert_ai_approval_authority(p_request);
  target:=nextval(pg_get_serial_sequence('public.dms_documents','id'));
  ext:=lower(substring(s.original_filename from '\.([A-Za-z0-9]{1,16})$'));
  if ext is null then ext:=case lower(btrim(split_part(s.mime_type,';',1))) when 'image/jpeg' then 'jpg' when 'image/png' then 'png'
   when 'image/webp' then 'webp' when 'image/tiff' then 'tiff' when 'text/plain' then 'txt' else 'pdf' end;end if;
  if coalesce(p_request#>>'{prepared,type,type_code}','') in ('','.','..') or p_request#>>'{prepared,type,type_code}' ~ '[/\\]' then
   raise exception 'Invalid storage type' using errcode='22023';end if;
  path:=coalesce(p_request->>'owningCompanyId','0')||'/'||(p_request#>>'{prepared,storage_year}')||'/'||(p_request#>>'{prepared,type,type_code}')||'/'||target||'/v1/original.'||ext;
  insert into erp_private.ai_approval_plans(actor_id,operation_id,request_hash,request_json,upload_session_id,reference_id,document_id,document_no,approve_run_id,storage_path)
   values(actor,p_operation,h,p_request,s.id,g.id,target,g.generated_reference_number,p_run,path) returning * into plan;
 end if;
 perform erp_private.assert_ai_approval_authority(p_request);
 return jsonb_build_object('documentId',plan.document_id,'documentNo',plan.document_no,'upload_session_id',plan.upload_session_id,
  'operation_id',plan.operation_id,'approve_run_id',plan.approve_run_id,'reference_id',plan.reference_id,'storage_path',plan.storage_path,
  'actor_id',actor,'auth_session_id',auth.jwt()->>'session_id','completed',plan.result is not null,'file_id',plan.result->'file_id','replayed',plan.result is not null);
end $$;
alter function erp_private.ai_approval_plan(uuid,jsonb,bigint) owner to postgres;
revoke all on function erp_private.ai_approval_plan(uuid,jsonb,bigint) from public,anon,service_role;
grant execute on function erp_private.ai_approval_plan(uuid,jsonb,bigint) to authenticated;

create function public.reserve_numbered_ai_intake(p_operation uuid,p_request jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor bigint:=public.current_user_profile_id(); plan jsonb; current_snapshot jsonb; allocation jsonb; run bigint; affected integer;
begin
 perform erp_private.validate_ai_approval_request(p_request,true);
 perform erp_private.assert_ai_approval_authority(p_request);
 -- Separate wait and fresh read: STABLE RLS helpers must see a winner's source
 -- binding when same-operation contenders arrive after completion.
 perform id from public.dms_upload_sessions where id=(p_request->>'uploadSessionId')::bigint and deleted_at is null for update;
 perform id from public.dms_upload_sessions where id=(p_request->>'uploadSessionId')::bigint and deleted_at is null for update;
 if not found then raise exception 'Intake unavailable' using errcode='42501';end if;
 perform erp_private.assert_ai_approval_authority(p_request);
 plan:=erp_private.ai_approval_plan(p_operation,p_request);
 if plan is not null and (plan->>'completed')::boolean then return plan;end if;
 current_snapshot:=erp_private.ai_approval_snapshot(p_request);
 if (p_request->'prepared')-array['content_sha256','storage_year'] is distinct from current_snapshot-'storage_year'
  or (p_request#>>'{prepared,storage_year}')::integer not between 2000 and extract(year from current_timestamp)::integer
  or (p_request#>>'{prepared,source,sha256_hash}' is not null and lower(p_request#>>'{prepared,source,sha256_hash}') is distinct from p_request#>>'{prepared,content_sha256}') then
  raise exception 'Prepared approval changed' using errcode='PT409';end if;
 if plan is null then
  allocation:=public.allocate_numbering_reference(p_operation,null,'MASTER_DMS_DOCUMENT',null,'reserved','dms_documents',null,
   'F06 AI approval '||encode(sha256(convert_to(p_request::text,'UTF8')),'hex'));
  if allocation->>'generation_status'<>'reserved' then raise exception 'Approval reference already closed' using errcode='PT409';end if;
  insert into public.dms_approve_runs(upload_session_id,ai_result_id,run_key,status,stage,started_by,metadata_json)
   values((p_request->>'uploadSessionId')::bigint,(p_request#>>'{prepared,analysis_result_id}')::bigint,'f06-ai:'||actor||':'||p_operation,
    'started','f06_reference_reserved',actor,jsonb_build_object('operation_id',p_operation,'mode','single_file_new_document')) returning id into run;
  plan:=erp_private.ai_approval_plan(p_operation,p_request,run);
  update public.dms_upload_sessions set approve_run_id=run,approve_status='processing',approve_error=null,updated_at=clock_timestamp()
   where id=(p_request->>'uploadSessionId')::bigint and document_id is null and (approve_run_id is null or approve_status is distinct from 'processing');
  get diagnostics affected=row_count;if affected<>1 then raise exception 'Intake approval already in progress' using errcode='PT409';end if;
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
   values(actor,'DMS','dms_upload_sessions',(p_request->>'uploadSessionId')::bigint,p_request#>>'{prepared,source,session_code}','update',
    jsonb_build_object('event','ai_approval_reference_reserved','operation_id',p_operation,'reference_id',plan->'reference_id','approve_run_id',run));
 end if;
 -- Allocation/run/source/audit waits do not freeze authorization or analysis.
 perform erp_private.assert_ai_approval_authority(p_request);
 if (p_request->'prepared')-array['content_sha256','storage_year'] is distinct from erp_private.ai_approval_snapshot(p_request)-'storage_year' then
  raise exception 'Prepared approval changed' using errcode='PT409';end if;
 return plan;
end $$;
revoke all on function public.reserve_numbered_ai_intake(uuid,jsonb) from public,anon,service_role;
grant execute on function public.reserve_numbered_ai_intake(uuid,jsonb) to authenticated;

-- Service authority proves byte/object identity only. It never impersonates
-- the actor, sets JWT claims, writes a document, consumes a number or completes
-- a run. Same-byte collision recovery claims current verified content, not the
-- identity of the first uploader. Paths come only from the protected plan.
create function public.attest_numbered_ai_intake(p_actor bigint,p_session uuid,p_operation uuid,p_request jsonb,
 p_object uuid,p_version text,p_updated_at timestamptz,p_sha256 text,p_size bigint,p_file_name text)
returns void language plpgsql security definer set search_path='' as $$
declare plan erp_private.ai_approval_plans; old erp_private.ai_approval_verified_copies; o record; s record;
 h text:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
begin
 if auth.role() is distinct from 'service_role' or not erp_private.provider_actor_session_valid(p_actor,p_session) then
  raise exception 'Verification identity unavailable' using errcode='42501';end if;
 select * into plan from erp_private.ai_approval_plans where actor_id=p_actor and operation_id=p_operation;
 if not found or plan.request_hash is distinct from h or plan.request_json is distinct from p_request or plan.result is not null
  or p_object is null or nullif(p_version,'') is null or p_updated_at is null or p_sha256 is distinct from p_request#>>'{prepared,content_sha256}'
  or p_size is distinct from (p_request#>>'{prepared,source,file_size_bytes}')::bigint
  or coalesce(length(p_file_name),0) not between 1 and 200 or p_file_name ~ '[/\\]' then raise exception 'Verification plan mismatch' using errcode='PT409';end if;
 select id,session_code,uploaded_by,owning_company_id,owning_branch_id,temp_storage_path,original_filename,mime_type,file_size_bytes,sha256_hash,ai_result_id
  into s from public.dms_upload_sessions where id=plan.upload_session_id and document_id is null and deleted_at is null
   and approve_run_id=plan.approve_run_id and approve_status='processing' and intake_status in ('review_pending','review_in_progress');
 if not found or to_jsonb(s) is distinct from p_request#>'{prepared,source}' then raise exception 'Verified source changed' using errcode='PT409';end if;
 perform pg_advisory_xact_lock(hashtextextended('f06-ai-copy:'||p_actor||':'||p_operation,0));
 select id,version,updated_at,metadata into o from storage.objects where bucket_id='dms-documents' and name=plan.storage_path for share;
 -- Storage info serializes timestamps to milliseconds; retain the full DB
 -- timestamp privately and compare that full value on subsequent completion.
 if not found or row(o.id,o.version,date_trunc('milliseconds',o.updated_at)) is distinct from row(p_object,p_version,p_updated_at)
  or (o.metadata->>'size')::bigint is distinct from p_size or o.metadata->>'mimetype' is distinct from s.mime_type then
  raise exception 'Verified destination changed' using errcode='PT409';end if;
 select * into old from erp_private.ai_approval_verified_copies where actor_id=p_actor and operation_id=p_operation;
 if found then
  if row(old.request_hash,old.object_id,old.object_version,old.object_updated_at,old.content_sha256,old.file_size_bytes,old.file_name)
   is distinct from row(h,p_object,p_version,o.updated_at,p_sha256,p_size,p_file_name) then raise exception 'Copy attestation is immutable' using errcode='PT409';end if;
 else
  insert into erp_private.ai_approval_verified_copies(actor_id,operation_id,verified_session_id,request_hash,object_id,object_version,object_updated_at,content_sha256,file_size_bytes,file_name)
   values(p_actor,p_operation,p_session,h,p_object,p_version,o.updated_at,p_sha256,p_size,p_file_name);
 end if;
 if not erp_private.provider_actor_session_valid(p_actor,p_session) then raise exception 'Verification session ended' using errcode='42501';end if;
end $$;
alter function public.attest_numbered_ai_intake(bigint,uuid,uuid,jsonb,uuid,text,timestamptz,text,bigint,text) owner to postgres;
revoke all on function public.attest_numbered_ai_intake(bigint,uuid,uuid,jsonb,uuid,text,timestamptz,text,bigint,text) from public,anon,authenticated;
grant execute on function public.attest_numbered_ai_intake(bigint,uuid,uuid,jsonb,uuid,text,timestamptz,text,bigint,text) to service_role;

-- Read-only row locks after the invoker's visible-context validation. These
-- locks grant no row data and do not require unrelated catalogue UPDATE roles.
create function erp_private.lock_ai_approval_context(p_request jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare item record; target text;
begin
 perform erp_private.assert_ai_approval_authority(p_request);
 perform erp_private.lock_dms_creation_taxonomy((p_request->>'documentTypeId')::bigint,(p_request#>>'{prepared,type,category_id}')::bigint,
  (p_request->>'owningCompanyId')::bigint,(p_request->>'owningBranchId')::bigint,coalesce(p_request->>'confidentialityLevel',p_request#>>'{prepared,type,default_confidentiality}'));
 perform id from public.dms_metadata_definitions where document_type_id=(p_request->>'documentTypeId')::bigint order by id for share;
 perform id from public.dms_tags where id in (select v::text::bigint from jsonb_array_elements(p_request->'tagIds') v) order by id for share;
 -- Normalize aliases to physical relation before sorting; different aliases
 -- must not acquire the same employee rows in opposite orders. Include the
 -- selected scope in this one order (all companies before all branches).
 for item in select distinct relation,id,case relation when 'owner_companies' then 0 when 'branches' then 1 when 'employees' then 2 when 'parties' then 3 else 4 end as priority from (select case kind
   when 'party' then 'parties' when 'party_license' then 'party_licenses' when 'party_tax_registration' then 'party_tax_registrations'
   when 'company' then 'owner_companies' when 'branch' then 'branches' when 'bank' then 'banks' when 'site' then 'work_sites'
   when 'employee' then 'employees' when 'employee_compliance' then 'employees' when 'employee_contract' then 'employees' when 'employee_leave_request' then 'employees'
   when 'employee_dependent' then 'employee_dependents' when 'employee_identity_document' then 'employee_identity_documents' end as relation,id from (
   select v->>'entityType' as kind,(v->>'entityId')::bigint as id from jsonb_array_elements(p_request->'links') v
   union all select 'party',(p_request->>'partyId')::bigint where p_request->>'partyId' is not null
   union all select 'company',(p_request->>'owningCompanyId')::bigint where p_request->>'owningCompanyId' is not null
   union all select 'branch',(p_request->>'owningBranchId')::bigint where p_request->>'owningBranchId' is not null
  ) x) mapped order by priority,relation,id loop
  target:=item.relation;
  if target is null then raise exception 'Link target mapping unavailable' using errcode='22023';end if;
  execute format('select id from public.%I where id=$1 for share',target) using item.id;
 end loop;
 perform erp_private.assert_ai_approval_authority(p_request);
end $$;
alter function erp_private.lock_ai_approval_context(jsonb) owner to postgres;
revoke all on function erp_private.lock_ai_approval_context(jsonb) from public,anon,service_role;
grant execute on function erp_private.lock_ai_approval_context(jsonb) to authenticated;

create function erp_private.assert_ai_approval_copy(p_operation uuid,p_request jsonb,p_file_name text)
returns void language plpgsql security definer set search_path='' as $$
declare plan erp_private.ai_approval_plans; proof erp_private.ai_approval_verified_copies; o record;
begin
 perform erp_private.assert_ai_approval_authority(p_request);
 select * into plan from erp_private.ai_approval_plans where actor_id=public.current_user_profile_id() and operation_id=p_operation;
 select * into proof from erp_private.ai_approval_verified_copies where actor_id=public.current_user_profile_id() and operation_id=p_operation;
 if plan.actor_id is null or proof.actor_id is null or plan.request_json is distinct from p_request
  or proof.request_hash is distinct from plan.request_hash or proof.file_name is distinct from p_file_name
  or proof.content_sha256 is distinct from p_request#>>'{prepared,content_sha256}' then raise exception 'Trusted file verification unavailable' using errcode='42501';end if;
 select id,version,updated_at,metadata into o from storage.objects where bucket_id='dms-documents' and name=plan.storage_path for share;
 if not found or row(o.id,o.version,o.updated_at) is distinct from row(proof.object_id,proof.object_version,proof.object_updated_at)
  or (o.metadata->>'size')::bigint is distinct from proof.file_size_bytes or o.metadata->>'mimetype' is distinct from p_request#>>'{prepared,source,mime_type}' then
  raise exception 'Verified file changed' using errcode='PT409';end if;
 perform erp_private.assert_ai_approval_authority(p_request);
end $$;
alter function erp_private.assert_ai_approval_copy(uuid,jsonb,text) owner to postgres;
revoke all on function erp_private.assert_ai_approval_copy(uuid,jsonb,text) from public,anon,service_role;
grant execute on function erp_private.assert_ai_approval_copy(uuid,jsonb,text) to authenticated;

-- The only elevated completion mutation is immutable receipt bookkeeping.
-- Direct calls cannot fabricate completion from a status flag: all mandatory
-- invoker-written children, consumed reference, source, run, event and audit
-- facts must match the retained request exactly.
create function erp_private.complete_ai_approval(p_operation uuid,p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor bigint:=public.current_user_profile_id(); plan erp_private.ai_approval_plans; proof erp_private.ai_approval_verified_copies;
 d record; f record; receipt jsonb; expected jsonb; actual jsonb; metadata jsonb;
begin
 perform erp_private.assert_ai_approval_authority(p_request);
 select * into plan from erp_private.ai_approval_plans where actor_id=actor and operation_id=p_operation for update;
 if not found or plan.request_json is distinct from p_request then raise exception 'Approval receipt unavailable' using errcode='42501';end if;
 if plan.result is not null then return plan.result||jsonb_build_object('replayed',true);end if;
 select * into proof from erp_private.ai_approval_verified_copies where actor_id=actor and operation_id=p_operation;
 if not found then raise exception 'Approval file proof unavailable' using errcode='42501';end if;
 perform erp_private.assert_ai_approval_copy(p_operation,p_request,proof.file_name);
 select id,document_no,title,description,document_type_id,category_id,status,confidentiality_level,owner_user_id,owning_company_id,owning_branch_id,party_id,
  issue_date,expiry_date,created_by,current_version_id into d from public.dms_documents where id=plan.document_id and deleted_at is null;
 if not found or row(d.document_no,d.title,d.description,d.document_type_id,d.category_id,d.status,d.confidentiality_level,d.owner_user_id,
   d.owning_company_id,d.owning_branch_id,d.party_id,d.issue_date,d.expiry_date,d.created_by)
  is distinct from row(plan.document_no,btrim(p_request->>'title'),nullif(p_request->>'description',''),(p_request->>'documentTypeId')::bigint,
   (p_request#>>'{prepared,type,category_id}')::bigint,'active'::text,coalesce(p_request->>'confidentialityLevel',p_request#>>'{prepared,type,default_confidentiality}'),actor,
   (p_request->>'owningCompanyId')::bigint,(p_request->>'owningBranchId')::bigint,(p_request->>'partyId')::bigint,nullif(p_request->>'issueDate','')::date,nullif(p_request->>'expiryDate','')::date,actor) then
  raise exception 'Approval document facts incomplete' using errcode='PT409';end if;
 select x.id,x.version_id into f from public.dms_document_files x join public.dms_document_versions v on v.id=x.version_id
  where x.document_id=d.id and v.document_id=d.id and v.id=d.current_version_id and v.version_number=1 and v.is_current and v.created_by=actor
   and x.file_role='original' and x.storage_bucket='dms-documents' and x.storage_path=plan.storage_path and x.file_name=proof.file_name
   and x.mime_type=p_request#>>'{prepared,source,mime_type}' and x.file_size_bytes=proof.file_size_bytes and x.sha256_hash=proof.content_sha256
   and x.created_by=actor and x.deleted_at is null;
 if not found or (select count(*) from public.dms_document_files where document_id=d.id and deleted_at is null)<>1
  or (select count(*) from public.dms_document_versions where document_id=d.id)<>1 then raise exception 'Approval file facts incomplete' using errcode='PT409';end if;
 metadata:=erp_private.ai_approval_metadata(p_request);
 select coalesce(jsonb_agg(jsonb_build_object('definition_id',m.definition_id,'value_text',m.value_text,'value_number',m.value_number,'value_date',m.value_date,
  'value_datetime',m.value_datetime,'value_boolean',m.value_boolean,'value_json',m.value_json) order by m.definition_id),'[]'::jsonb) into actual
  from public.dms_document_metadata_values m where document_id=d.id and deleted_at is null;
 if actual is distinct from metadata then raise exception 'Approval metadata incomplete' using errcode='PT409';end if;
 select coalesce(jsonb_agg(v order by v::text::bigint),'[]'::jsonb) into expected from jsonb_array_elements(p_request->'tagIds') v;
 select coalesce(jsonb_agg(tag_id order by tag_id),'[]'::jsonb) into actual from public.dms_document_tags where document_id=d.id;
 if actual is distinct from expected then raise exception 'Approval tags incomplete' using errcode='PT409';end if;
 select coalesce(jsonb_agg(jsonb_build_object('kind',v->>'entityType','id',(v->>'entityId')::bigint,'role',coalesce(nullif(v->>'linkRole',''),'related'),'primary',coalesce((v->>'isPrimary')::boolean,false)) order by v->>'entityType',(v->>'entityId')::bigint),'[]'::jsonb)
  into expected from jsonb_array_elements(p_request->'links') v;
 select coalesce(jsonb_agg(jsonb_build_object('kind',entity_type,'id',entity_id,'role',link_role,'primary',is_primary) order by entity_type,entity_id),'[]'::jsonb)
  into actual from public.dms_document_links where document_id=d.id and deleted_at is null;
 if actual is distinct from expected then raise exception 'Approval links incomplete' using errcode='PT409';end if;
 select coalesce(jsonb_agg(jsonb_build_object('days',n,'date',d.expiry_date-n,'status','pending') order by n),'[]'::jsonb) into expected
  from unnest(array[90,60,30,14,7,1]) n where d.expiry_date is not null;
 select coalesce(jsonb_agg(jsonb_build_object('days',reminder_days_before,'date',reminder_date,'status',status) order by reminder_days_before),'[]'::jsonb)
  into actual from public.dms_expiry_reminders where document_id=d.id;
 if actual is distinct from expected then raise exception 'Approval reminders incomplete' using errcode='PT409';end if;
 if not exists(select 1 from public.dms_upload_sessions where id=plan.upload_session_id and document_id=d.id and status='completed' and intake_status='approved'
   and review_status='approved' and reviewed_by=actor and approve_run_id=plan.approve_run_id and approve_status='completed' and deleted_at is null)
  or not exists(select 1 from public.dms_approve_runs where id=plan.approve_run_id and upload_session_id=plan.upload_session_id and document_id=d.id
   and run_key='f06-ai:'||actor||':'||p_operation and status='completed' and started_by=actor and final_storage_path=plan.storage_path and final_storage_bucket='dms-documents')
  or (p_request#>>'{prepared,analysis_result_id}' is not null and not exists(select 1 from public.dms_ai_extraction_results
   where id=(p_request#>>'{prepared,analysis_result_id}')::bigint and upload_session_id=plan.upload_session_id and document_id=d.id and ai_status='accepted' and review_action='accepted' and reviewed_by=actor))
  or not exists(select 1 from public.global_numbering_generated_references where id=plan.reference_id and generated_by=actor and generation_status='consumed'
   and target_table_name='dms_documents' and target_record_id=d.id and generation_reason='F06 AI approval '||plan.request_hash)
  or not exists(select 1 from public.dms_document_events where document_id=d.id and performed_by=actor and event_type='document_created_from_ai_intake' and metadata_json->>'operation_id'=p_operation::text)
  or not exists(select 1 from public.dms_document_events where document_id=d.id and performed_by=actor and event_type='approve_save_db_transaction_completed' and metadata_json->>'operation_id'=p_operation::text)
  or not exists(select 1 from public.dms_document_events where document_id=d.id and performed_by=actor and event_type='file_uploaded' and metadata_json->>'operation_id'=p_operation::text and (metadata_json->>'file_id')::bigint=f.id)
  or not exists(select 1 from public.audit_logs where actor_user_profile_id=actor and entity_name='dms_documents' and entity_id=d.id and new_values->>'event'='single_file_ai_approval_completed' and new_values->>'operation_id'=p_operation::text) then
  raise exception 'Approval completion facts incomplete' using errcode='PT409';end if;
 receipt:=jsonb_build_object('documentId',d.id,'documentNo',d.document_no,'upload_session_id',plan.upload_session_id,'operation_id',p_operation,
  'approve_run_id',plan.approve_run_id,'file_id',f.id,'completed',true,'replayed',false);
 update erp_private.ai_approval_plans set result=receipt,completed_at=clock_timestamp() where actor_id=actor and operation_id=p_operation;
 perform erp_private.assert_ai_approval_authority(p_request);
 return receipt;
end $$;
alter function erp_private.complete_ai_approval(uuid,jsonb) owner to postgres;
revoke all on function erp_private.complete_ai_approval(uuid,jsonb) from public,anon,service_role;
grant execute on function erp_private.complete_ai_approval(uuid,jsonb) to authenticated;

create function public.finish_numbered_ai_intake(p_operation uuid,p_request jsonb,p_file_name text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare plan jsonb; actor bigint:=public.current_user_profile_id(); target bigint; session_id bigint; run bigint;
 version_id bigint; file_id bigint; affected integer; item jsonb; days integer; metadata jsonb;
begin
 -- This takes the source lock and rechecks the exact retained request/current
 -- authority. It may reserve only if called directly with a fresh valid request;
 -- a missing copy proof then raises and rolls that entire attempt back.
 plan:=public.reserve_numbered_ai_intake(p_operation,p_request);
 if (plan->>'completed')::boolean then return erp_private.complete_ai_approval(p_operation,p_request);end if;
 target:=(plan->>'documentId')::bigint;session_id:=(plan->>'upload_session_id')::bigint;run:=(plan->>'approve_run_id')::bigint;
 perform erp_private.assert_ai_approval_copy(p_operation,p_request,p_file_name);
 -- Ordinary RLS reads above precede private row locks; repeat the visible
 -- snapshot after waits. Analysis needs its existing review UPDATE authority.
 perform erp_private.lock_ai_approval_context(p_request);
 if p_request#>>'{prepared,analysis_result_id}' is not null then
  perform id from public.dms_ai_extraction_results where id=(p_request#>>'{prepared,analysis_result_id}')::bigint and upload_session_id=session_id for update;
  if not found then raise exception 'Analysis review unavailable' using errcode='42501';end if;
 end if;
 if (p_request->'prepared')-array['content_sha256','storage_year'] is distinct from erp_private.ai_approval_snapshot(p_request)-'storage_year' then
  raise exception 'Prepared approval changed' using errcode='PT409';end if;
 metadata:=erp_private.ai_approval_metadata(p_request);
 insert into public.dms_documents(id,document_no,title,description,document_type_id,category_id,status,confidentiality_level,owner_user_id,
  owning_company_id,owning_branch_id,party_id,issue_date,expiry_date,created_by,updated_by) overriding system value
 values(target,plan->>'documentNo',btrim(p_request->>'title'),nullif(p_request->>'description',''),(p_request->>'documentTypeId')::bigint,
  (p_request#>>'{prepared,type,category_id}')::bigint,'active',coalesce(p_request->>'confidentialityLevel',p_request#>>'{prepared,type,default_confidentiality}'),actor,
  (p_request->>'owningCompanyId')::bigint,(p_request->>'owningBranchId')::bigint,(p_request->>'partyId')::bigint,
  nullif(p_request->>'issueDate','')::date,nullif(p_request->>'expiryDate','')::date,actor,actor);
 -- INSERT RETURNING cannot satisfy the existing STABLE parent reread policy.
 perform id from public.dms_documents where id=target and document_no=plan->>'documentNo' and created_by=actor and deleted_at is null;
 if not found then raise exception 'Created document unavailable' using errcode='42501';end if;
 insert into public.dms_document_versions(document_id,version_number,version_label,change_notes,is_current,created_by)
  values(target,1,'v1','Created from AI intake',true,actor) returning id into version_id;
 insert into public.dms_document_files(document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,created_by)
  values(target,version_id,'original','dms-documents',plan->>'storage_path',p_file_name,p_request#>>'{prepared,source,mime_type}',
   (p_request#>>'{prepared,source,file_size_bytes}')::bigint,p_request#>>'{prepared,content_sha256}',actor) returning id into file_id;
 update public.dms_documents set current_version_id=version_id,updated_by=actor,updated_at=clock_timestamp() where id=target and current_version_id is null;
 get diagnostics affected=row_count;if affected<>1 then raise exception 'Document version update denied' using errcode='42501';end if;
 for item in select v from jsonb_array_elements(metadata) v loop
  insert into public.dms_document_metadata_values(document_id,definition_id,value_text,value_number,value_date,value_datetime,value_boolean,value_json,created_by,updated_by)
   values(target,(item->>'definition_id')::bigint,item->>'value_text',(item->>'value_number')::numeric,(item->>'value_date')::date,
    (item->>'value_datetime')::timestamptz,(item->>'value_boolean')::boolean,nullif(item->'value_json','null'::jsonb),actor,actor);
 end loop;
 for item in select v from jsonb_array_elements(p_request->'tagIds') v loop
  insert into public.dms_document_tags(document_id,tag_id,created_by) values(target,item::text::bigint,actor);
 end loop;
 for item in select v from jsonb_array_elements(p_request->'links') v loop
  insert into public.dms_document_links(document_id,entity_type,entity_id,link_role,is_primary,linked_by)
   values(target,item->>'entityType',(item->>'entityId')::bigint,coalesce(nullif(item->>'linkRole',''),'related'),coalesce((item->>'isPrimary')::boolean,false),actor);
 end loop;
 if nullif(p_request->>'expiryDate','') is not null then
  foreach days in array array[90,60,30,14,7,1] loop
   insert into public.dms_expiry_reminders(document_id,reminder_days_before,reminder_date,status)
    values(target,days,(p_request->>'expiryDate')::date-days,'pending');
  end loop;
 end if;
 if p_request#>>'{prepared,analysis_result_id}' is not null then
  update public.dms_ai_extraction_results set ai_status='accepted',review_action='accepted',reviewed_by=actor,reviewed_at=clock_timestamp(),document_id=target
   where id=(p_request#>>'{prepared,analysis_result_id}')::bigint and upload_session_id=session_id and document_id is null and ai_status='pending_review' and review_action is null;
  get diagnostics affected=row_count;if affected<>1 then raise exception 'Analysis acceptance denied' using errcode='42501';end if;
 end if;
 update public.dms_upload_sessions set status='completed',intake_status='approved',review_status='approved',document_id=target,
  approve_run_id=run,approve_status='completed',approve_error=null,approved_at=clock_timestamp(),review_completed_at=clock_timestamp(),reviewed_by=actor,
  completed_at=clock_timestamp(),updated_at=clock_timestamp() where id=session_id and document_id is null and approve_run_id=run and approve_status='processing';
 get diagnostics affected=row_count;if affected<>1 then raise exception 'Intake completion denied' using errcode='42501';end if;
 insert into public.dms_document_events(document_id,event_type,description,performed_by,metadata_json) values
  (target,'document_created_from_ai_intake','Document created from AI intake',actor,jsonb_build_object('operation_id',p_operation,'upload_session_id',session_id,'ai_result_id',p_request#>'{prepared,analysis_result_id}','approve_run_id',run)),
  (target,'approve_save_db_transaction_completed','Approve & Save core DB transaction completed',actor,jsonb_build_object('operation_id',p_operation,'approve_run_id',run,'file_id',file_id,'version_id',version_id)),
  (target,'file_uploaded','File attached from AI intake approval',actor,jsonb_build_object('operation_id',p_operation,'file_id',file_id,'version_id',version_id,'storage_path',plan->>'storage_path'));
 if jsonb_array_length(metadata)>0 then
  insert into public.dms_document_events(document_id,event_type,description,performed_by,metadata_json)
   values(target,'metadata_updated','Metadata saved from AI intake approval',actor,jsonb_build_object('operation_id',p_operation,'metadata_count',jsonb_array_length(metadata)));
 end if;
 update public.dms_approve_runs set status='completed',stage='approve_save_completed',document_id=target,ai_result_id=(p_request#>>'{prepared,analysis_result_id}')::bigint,
  final_storage_bucket='dms-documents',final_storage_path=plan->>'storage_path',metadata_json=jsonb_build_object('operation_id',p_operation,'mode','single_file_new_document',
   'file_id',file_id,'version_id',version_id,'metadata_count',jsonb_array_length(metadata),'tag_count',jsonb_array_length(p_request->'tagIds'),'link_count',jsonb_array_length(p_request->'links')),
  error_code=null,error_message=null,completed_at=clock_timestamp(),updated_at=clock_timestamp()
  where id=run and upload_session_id=session_id and started_by=actor and status='started' and document_id is null;
 get diagnostics affected=row_count;if affected<>1 then raise exception 'Approval run completion denied' using errcode='42501';end if;
 perform public.finish_numbering_reservation(p_operation,'consumed','dms_documents',target,null);
 insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
  values(actor,'DMS','dms_documents',target,plan->>'documentNo','create',jsonb_build_object('event','single_file_ai_approval_completed','operation_id',p_operation,
   'upload_session_id',session_id,'approve_run_id',run,'file_id',file_id,'version_id',version_id));
 -- No cached admission after the final audit wait. Both scopes and independent
 -- review/preview/upload/numbering authority must still be current.
 perform erp_private.assert_ai_approval_authority(p_request);
 perform id from public.dms_upload_sessions where id=session_id and document_id=target and deleted_at is null;
 if not found then raise exception 'Completed intake unavailable' using errcode='42501';end if;
 if p_request#>>'{prepared,analysis_result_id}' is not null then
  perform id from public.dms_ai_extraction_results where id=(p_request#>>'{prepared,analysis_result_id}')::bigint and upload_session_id=session_id and document_id=target;
  if not found then raise exception 'Completed analysis unavailable' using errcode='42501';end if;
 end if;
 return erp_private.complete_ai_approval(p_operation,p_request);
end $$;
revoke all on function public.finish_numbered_ai_intake(uuid,jsonb,text) from public,anon,service_role;
grant execute on function public.finish_numbered_ai_intake(uuid,jsonb,text) to authenticated;

-- Existing batch transaction copied verbatim from F01, with only the mode
-- rejection above its original body. Existing ACLs and batch behavior remain.
CREATE OR REPLACE FUNCTION public.approve_dms_ai_intake(p_payload jsonb)
 RETURNS TABLE(out_document_id bigint, out_document_no text, out_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id BIGINT;
  v_mode TEXT := COALESCE(p_payload->>'mode', 'single_file_new_document');
  v_upload_session_id BIGINT := NULLIF(p_payload->>'upload_session_id', '')::BIGINT;
  v_approve_run_id BIGINT := NULLIF(p_payload->>'approve_run_id', '')::BIGINT;
  v_ai_result_id BIGINT := NULLIF(p_payload->>'ai_result_id', '')::BIGINT;
  v_document_id BIGINT := NULLIF(p_payload->>'document_id', '')::BIGINT;
  v_document_no TEXT := NULLIF(p_payload->>'document_no', '');
  v_now TIMESTAMPTZ := now();
  v_session public.dms_upload_sessions%ROWTYPE;
  v_existing_document_no TEXT;
  v_version_id BIGINT;
  v_file_id BIGINT;
  v_item JSONB;
BEGIN
  -- F06: only the retained batch-draft path may use this legacy endpoint.
  -- Single-file creation must use its operation-bound invoker consumer.
  IF v_mode IS DISTINCT FROM 'existing_batch_draft' THEN
    RAISE EXCEPTION 'Single-file approval requires the retained approval protocol' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_actor_id := current_user_profile_id();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'User profile not found' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    current_user_has_permission('dms.documents.upload')
    OR current_user_has_permission('dms.documents.review_ai')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  ) THEN
    RAISE EXCEPTION 'Permission denied for DMS AI intake approval' USING ERRCODE = '42501';
  END IF;

  IF v_upload_session_id IS NULL THEN
    RAISE EXCEPTION 'upload_session_id is required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_session
  FROM public.dms_upload_sessions
  WHERE id = v_upload_session_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Upload session not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.uploaded_by IS DISTINCT FROM v_actor_id AND NOT (
    public.current_user_has_permission('dms.documents.review_ai') OR public.current_user_has_permission('dms.admin')
  ) THEN RAISE EXCEPTION 'Upload session access denied' USING ERRCODE = '42501'; END IF;

  IF v_session.intake_status = 'approved' AND v_session.document_id IS NOT NULL THEN
    SELECT d.document_no
    INTO v_existing_document_no
    FROM public.dms_documents d
    WHERE d.id = v_session.document_id;

    IF v_approve_run_id IS NOT NULL THEN
      UPDATE public.dms_approve_runs
      SET status = 'already_approved',
          stage = 'approve_save_already_approved',
          document_id = v_session.document_id,
          completed_at = v_now,
          updated_at = v_now,
          metadata_json = COALESCE(metadata_json, '{}'::jsonb) || jsonb_build_object('returned_existing_document', true)
      WHERE id = v_approve_run_id;
    END IF;

    RETURN QUERY SELECT v_session.document_id, v_existing_document_no, 'already_approved'::TEXT;
    RETURN;
  END IF;

  IF v_session.intake_status IN ('discarded', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'Upload session is not eligible for approval: %', v_session.intake_status USING ERRCODE = '22023';
  END IF;

  IF v_session.approve_status = 'processing'
     AND v_session.approve_run_id IS NOT NULL
     AND (v_approve_run_id IS NULL OR v_session.approve_run_id <> v_approve_run_id) THEN
    RAISE EXCEPTION 'Approval is already in progress for this upload session' USING ERRCODE = '55P03';
  END IF;

  IF v_mode NOT IN ('single_file_new_document', 'existing_batch_draft') THEN
    RAISE EXCEPTION 'Unsupported approve mode: %', v_mode USING ERRCODE = '22023';
  END IF;

  IF v_document_no IS NULL THEN
    RAISE EXCEPTION 'document_no is required' USING ERRCODE = '22023';
  END IF;

  IF v_mode = 'single_file_new_document' THEN
    IF v_document_id IS NULL THEN
      RAISE EXCEPTION 'reserved document_id is required for single file approval' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.dms_documents (
      id,
      document_no,
      title,
      description,
      document_type_id,
      category_id,
      status,
      confidentiality_level,
      owner_user_id,
      owning_company_id,
      owning_branch_id,
      party_id,
      issue_date,
      expiry_date,
      created_by,
      created_at,
      updated_by,
      updated_at
    )
    OVERRIDING SYSTEM VALUE
    VALUES (
      v_document_id,
      v_document_no,
      p_payload->>'title',
      NULLIF(p_payload->>'description', ''),
      (p_payload->>'document_type_id')::BIGINT,
      (p_payload->>'category_id')::BIGINT,
      'active',
      COALESCE(NULLIF(p_payload->>'confidentiality_level', ''), 'internal'),
      v_actor_id,
      NULLIF(p_payload->>'owning_company_id', '')::BIGINT,
      NULLIF(p_payload->>'owning_branch_id', '')::BIGINT,
      NULLIF(p_payload->>'party_id', '')::BIGINT,
      NULLIF(p_payload->>'issue_date', '')::DATE,
      NULLIF(p_payload->>'expiry_date', '')::DATE,
      v_actor_id,
      v_now,
      v_actor_id,
      v_now
    );
  ELSE
    v_document_id := COALESCE(v_document_id, v_session.document_id);
    IF v_document_id IS NULL THEN
      RAISE EXCEPTION 'document_id is required for batch draft approval' USING ERRCODE = '22023';
    END IF;

    UPDATE public.dms_documents
    SET title = p_payload->>'title',
        description = NULLIF(p_payload->>'description', ''),
        document_type_id = (p_payload->>'document_type_id')::BIGINT,
        category_id = (p_payload->>'category_id')::BIGINT,
        status = 'active',
        confidentiality_level = COALESCE(NULLIF(p_payload->>'confidentiality_level', ''), confidentiality_level, 'internal'),
        owning_company_id = NULLIF(p_payload->>'owning_company_id', '')::BIGINT,
        owning_branch_id = NULLIF(p_payload->>'owning_branch_id', '')::BIGINT,
        party_id = NULLIF(p_payload->>'party_id', '')::BIGINT,
        issue_date = NULLIF(p_payload->>'issue_date', '')::DATE,
        expiry_date = NULLIF(p_payload->>'expiry_date', '')::DATE,
        updated_by = v_actor_id,
        updated_at = v_now
    WHERE id = v_document_id
      AND deleted_at IS NULL
      AND status = 'pending_ai_review';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Batch draft document is not eligible for approval' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF COALESCE((p_payload->>'create_file_version')::BOOLEAN, true) THEN
    INSERT INTO public.dms_document_versions (
      document_id,
      version_number,
      version_label,
      change_notes,
      is_current,
      created_by,
      created_at
    )
    VALUES (
      v_document_id,
      COALESCE(NULLIF(p_payload->>'version_number', '')::INT, 1),
      COALESCE(NULLIF(p_payload->>'version_label', ''), 'v1'),
      COALESCE(NULLIF(p_payload->>'change_notes', ''), 'Created from AI intake'),
      true,
      v_actor_id,
      v_now
    )
    RETURNING id INTO v_version_id;

    INSERT INTO public.dms_document_files (
      document_id,
      version_id,
      file_role,
      storage_bucket,
      storage_path,
      file_name,
      mime_type,
      file_size_bytes,
      sha256_hash,
      created_by,
      created_at
    )
    VALUES (
      v_document_id,
      v_version_id,
      'original',
      p_payload->>'final_storage_bucket',
      p_payload->>'final_storage_path',
      p_payload->>'file_name',
      p_payload->>'mime_type',
      (p_payload->>'file_size_bytes')::BIGINT,
      NULLIF(p_payload->>'sha256_hash', ''),
      v_actor_id,
      v_now
    )
    RETURNING id INTO v_file_id;

    UPDATE public.dms_documents
    SET current_version_id = v_version_id,
        updated_by = v_actor_id,
        updated_at = v_now
    WHERE id = v_document_id;
  ELSE
    v_file_id := NULLIF(p_payload->>'file_id', '')::BIGINT;
  END IF;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'metadata_values', '[]'::jsonb))
  LOOP
    INSERT INTO public.dms_document_metadata_values (
      document_id,
      definition_id,
      value_text,
      value_number,
      value_date,
      value_datetime,
      value_boolean,
      value_json,
      created_by,
      created_at,
      updated_by,
      updated_at
    )
    VALUES (
      v_document_id,
      (v_item->>'definition_id')::BIGINT,
      NULLIF(v_item->>'value_text', ''),
      NULLIF(v_item->>'value_number', '')::NUMERIC,
      NULLIF(v_item->>'value_date', '')::DATE,
      NULLIF(v_item->>'value_datetime', '')::TIMESTAMPTZ,
      CASE WHEN v_item ? 'value_boolean' THEN (v_item->>'value_boolean')::BOOLEAN ELSE NULL END,
      CASE WHEN v_item ? 'value_json' THEN v_item->'value_json' ELSE NULL END,
      v_actor_id,
      v_now,
      v_actor_id,
      v_now
    )
    ON CONFLICT (document_id, definition_id)
    DO UPDATE SET
      value_text = EXCLUDED.value_text,
      value_number = EXCLUDED.value_number,
      value_date = EXCLUDED.value_date,
      value_datetime = EXCLUDED.value_datetime,
      value_boolean = EXCLUDED.value_boolean,
      value_json = EXCLUDED.value_json,
      updated_by = EXCLUDED.updated_by,
      updated_at = EXCLUDED.updated_at,
      deleted_at = NULL;
  END LOOP;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'tag_ids', '[]'::jsonb))
  LOOP
    INSERT INTO public.dms_document_tags (document_id, tag_id, created_by, created_at)
    VALUES (v_document_id, (v_item #>> '{}')::BIGINT, v_actor_id, v_now)
    ON CONFLICT (document_id, tag_id) DO NOTHING;
  END LOOP;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'links', '[]'::jsonb))
  LOOP
    INSERT INTO public.dms_document_links (
      document_id,
      entity_type,
      entity_id,
      link_role,
      is_primary,
      linked_by,
      linked_at,
      created_at,
      deleted_at
    )
    SELECT
      v_document_id,
      v_item->>'entity_type',
      (v_item->>'entity_id')::BIGINT,
      COALESCE(NULLIF(v_item->>'link_role', ''), 'related'),
      COALESCE((v_item->>'is_primary')::BOOLEAN, false),
      v_actor_id,
      v_now,
      v_now,
      NULL
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.dms_document_links l
      WHERE l.document_id = v_document_id
        AND l.entity_type = v_item->>'entity_type'
        AND l.entity_id = (v_item->>'entity_id')::BIGINT
        AND l.deleted_at IS NULL
    );
  END LOOP;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'reminders', '[]'::jsonb))
  LOOP
    INSERT INTO public.dms_expiry_reminders (
      document_id,
      reminder_days_before,
      reminder_date,
      status,
      updated_at
    )
    VALUES (
      v_document_id,
      (v_item->>'reminder_days_before')::INT,
      (v_item->>'reminder_date')::DATE,
      COALESCE(NULLIF(v_item->>'status', ''), 'pending'),
      v_now
    )
    ON CONFLICT (document_id, reminder_days_before)
    DO UPDATE SET
      reminder_date = EXCLUDED.reminder_date,
      status = EXCLUDED.status,
      updated_at = EXCLUDED.updated_at;
  END LOOP;

  IF v_ai_result_id IS NOT NULL THEN
    UPDATE public.dms_ai_extraction_results
    SET ai_status = 'accepted',
        review_action = 'accepted',
        reviewed_by = v_actor_id,
        reviewed_at = v_now,
        document_id = v_document_id
    WHERE id = v_ai_result_id;
  END IF;

  UPDATE public.dms_upload_sessions
  SET status = 'completed',
      intake_status = 'approved',
      review_status = 'approved',
      document_id = v_document_id,
      approve_run_id = v_approve_run_id,
      approve_status = 'completed',
      approve_error = NULL,
      approved_at = v_now,
      review_completed_at = v_now,
      reviewed_by = v_actor_id,
      completed_at = v_now,
      updated_at = v_now
  WHERE id = v_upload_session_id;

  INSERT INTO public.dms_document_events (
    document_id,
    event_type,
    description,
    performed_by,
    performed_at,
    metadata_json
  )
  VALUES
    (
      v_document_id,
      CASE WHEN v_mode = 'existing_batch_draft' THEN 'batch_draft_approved' ELSE 'document_created_from_ai_intake' END,
      CASE WHEN v_mode = 'existing_batch_draft'
        THEN 'AI batch draft approved through transactional approve flow'
        ELSE 'Document created from AI intake through transactional approve flow'
      END,
      v_actor_id,
      v_now,
      jsonb_build_object('upload_session_id', v_upload_session_id, 'ai_result_id', v_ai_result_id, 'approve_run_id', v_approve_run_id)
    ),
    (
      v_document_id,
      'approve_save_db_transaction_completed',
      'Approve & Save core DB transaction completed',
      v_actor_id,
      v_now,
      jsonb_build_object('approve_run_id', v_approve_run_id, 'file_id', v_file_id, 'version_id', v_version_id)
    ),
    (
      v_document_id,
      'file_uploaded',
      'File attached from AI intake approval',
      v_actor_id,
      v_now,
      jsonb_build_object('file_id', v_file_id, 'version_id', v_version_id, 'storage_path', p_payload->>'final_storage_path')
    );

  IF COALESCE(jsonb_array_length(COALESCE(p_payload->'metadata_values', '[]'::jsonb)), 0) > 0 THEN
    INSERT INTO public.dms_document_events (
      document_id,
      event_type,
      description,
      performed_by,
      performed_at,
      metadata_json
    )
    VALUES (
      v_document_id,
      'metadata_updated',
      'Metadata saved from AI intake approval',
      v_actor_id,
      v_now,
      jsonb_build_object('metadata_count', jsonb_array_length(COALESCE(p_payload->'metadata_values', '[]'::jsonb)))
    );
  END IF;

  UPDATE public.dms_approve_runs
  SET status = 'db_committed',
      stage = 'approve_save_db_transaction_completed',
      document_id = v_document_id,
      ai_result_id = COALESCE(v_ai_result_id, ai_result_id),
      final_storage_bucket = COALESCE(NULLIF(p_payload->>'final_storage_bucket', ''), final_storage_bucket),
      final_storage_path = COALESCE(NULLIF(p_payload->>'final_storage_path', ''), final_storage_path),
      metadata_json = COALESCE(metadata_json, '{}'::jsonb)
        || jsonb_build_object(
          'mode', v_mode,
          'file_id', v_file_id,
          'version_id', v_version_id,
          'metadata_count', jsonb_array_length(COALESCE(p_payload->'metadata_values', '[]'::jsonb)),
          'tag_count', jsonb_array_length(COALESCE(p_payload->'tag_ids', '[]'::jsonb)),
          'link_count', jsonb_array_length(COALESCE(p_payload->'links', '[]'::jsonb))
        ),
      error_code = NULL,
      error_message = NULL,
      updated_at = v_now
  WHERE id = v_approve_run_id;

  RETURN QUERY SELECT v_document_id, v_document_no, 'db_committed'::TEXT;
END;
$function$;
notify pgrst,'reload schema';
commit;
