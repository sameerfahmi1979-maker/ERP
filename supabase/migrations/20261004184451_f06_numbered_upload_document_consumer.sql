begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Upload creation only. There is no storage policy, allocator, AI intake or
-- generic workflow change. All DMS business writes retain caller RLS.
create function erp_private.upload_creation_snapshot(p_session bigint,p_type bigint,p_open boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s record; t record;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active()
  or not public.current_user_has_permission('numbering.rules.generate')
  or not erp_private.upload_session_permission(p_session,'dms.documents.upload') then
  raise exception 'Upload creation unavailable' using errcode='42501';end if;
 select id,session_code,uploaded_by,owning_company_id,owning_branch_id,temp_storage_path,
  original_filename,mime_type,file_size_bytes,sha256_hash,document_id,status,intake_status into s
  from public.dms_upload_sessions where id=p_session and deleted_at is null;
 if not found or s.owning_company_id is null or s.temp_storage_path is null then
  raise exception 'Upload source unavailable' using errcode='42501';end if;
 if p_open and (s.document_id is not null or s.status in ('completed','cancelled','expired')
  or s.intake_status in ('approved','discarded','cancelled','expired')) then
  raise exception 'Upload is already bound or closed' using errcode='PT409';end if;
 -- These are the existing effective permissions for the complete path:
 -- document UPDATE needs edit and file SELECT/RETURNING needs preview.
 if not erp_private.permission_in_scope('dms.documents.upload',s.owning_company_id,s.owning_branch_id)
  or not erp_private.permission_in_scope('dms.documents.edit',s.owning_company_id,s.owning_branch_id)
  or not erp_private.permission_in_scope('dms.documents.preview',s.owning_company_id,s.owning_branch_id)
  or not (erp_private.permission_in_scope('dms.documents.view',s.owning_company_id,s.owning_branch_id)
   or erp_private.permission_in_scope('dms.admin',s.owning_company_id,s.owning_branch_id)) then
  raise exception 'Upload destination unavailable' using errcode='42501';end if;
 select id,category_id,type_code,coalesce(default_confidentiality,'internal') as default_confidentiality,
  coalesce(requires_expiry_tracking,false) as requires_expiry_tracking into t
  from public.dms_document_types where id=p_type and is_active and deleted_at is null;
 if not found or t.category_id is null or not exists(select 1 from public.dms_document_categories
  where id=t.category_id and is_active and deleted_at is null) then
  raise exception 'Upload taxonomy unavailable' using errcode='23503';end if;
 if t.default_confidentiality not in ('internal','company','hr','finance','legal','executive') or
  (t.default_confidentiality not in ('internal','company') and not erp_private.permission_in_scope(
   'dms.documents.view.'||t.default_confidentiality,s.owning_company_id,s.owning_branch_id)) then
  raise exception 'Upload classification unavailable' using errcode='42501';end if;
 return jsonb_build_object('source',to_jsonb(s)-array['document_id','status','intake_status'],
  'type',to_jsonb(t),'storage_year',extract(year from current_timestamp)::integer);
end $$;
revoke all on function erp_private.upload_creation_snapshot(bigint,bigint,boolean) from public,anon,service_role;
grant execute on function erp_private.upload_creation_snapshot(bigint,bigint,boolean) to authenticated;
create function public.prepare_numbered_dms_upload(p_session bigint,p_type bigint)
returns jsonb language sql security invoker set search_path='' as $$
 select erp_private.upload_creation_snapshot(p_session,p_type,true);
$$;
revoke all on function public.prepare_numbered_dms_upload(bigint,bigint) from public,anon,service_role;
grant execute on function public.prepare_numbered_dms_upload(bigint,bigint) to authenticated;

create function erp_private.validate_upload_creation_request(p_request jsonb)
returns void language plpgsql immutable security invoker set search_path='' as $$
declare v record; k text; s jsonb; t jsonb; prepared jsonb; issue date; expiry date;
begin
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>65536
  or not(p_request ?& array['uploadSessionId','title','document_type_id','allowDuplicate','prepared'])
  or p_request-array['uploadSessionId','title','document_type_id','description','issue_date','expiry_date','owning_company_id','allowDuplicate','prepared']<>'{}'::jsonb then
  raise exception 'Invalid upload request' using errcode='22023';end if;
 for v in select * from jsonb_each(p_request) loop
  k:=jsonb_typeof(v.value);
  if v.key in ('uploadSessionId','document_type_id','owning_company_id') then
   if k<>'number' or v.value::text !~ '^[1-9][0-9]*$' or (v.value::text)::numeric>9007199254740991 then
    raise exception 'Invalid upload reference' using errcode='22023';end if;
  elsif v.key in ('title','description','issue_date','expiry_date') and k<>'string' then
   raise exception 'Invalid upload text' using errcode='22023';end if;
 end loop;
 if coalesce(length(btrim(p_request->>'title')),0) not between 1 and 500
  or length(p_request->>'description')>2000 or jsonb_typeof(p_request->'allowDuplicate') is distinct from 'boolean'
  or jsonb_typeof(p_request->'prepared') is distinct from 'object' then
  raise exception 'Invalid upload values' using errcode='22023';end if;
 if (nullif(p_request->>'issue_date','') is not null and p_request->>'issue_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
  or (nullif(p_request->>'expiry_date','') is not null and p_request->>'expiry_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
  raise exception 'Invalid upload dates' using errcode='22023';end if;
 issue:=nullif(p_request->>'issue_date','')::date;expiry:=nullif(p_request->>'expiry_date','')::date;
 if expiry<issue then raise exception 'Invalid upload chronology' using errcode='22023';end if;
 prepared:=p_request->'prepared';s:=prepared->'source';t:=prepared->'type';
 if not(prepared ?& array['source','type','storage_year','content_sha256'])
  or prepared-array['source','type','storage_year','content_sha256']<>'{}'::jsonb
  or jsonb_typeof(s) is distinct from 'object' or jsonb_typeof(t) is distinct from 'object'
  or jsonb_typeof(prepared->'storage_year') is distinct from 'number' or prepared->>'storage_year' !~ '^[0-9]{4}$'
  or (prepared->>'storage_year')::integer<2000
  or jsonb_typeof(prepared->'content_sha256') is distinct from 'string' or prepared->>'content_sha256' !~ '^[a-f0-9]{64}$'
  or s->'id' is distinct from p_request->'uploadSessionId' or t->'id' is distinct from p_request->'document_type_id'
  or (p_request ? 'owning_company_id' and p_request->'owning_company_id' is distinct from s->'owning_company_id') then
  raise exception 'Invalid prepared upload' using errcode='22023';end if;
 -- Exact source/type shape is checked against the current RLS-visible snapshot
 -- before the first insert; on replay the allocator binds this exact JSON.
end $$;
revoke all on function erp_private.validate_upload_creation_request(jsonb) from public,anon,service_role;
grant execute on function erp_private.validate_upload_creation_request(jsonb) to authenticated;

create function erp_private.numbered_upload_plan(p_operation uuid,p_request jsonb,p_create boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor bigint:=public.current_user_profile_id(); session_id bigint; s record; d record; prepared jsonb;
 current_snapshot jsonb; allocation jsonb; reference text; target bigint; path text; ext text; completed boolean:=false; affected integer;
begin
 if auth.uid() is null or actor is null or not erp_private.business_principal_is_active()
  or not public.current_user_has_permission('numbering.rules.generate') then
  raise exception 'Upload creation denied' using errcode='42501';end if;
 if p_operation is null then raise exception 'Creation identity required' using errcode='22023';end if;
 perform erp_private.validate_upload_creation_request(p_request);
 session_id:=(p_request->>'uploadSessionId')::bigint;prepared:=p_request->'prepared';
 if not erp_private.upload_session_permission(session_id,'dms.documents.upload') then
  raise exception 'Upload source denied' using errcode='42501';end if;
 -- Same source-first order as approved batch/intake consumers. No database
 -- lock is held during a Storage HTTP call.
 -- Wait using caller RLS, then use a fresh command snapshot. F03's STABLE
 -- policy helpers must see a winner's newly bound document after this wait.
 perform id from public.dms_upload_sessions where id=session_id and deleted_at is null for update;
 select id,document_id,status,intake_status,owning_company_id,owning_branch_id,session_code,uploaded_by,temp_storage_path,
  original_filename,mime_type,file_size_bytes,sha256_hash into s from public.dms_upload_sessions
  where id=session_id and deleted_at is null for update;
 if not found or not erp_private.business_principal_is_active()
  or not erp_private.upload_session_permission(session_id,'dms.documents.upload') then
  raise exception 'Upload source denied' using errcode='42501';end if;
 if not p_create and s.document_id is null then raise exception 'No retained creation exists' using errcode='PT409';end if;
 if (to_jsonb(s)-array['document_id','status','intake_status']) is distinct from prepared->'source' then
  raise exception 'Upload source changed' using errcode='PT409';end if;
 if s.sha256_hash is not null and lower(s.sha256_hash) is distinct from prepared->>'content_sha256' then
  raise exception 'Upload byte identity mismatch' using errcode='PT409';end if;
 allocation:=public.allocate_numbering_reference(p_operation,null,'MASTER_DMS_DOCUMENT',null,'reserved','dms_documents',null,
  'F06 upload creation '||encode(sha256(convert_to(p_request::text,'UTF8')),'hex'));
 reference:=allocation->>'generated_reference_number';
 if allocation->>'generation_status'='consumed' then
  select id,owning_company_id,owning_branch_id,current_version_id into d from public.dms_documents
   where document_no=reference and created_by=actor and deleted_at is null;
  if not found or s.document_id is distinct from d.id then raise exception 'Retained upload unavailable' using errcode='42501';end if;
  target:=d.id;
 else
  if not p_create or allocation->>'generation_status'<>'reserved' or s.document_id is not null then
   raise exception 'Upload has another creation request' using errcode='PT409';end if;
  current_snapshot:=erp_private.upload_creation_snapshot(session_id,(p_request->>'document_type_id')::bigint,true);
  if (prepared-array['content_sha256','storage_year']) is distinct from current_snapshot-'storage_year' then
   raise exception 'Prepared upload context changed' using errcode='PT409';end if;
  perform erp_private.lock_dms_creation_taxonomy((prepared#>>'{type,id}')::bigint,(prepared#>>'{type,category_id}')::bigint,
   s.owning_company_id,s.owning_branch_id,prepared#>>'{type,default_confidentiality}');
  if (prepared-array['content_sha256','storage_year']) is distinct from
   erp_private.upload_creation_snapshot(session_id,(p_request->>'document_type_id')::bigint,true)-'storage_year' then
   raise exception 'Prepared upload context changed' using errcode='PT409';end if;
  insert into public.dms_documents(document_no,title,description,document_type_id,category_id,status,confidentiality_level,
   owner_user_id,owning_company_id,owning_branch_id,issue_date,expiry_date,created_by,updated_by)
  values(reference,btrim(p_request->>'title'),p_request->>'description',(prepared#>>'{type,id}')::bigint,
   (prepared#>>'{type,category_id}')::bigint,'active',prepared#>>'{type,default_confidentiality}',actor,
   s.owning_company_id,s.owning_branch_id,nullif(p_request->>'issue_date','')::date,nullif(p_request->>'expiry_date','')::date,actor,actor);
  -- F03 stable reread sees our insert in this separate statement, not RETURNING.
  select id,owning_company_id,owning_branch_id,current_version_id into d from public.dms_documents
   where document_no=reference and created_by=actor and deleted_at is null;
  if not found then raise exception 'Created document unavailable' using errcode='42501';end if;
  target:=d.id;
  update public.dms_upload_sessions set document_id=target,updated_at=clock_timestamp() where id=session_id and document_id is null;
  get diagnostics affected=row_count;if affected<>1 then raise exception 'Source binding denied' using errcode='42501';end if;
  insert into public.dms_document_events(document_id,event_type,performed_by,description,metadata_json)
  values(target,'document_created',actor,'Document retained from upload',jsonb_build_object('operation_id',p_operation,'upload_session_id',session_id,'attachment_complete',false));
  perform public.finish_numbering_reservation(p_operation,'consumed','dms_documents',target,null);
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
  values(actor,'DMS','dms_documents',target,reference,'create',jsonb_build_object('event','document_retained_from_upload',
   'operation_id',p_operation,'upload_session_id',session_id,'attachment_complete',false));
 end if;
 if d.owning_company_id is distinct from s.owning_company_id or d.owning_branch_id is distinct from s.owning_branch_id
  or not public.f03_has_document_permission(target,'dms.documents.upload')
  or not public.f03_has_document_permission(target,'dms.documents.edit')
  or not public.f03_has_document_permission(target,'dms.documents.preview') then
  raise exception 'Retained destination unavailable' using errcode='42501';end if;
 ext:=lower(substring(s.original_filename from '\.([A-Za-z0-9]{1,16})$'));
 if ext is null then ext:=case lower(btrim(split_part(s.mime_type,';',1))) when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/jpg' then 'jpg'
  when 'image/png' then 'png' when 'image/gif' then 'gif' when 'image/webp' then 'webp' when 'image/tiff' then 'tiff'
  when 'image/heic' then 'heic' when 'application/msword' then 'doc'
  when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx'
  when 'application/vnd.ms-excel' then 'xls' when 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' then 'xlsx'
  when 'text/plain' then 'txt' when 'text/csv' then 'csv' when 'application/zip' then 'zip' else 'pdf' end;end if;
 if prepared#>>'{type,type_code}' is null or prepared#>>'{type,type_code}' in ('.','..')
  or strpos(prepared#>>'{type,type_code}','/')>0 then raise exception 'Invalid storage type' using errcode='22023';end if;
 path:=s.owning_company_id||'/'||(prepared->>'storage_year')||'/'||(prepared#>>'{type,type_code}')||'/'||target||'/v1/original.'||ext;
 completed:=erp_private.upload_completion_receipt(p_operation,p_request,target,false) is not null;
 if s.status='completed' and not completed then
  raise exception 'Completed upload history has no retained receipt' using errcode='PT409';
 elsif s.status in ('cancelled','expired') or s.intake_status in ('discarded','cancelled','expired') then
  raise exception 'Retained upload closed' using errcode='PT409';
 end if;
 -- Recheck after allocator, taxonomy, FK, source, event and audit waits.
 if public.current_user_profile_id() is distinct from actor or not erp_private.business_principal_is_active()
  or not public.current_user_has_permission('numbering.rules.generate')
  or not erp_private.upload_session_permission(session_id,'dms.documents.upload')
  or not public.f03_has_document_permission(target,'dms.documents.upload')
  or not public.f03_has_document_permission(target,'dms.documents.edit')
  or not public.f03_has_document_permission(target,'dms.documents.preview') then
  raise exception 'Upload creation denied' using errcode='42501';end if;
 return jsonb_build_object('documentId',target,'documentNo',reference,'upload_session_id',session_id,'operation_id',p_operation,
  'reference_id',(allocation->>'id')::bigint,'replayed',allocation->>'generation_status'='consumed','completed',completed,'storage_path',path,
  'actor_id',actor,'auth_session_id',auth.jwt()->>'session_id');
end $$;
revoke all on function erp_private.numbered_upload_plan(uuid,jsonb,boolean) from public,anon,service_role;
grant execute on function erp_private.numbered_upload_plan(uuid,jsonb,boolean) to authenticated;
create function public.create_numbered_dms_upload(p_operation uuid,p_request jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select erp_private.numbered_upload_plan(p_operation,p_request,true);
$$;
revoke all on function public.create_numbered_dms_upload(uuid,jsonb) from public,anon,service_role;
grant execute on function public.create_numbered_dms_upload(uuid,jsonb) to authenticated;

-- Trusted server provenance only. User-supplied Storage metadata is never a
-- byte-verification attestation, including through signed upload URLs.
create table erp_private.upload_verified_copies(
 actor_id bigint not null,operation_id uuid not null,verified_session_id uuid not null,
 request_hash text not null,upload_session_id bigint not null,document_id bigint not null,
 storage_path text not null,object_id uuid not null,object_version text not null,object_updated_at timestamptz not null,
 content_sha256 text not null,file_size_bytes bigint not null,mime_type text not null,file_name text not null,
 verified_at timestamptz not null default clock_timestamp(),primary key(actor_id,operation_id)
);
alter table erp_private.upload_verified_copies enable row level security;
alter table erp_private.upload_verified_copies owner to postgres;
revoke all on erp_private.upload_verified_copies from public,anon,authenticated,service_role;
create table erp_private.upload_creation_completions(
 actor_id bigint not null,operation_id uuid not null,request_hash text not null,document_id bigint not null,
 result jsonb not null,completed_at timestamptz not null default clock_timestamp(),primary key(actor_id,operation_id)
);
alter table erp_private.upload_creation_completions enable row level security;
alter table erp_private.upload_creation_completions owner to postgres;
revoke all on erp_private.upload_creation_completions from public,anon,authenticated,service_role;

create function public.attest_numbered_dms_upload(p_actor bigint,p_session uuid,p_operation uuid,p_request jsonb,
 p_document bigint,p_path text,p_object uuid,p_version text,p_updated_at timestamptz,p_sha256 text,p_size bigint,p_file_name text)
returns void language plpgsql security definer set search_path='' as $$
declare g record; s record; d record; o record; previous erp_private.upload_verified_copies; h text;
begin
 if auth.role() is distinct from 'service_role' or not erp_private.provider_actor_session_valid(p_actor,p_session) then
  raise exception 'Verification principal unavailable' using errcode='42501';end if;
 if p_operation is null or p_object is null or nullif(p_version,'') is null or p_updated_at is null
  or p_sha256 !~ '^[a-f0-9]{64}$' or p_size<0 or coalesce(length(p_file_name),0) not between 1 and 255 then
  raise exception 'Invalid verified copy' using errcode='22023';end if;
 h:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
 select r.target_table_name,r.target_record_id,r.generation_status,r.generation_reason,r.generated_by into g
  from erp_private.numbering_requests n join public.global_numbering_generated_references r on r.id=n.reference_id
  where n.actor_id=p_actor and n.operation_id=p_operation;
 if not found or g.generated_by is distinct from p_actor or g.target_table_name is distinct from 'dms_documents'
  or g.target_record_id is distinct from p_document or g.generation_status is distinct from 'consumed'
  or g.generation_reason is distinct from 'F06 upload creation '||h then
  raise exception 'Verified copy has no matching allocation' using errcode='42501';end if;
 select id,document_id,owning_company_id,owning_branch_id,session_code,uploaded_by,temp_storage_path,
  original_filename,mime_type,file_size_bytes,sha256_hash into s from public.dms_upload_sessions
  where id=(p_request->>'uploadSessionId')::bigint and deleted_at is null;
 select id,owning_company_id,owning_branch_id,created_by into d from public.dms_documents where id=p_document and deleted_at is null;
 if s.id is null or d.id is null or s.document_id is distinct from p_document or d.created_by is distinct from p_actor
  or d.owning_company_id is distinct from s.owning_company_id or d.owning_branch_id is distinct from s.owning_branch_id
  or to_jsonb(s)-'document_id' is distinct from p_request#>'{prepared,source}'
  or p_sha256 is distinct from p_request#>>'{prepared,content_sha256}' or p_size is distinct from s.file_size_bytes
  or p_path !~ '^[0-9]+/[0-9]{4}/[^/]+/[0-9]+/v1/original\.[A-Za-z0-9]+$'
  or split_part(p_path,'/',1) is distinct from s.owning_company_id::text
  or split_part(p_path,'/',2) is distinct from p_request#>>'{prepared,storage_year}'
  or split_part(p_path,'/',3) is distinct from p_request#>>'{prepared,type,type_code}'
  or split_part(p_path,'/',4) is distinct from p_document::text then
  raise exception 'Verified source or destination mismatch' using errcode='PT409';end if;
 perform pg_advisory_xact_lock(hashtextextended('f06-upload-copy:'||p_actor||':'||p_operation,0));
 select id,version,updated_at,metadata into o from storage.objects
  where bucket_id='dms-documents' and name=p_path for share;
 -- Storage's Info API serializes JavaScript dates to milliseconds. Compare
 -- its reported precision, but keep the locked database's full timestamp in
 -- the immutable proof. UUID/version and verified bytes remain mandatory.
 if not found or o.id is distinct from p_object or o.version is distinct from p_version or date_trunc('milliseconds',o.updated_at) is distinct from p_updated_at
  or (o.metadata->>'size')::bigint is distinct from p_size or o.metadata->>'mimetype' is distinct from s.mime_type then
  raise exception 'Verified storage object changed' using errcode='PT409';end if;
 select * into previous from erp_private.upload_verified_copies where actor_id=p_actor and operation_id=p_operation;
 if found then
  if row(previous.request_hash,previous.upload_session_id,previous.document_id,previous.storage_path,previous.object_id,
    previous.object_version,previous.object_updated_at,previous.content_sha256,previous.file_size_bytes,previous.mime_type,previous.file_name)
   is distinct from row(h,s.id,p_document,p_path,p_object,p_version,o.updated_at,p_sha256,p_size,s.mime_type,p_file_name) then
   raise exception 'Verified copy cannot be rewritten' using errcode='PT409';end if;
 else
  insert into erp_private.upload_verified_copies(actor_id,operation_id,verified_session_id,request_hash,upload_session_id,document_id,
   storage_path,object_id,object_version,object_updated_at,content_sha256,file_size_bytes,mime_type,file_name)
  values(p_actor,p_operation,p_session,h,s.id,p_document,p_path,p_object,p_version,o.updated_at,p_sha256,p_size,s.mime_type,p_file_name);
 end if;
 if not erp_private.provider_actor_session_valid(p_actor,p_session) then raise exception 'Verification session ended' using errcode='42501';end if;
end $$;
alter function public.attest_numbered_dms_upload(bigint,uuid,uuid,jsonb,bigint,text,uuid,text,timestamptz,text,bigint,text) owner to postgres;
revoke all on function public.attest_numbered_dms_upload(bigint,uuid,uuid,jsonb,bigint,text,uuid,text,timestamptz,text,bigint,text) from public,anon,authenticated;
grant execute on function public.attest_numbered_dms_upload(bigint,uuid,uuid,jsonb,bigint,text,uuid,text,timestamptz,text,bigint,text) to service_role;

create function erp_private.assert_verified_upload_copy(p_operation uuid,p_request jsonb,p_document bigint,p_path text,p_file_name text)
returns void language plpgsql security definer set search_path='' as $$
declare proof erp_private.upload_verified_copies; o record;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active() or not public.current_user_has_permission('numbering.rules.generate')
  or not erp_private.upload_session_permission((p_request->>'uploadSessionId')::bigint,'dms.documents.upload')
  or not public.f03_has_document_permission(p_document,'dms.documents.upload')
  or not public.f03_has_document_permission(p_document,'dms.documents.edit')
  or not public.f03_has_document_permission(p_document,'dms.documents.preview') then
  raise exception 'Copy verification denied' using errcode='42501';end if;
 select * into proof from erp_private.upload_verified_copies where actor_id=public.current_user_profile_id() and operation_id=p_operation;
 if not found or proof.request_hash is distinct from encode(sha256(convert_to(p_request::text,'UTF8')),'hex')
  or proof.document_id is distinct from p_document or proof.upload_session_id is distinct from (p_request->>'uploadSessionId')::bigint
  or proof.storage_path is distinct from p_path or proof.file_name is distinct from p_file_name then
  raise exception 'No trusted copy attestation' using errcode='42501';end if;
 select id,version,updated_at,metadata into o from storage.objects where bucket_id='dms-documents' and name=p_path for share;
 if not found or row(o.id,o.version,o.updated_at) is distinct from row(proof.object_id,proof.object_version,proof.object_updated_at)
  or (o.metadata->>'size')::bigint is distinct from proof.file_size_bytes or o.metadata->>'mimetype' is distinct from proof.mime_type then
  raise exception 'Attested storage object changed' using errcode='PT409';end if;
 if not erp_private.business_principal_is_active() or not public.current_user_has_permission('numbering.rules.generate')
  or not erp_private.upload_session_permission(proof.upload_session_id,'dms.documents.upload')
  or not public.f03_has_document_permission(p_document,'dms.documents.upload')
  or not public.f03_has_document_permission(p_document,'dms.documents.edit')
  or not public.f03_has_document_permission(p_document,'dms.documents.preview') then
  raise exception 'Copy verification denied' using errcode='42501';end if;
end $$;
alter function erp_private.assert_verified_upload_copy(uuid,jsonb,bigint,text,text) owner to postgres;
revoke all on function erp_private.assert_verified_upload_copy(uuid,jsonb,bigint,text,text) from public,anon,service_role;
grant execute on function erp_private.assert_verified_upload_copy(uuid,jsonb,bigint,text,text) to authenticated;

-- Only receipt bookkeeping is elevated; every business row is written by the
-- invoker. The private copy attestation itself is never mutated. A completion
-- receipt is stored once only after exact source, file, version, event and audit
-- facts exist. Merely setting session.status='completed' cannot fabricate it.
create function erp_private.upload_completion_receipt(p_operation uuid,p_request jsonb,p_document bigint,p_store boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor bigint:=public.current_user_profile_id(); prior erp_private.upload_creation_completions;
 proof erp_private.upload_verified_copies; d record; f record; result jsonb; h text;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active() or not public.current_user_has_permission('numbering.rules.generate')
  or not erp_private.upload_session_permission((p_request->>'uploadSessionId')::bigint,'dms.documents.upload')
  or not public.f03_has_document_permission(p_document,'dms.documents.upload')
  or not public.f03_has_document_permission(p_document,'dms.documents.edit')
  or not public.f03_has_document_permission(p_document,'dms.documents.preview') then
  raise exception 'Completion receipt denied' using errcode='42501';end if;
 h:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
 select * into prior from erp_private.upload_creation_completions where actor_id=actor and operation_id=p_operation;
 if found then
  if prior.request_hash is distinct from h or prior.document_id is distinct from p_document then
   raise exception 'Completion request conflict' using errcode='PT409';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 if not p_store then return null;end if;
 select * into proof from erp_private.upload_verified_copies where actor_id=actor and operation_id=p_operation;
 if not found or proof.request_hash is distinct from h or proof.document_id is distinct from p_document then
  raise exception 'Verified creation unavailable' using errcode='42501';end if;
 perform erp_private.assert_verified_upload_copy(p_operation,p_request,p_document,proof.storage_path,proof.file_name);
 select id,document_no,current_version_id into d from public.dms_documents where id=p_document and created_by=actor and deleted_at is null;
 select file.id,file.version_id into f from public.dms_document_files file join public.dms_document_versions version on version.id=file.version_id
  where file.document_id=p_document and version.document_id=p_document and version.version_number=1 and version.id=d.current_version_id
   and file.file_role='original' and file.storage_bucket='dms-documents' and file.storage_path=proof.storage_path
   and file.file_name=proof.file_name and file.sha256_hash=proof.content_sha256 and file.file_size_bytes=proof.file_size_bytes
   and file.mime_type=proof.mime_type and file.created_by=actor and version.created_by=actor and file.deleted_at is null;
 if d.id is null or f.id is null or not exists(select 1 from public.dms_upload_sessions
  where id=proof.upload_session_id and document_id=p_document and status='completed' and deleted_at is null)
  or not exists(select 1 from public.dms_document_events where document_id=p_document and event_type='file_uploaded'
   and performed_by=actor and metadata_json->>'operation_id'=p_operation::text and (metadata_json->>'file_id')::bigint=f.id)
  or not exists(select 1 from public.dms_document_events where document_id=p_document and event_type='version_uploaded'
   and performed_by=actor and metadata_json->>'operation_id'=p_operation::text and (metadata_json->>'version_id')::bigint=f.version_id)
  or not exists(select 1 from public.audit_logs where actor_user_profile_id=actor and entity_name='dms_documents' and entity_id=p_document
   and new_values->>'event'='document_upload_completed' and new_values->>'operation_id'=p_operation::text) then
  raise exception 'Completion facts unavailable' using errcode='PT409';end if;
 result:=jsonb_build_object('documentId',p_document,'documentNo',d.document_no,'upload_session_id',proof.upload_session_id,
  'operation_id',p_operation,'completed',true,'replayed',false);
 insert into erp_private.upload_creation_completions(actor_id,operation_id,request_hash,document_id,result) values(actor,p_operation,h,p_document,result);
 -- Receipt insert may itself wait: final current authorization is still required.
 if not erp_private.business_principal_is_active() or not public.current_user_has_permission('numbering.rules.generate')
  or not erp_private.upload_session_permission(proof.upload_session_id,'dms.documents.upload')
  or not public.f03_has_document_permission(p_document,'dms.documents.upload')
  or not public.f03_has_document_permission(p_document,'dms.documents.edit')
  or not public.f03_has_document_permission(p_document,'dms.documents.preview') then
  raise exception 'Completion receipt denied' using errcode='42501';end if;
 return result;
end $$;
alter function erp_private.upload_completion_receipt(uuid,jsonb,bigint,boolean) owner to postgres;
revoke all on function erp_private.upload_completion_receipt(uuid,jsonb,bigint,boolean) from public,anon,service_role;
grant execute on function erp_private.upload_completion_receipt(uuid,jsonb,bigint,boolean) to authenticated;

create function public.finish_numbered_dms_upload(p_operation uuid,p_request jsonb,p_file_name text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare plan jsonb; actor bigint:=public.current_user_profile_id(); target bigint; session_id bigint; version_id bigint; file_id bigint;
 affected integer; source jsonb; parent record;
begin
 plan:=erp_private.numbered_upload_plan(p_operation,p_request,false);
 target:=(plan->>'documentId')::bigint;session_id:=(plan->>'upload_session_id')::bigint;source:=p_request#>'{prepared,source}';
 if not (plan->>'completed')::boolean then
  select id,current_version_id into parent from public.dms_documents where id=target and deleted_at is null for update;
  if not found then raise exception 'Retained document unavailable' using errcode='42501';end if;
  if parent.current_version_id is not null or exists(select 1 from public.dms_document_versions where document_id=target)
   or exists(select 1 from public.dms_document_files where document_id=target) then
   raise exception 'Retained document already has different attachment work' using errcode='PT409';end if;
  perform erp_private.assert_verified_upload_copy(p_operation,p_request,target,plan->>'storage_path',p_file_name);
  insert into public.dms_document_versions(document_id,version_number,version_label,change_notes,is_current,created_by)
   values(target,1,'v1','Initial upload',true,actor) returning id into version_id;
  insert into public.dms_document_files(document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,created_by)
   values(target,version_id,'original','dms-documents',plan->>'storage_path',p_file_name,source->>'mime_type',
    (source->>'file_size_bytes')::bigint,p_request#>>'{prepared,content_sha256}',actor) returning id into file_id;
  update public.dms_documents set current_version_id=version_id,updated_by=actor,updated_at=clock_timestamp() where id=target and current_version_id is null;
  get diagnostics affected=row_count;if affected<>1 then raise exception 'Document completion denied' using errcode='42501';end if;
  update public.dms_upload_sessions set status='completed',completed_at=clock_timestamp(),updated_at=clock_timestamp()
   where id=session_id and document_id=target and status not in ('completed','cancelled','expired');
  get diagnostics affected=row_count;if affected<>1 then raise exception 'Upload completion denied' using errcode='42501';end if;
  insert into public.dms_document_events(document_id,event_type,performed_by,description,metadata_json) values
   (target,'file_uploaded',actor,'File attached from retained upload',jsonb_build_object('operation_id',p_operation,'file_id',file_id,'version_id',version_id,'version_number',1)),
   (target,'version_uploaded',actor,'First version created: v1',jsonb_build_object('operation_id',p_operation,'version_id',version_id,'version_number',1,'is_current',true));
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
   values(actor,'DMS','dms_documents',target,plan->>'documentNo','update',jsonb_build_object('event','document_upload_completed',
    'operation_id',p_operation,'upload_session_id',session_id,'version_id',version_id,'file_id',file_id));
 end if;
 if public.current_user_profile_id() is distinct from actor or not erp_private.business_principal_is_active()
  or not public.current_user_has_permission('numbering.rules.generate')
  or not erp_private.upload_session_permission(session_id,'dms.documents.upload')
  or not public.f03_has_document_permission(target,'dms.documents.upload')
  or not public.f03_has_document_permission(target,'dms.documents.edit')
  or not public.f03_has_document_permission(target,'dms.documents.preview') then
  raise exception 'Upload completion denied' using errcode='42501';end if;
 return erp_private.upload_completion_receipt(p_operation,p_request,target,true);
end $$;
revoke all on function public.finish_numbered_dms_upload(uuid,jsonb,text) from public,anon,service_role;
grant execute on function public.finish_numbered_dms_upload(uuid,jsonb,text) to authenticated;
notify pgrst,'reload schema';
commit;
