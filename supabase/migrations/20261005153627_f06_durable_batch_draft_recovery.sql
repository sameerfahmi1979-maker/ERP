begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- No DEFAULT or backfill: pre-extension NULL identities stay historical.
alter table public.dms_upload_sessions add column batch_draft_operation_id uuid;
create unique index f06_batch_draft_operation_unique on public.dms_upload_sessions(batch_draft_operation_id)
 where batch_draft_operation_id is not null;

create or replace function erp_private.batch_identity_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
declare a record; b record; f jsonb;
begin
 if tg_table_name='dms_upload_batches' then
  if tg_op='DELETE' then
   if old.admission_version is not null then raise exception 'Admission history is immutable' using errcode='23514';end if;return old;
  end if;
  if tg_op='UPDATE' then
   if (old.admission_version is not null or new.admission_version is not null) and
    row(new.id,new.admission_version,new.admission_auth_user_id,new.admission_operation_id,new.admission_manifest,new.admission_fingerprint,new.owning_company_id,new.owning_branch_id,new.created_by,new.batch_code,new.created_at,new.total_files,new.entity_type,new.entity_id)
    is distinct from row(old.id,old.admission_version,old.admission_auth_user_id,old.admission_operation_id,old.admission_manifest,old.admission_fingerprint,old.owning_company_id,old.owning_branch_id,old.created_by,old.batch_code,old.created_at,old.total_files,old.entity_type,old.entity_id)
    then raise exception 'Admission identity is immutable' using errcode='23514';end if;return new;
  end if;
  if new.admission_version is null and auth.uid() is null then
   -- The validated CHECK also requires every new admission column to be NULL.
   return new;
  end if;
  if new.admission_version is distinct from 1 or new.admission_operation_id is null or new.admission_manifest is null then raise exception 'Admission identity required' using errcode='23514';end if;
  if new.batch_code is not null or new.status is distinct from 'processing' or new.processed_files<>0
   or new.approved_files<>0 or new.failed_files<>0 or new.deleted_at is not null
   or new.created_at is distinct from transaction_timestamp() or new.updated_at is distinct from transaction_timestamp() then
   raise exception 'Invalid initial admission state' using errcode='23514';end if;
  select * into a from erp_private.lock_batch_admission_authority(new.admission_manifest->'context' is distinct from 'null'::jsonb);
  if new.created_by is distinct from a.actor or new.admission_auth_user_id is distinct from auth.uid()
   or new.owning_company_id is distinct from a.company or new.owning_branch_id is distinct from a.branch then raise exception 'Admission origin mismatch' using errcode='42501';end if;
  if new.admission_manifest->'context' is distinct from 'null'::jsonb and not exists
   (select 1 from public.parties where id=(new.admission_manifest#>>'{context,id}')::numeric::bigint and is_active and not is_locked) then
   raise exception 'Batch context unavailable' using errcode='42501';end if;
  if new.admission_fingerprint is distinct from encode(sha256(convert_to(erp_private.batch_manifest_bytes(new.admission_manifest),'UTF8')),'hex')
   or new.total_files is distinct from jsonb_array_length(new.admission_manifest->'files')
   or new.entity_type is distinct from new.admission_manifest->'context'->>'type'
   or new.entity_id is distinct from (new.admission_manifest->'context'->>'id')::numeric::bigint
   or not erp_private.batch_fresh_context(a.company,a.branch,new.admission_manifest->'context',true) then raise exception 'Invalid admission graph' using errcode='23514';end if;
  if new.admission_manifest->'context' is distinct from 'null'::jsonb and not exists
   (select 1 from public.parties where id=(new.admission_manifest#>>'{context,id}')::numeric::bigint and is_active and not is_locked) then
   raise exception 'Batch context unavailable' using errcode='42501';end if;
  new.batch_code:='B'||upper(replace(gen_random_uuid()::text,'-',''));
  return new;
 end if;
 if tg_op='DELETE' then
  if old.admission_position is not null then raise exception 'Admission history is immutable' using errcode='23514';end if;return old;
 end if;
 -- Marker invariance applies to legacy rows and privileged callers as well.
 if tg_op='UPDATE' and new.batch_draft_operation_id is distinct from old.batch_draft_operation_id then
  raise exception 'Draft operation is immutable' using errcode='23514';end if;
 if tg_op='INSERT' and new.batch_draft_operation_id is not null then
  raise exception 'Draft operation is database-issued' using errcode='23514';end if;
 if tg_op='UPDATE' and old.admission_position is not null then
  if row(new.id,new.batch_id,new.admission_position,new.uploaded_by,new.owning_company_id,new.owning_branch_id,new.session_code,new.temp_storage_path,new.original_filename,new.mime_type,new.file_size_bytes,new.sha256_hash,new.created_at,new.uploaded_at)
   is distinct from row(old.id,old.batch_id,old.admission_position,old.uploaded_by,old.owning_company_id,old.owning_branch_id,old.session_code,old.temp_storage_path,old.original_filename,old.mime_type,old.file_size_bytes,old.sha256_hash,old.created_at,old.uploaded_at)
   or new.expires_at is null or new.expires_at>old.expires_at
   or (old.document_id is not null and new.document_id is distinct from old.document_id) then raise exception 'Admission membership is immutable' using errcode='23514';end if;
  return new;
 end if;
 select * into b from public.dms_upload_batches where id=new.batch_id;
 if new.batch_id is not null and not found then raise exception 'Batch unavailable' using errcode='42501';end if;
 if b.admission_version is null then
  if new.admission_position is not null then raise exception 'Unexpected admission position' using errcode='23514';end if;return new;
 end if;
 if tg_op<>'INSERT' or new.admission_position is null or new.admission_position<0 or new.admission_position>=b.total_files
  or b.created_by is distinct from public.current_user_profile_id() or b.admission_auth_user_id is distinct from auth.uid() then raise exception 'Invalid admission member' using errcode='23514';end if;
 f:=b.admission_manifest->'files'->new.admission_position;
 if new.session_code is not null or new.temp_storage_path is not null or new.status is distinct from 'uploaded'
  or new.intake_status is distinct from 'uploaded' or new.review_status is distinct from 'not_started'
  or new.is_duplicate or new.duplicate_document_id is not null or new.ai_job_id is not null or new.ai_result_id is not null
  or new.completed_at is not null or new.deleted_at is not null or new.temp_cleaned_at is not null
  or new.error_message is not null or new.cleanup_error_message is not null
  or new.review_started_at is not null or new.review_completed_at is not null or new.reviewed_by is not null
  or new.discarded_at is not null or new.discard_reason is not null or new.approve_run_id is not null
  or new.approve_status is not null or new.approve_error is not null or new.approved_at is not null
  or new.created_at is distinct from transaction_timestamp() or new.updated_at is distinct from transaction_timestamp()
  or new.uploaded_at is distinct from transaction_timestamp() or new.expires_at is not null then
  raise exception 'Invalid initial member state' using errcode='23514';end if;
 if new.uploaded_by is distinct from b.created_by or new.owning_company_id is distinct from b.owning_company_id or new.owning_branch_id is distinct from b.owning_branch_id
  or new.original_filename is distinct from f->>'original_filename' or new.mime_type is distinct from f->>'mime_type'
  or new.file_size_bytes is distinct from (f->>'file_size_bytes')::numeric::bigint or new.sha256_hash is distinct from f->>'sha256_hash'
  or new.document_id is not null then raise exception 'Invalid admission member' using errcode='23514';end if;
 if not erp_private.business_principal_is_active()
  or not erp_private.batch_scope_allowed(b.created_by,b.owning_company_id,b.owning_branch_id) then
  raise exception 'Batch permission denied' using errcode='42501';end if;
 new.batch_draft_operation_id:=gen_random_uuid();
 new.session_code:=upper(replace(gen_random_uuid()::text,'-',''));
 new.temp_storage_path:='sessions/'||new.session_code||'/'||coalesce(nullif(left(regexp_replace(regexp_replace(new.original_filename,'[^a-zA-Z0-9._-]','_','g'),'_{2,}','_','g'),200),''),'file');
 new.expires_at:=transaction_timestamp()+interval '14 days';
 return new;
end $$;
revoke all on function erp_private.batch_identity_guard() from public,anon,authenticated,service_role;
-- Existing f03_upload_intake_scope then f06_batch_member_identity ordering stays.

create or replace function erp_private.batch_graph_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare bid bigint; b public.dms_upload_batches%rowtype; s record; expected jsonb;
begin
 bid:=case when tg_table_name='dms_upload_batches' then new.id else new.batch_id end;
 select * into b from public.dms_upload_batches where id=bid;
 if b.admission_version is distinct from 1 then return null;end if;
 if (select count(*) from public.dms_upload_sessions where batch_id=bid)<>b.total_files then raise exception 'Incomplete admission graph' using errcode='23514';end if;
 if not exists(select 1 from public.audit_logs where entity_name='dms_upload_batches' and entity_id=bid and
  actor_user_profile_id=b.created_by and owner_company_id is not distinct from b.owning_company_id
  and branch_id is not distinct from b.owning_branch_id and module_code='DMS' and action='create'
  and entity_reference=b.batch_code and old_values is null and created_at=b.created_at
  and new_values=jsonb_build_object('event','dms_batch_admitted_v1','batch_id',bid,'operation_id',b.admission_operation_id,'fingerprint',b.admission_fingerprint)) then raise exception 'Missing admission audit' using errcode='23514';end if;
 for s in select * from public.dms_upload_sessions where batch_id=bid loop
  expected:=b.admission_manifest->'files'->s.admission_position;
  if (tg_op='INSERT' and s.batch_draft_operation_id is null) or expected is null or s.admission_position is null or s.uploaded_by is distinct from b.created_by
   or s.owning_company_id is distinct from b.owning_company_id or s.owning_branch_id is distinct from b.owning_branch_id
   or s.original_filename is distinct from expected->>'original_filename' or s.mime_type is distinct from expected->>'mime_type'
   or s.file_size_bytes is distinct from (expected->>'file_size_bytes')::numeric::bigint or s.sha256_hash is distinct from expected->>'sha256_hash'
   or s.session_code !~ '^[0-9A-F]{32}$' or s.created_at is distinct from b.created_at or s.uploaded_at is distinct from b.created_at
   or s.temp_storage_path is distinct from 'sessions/'||s.session_code||'/'||coalesce(nullif(left(regexp_replace(regexp_replace(s.original_filename,'[^a-zA-Z0-9._-]','_','g'),'_{2,}','_','g'),200),''),'file')
   or not exists(select 1 from public.audit_logs where entity_name='dms_upload_sessions' and entity_id=s.id and actor_user_profile_id=b.created_by
    and owner_company_id is not distinct from b.owning_company_id and branch_id is not distinct from b.owning_branch_id
    and module_code='DMS' and action='create' and entity_reference=s.session_code and old_values is null and created_at=b.created_at
    and new_values=jsonb_build_object('event','dms_batch_session_admitted_v1','batch_id',bid,'operation_id',b.admission_operation_id,'fingerprint',b.admission_fingerprint))
   then raise exception 'Invalid admission graph' using errcode='23514';end if;
 end loop;
 return null;
end $$;
alter function erp_private.batch_graph_guard() owner to postgres;
revoke all on function erp_private.batch_graph_guard() from public,anon,authenticated,service_role;

create table erp_private.dms_batch_draft_preparations (
 upload_session_id bigint primary key references public.dms_upload_sessions(id) on update restrict on delete restrict not deferrable,
 draft_operation_id uuid not null unique,
 auth_user_id uuid not null references auth.users(id) on update restrict on delete restrict not deferrable,
 profile_id bigint not null references public.user_profiles(id) on update restrict on delete restrict not deferrable,
 batch_id bigint not null references public.dms_upload_batches(id) on update restrict on delete restrict not deferrable,
 admission_operation_id uuid not null,
 admission_fingerprint text not null,
 admission_position integer not null,
 request_json jsonb not null,
 created_at timestamptz not null,
 constraint f06_batch_preparation_shape check ((
  upload_session_id between 1 and 9007199254740991
  and profile_id between 1 and 9007199254740991 and batch_id between 1 and 9007199254740991
  and admission_position between 0 and 9 and admission_fingerprint ~ '^[0-9a-f]{64}$'
  and jsonb_typeof(request_json)='object' and octet_length(request_json::text)<=262144
  and request_json ?& array['uploadSessionId','allowDuplicate','prepared']
  and request_json-array['uploadSessionId','allowDuplicate','prepared']='{}'::jsonb
  and request_json->'uploadSessionId'=to_jsonb(upload_session_id)
  and request_json->'allowDuplicate'='false'::jsonb and jsonb_typeof(request_json->'prepared')='object'
  and request_json#>'{prepared,upload_session_id}'=to_jsonb(upload_session_id)
  and request_json#>'{prepared,batch_id}'=to_jsonb(batch_id)
 ) is true)
);
alter table erp_private.dms_batch_draft_preparations owner to postgres;
alter table erp_private.dms_batch_draft_preparations enable row level security;
revoke all on erp_private.dms_batch_draft_preparations from public,anon,authenticated,service_role;
create index f06_batch_preparation_auth on erp_private.dms_batch_draft_preparations(auth_user_id);
create index f06_batch_preparation_profile on erp_private.dms_batch_draft_preparations(profile_id);
create index f06_batch_preparation_batch on erp_private.dms_batch_draft_preparations(batch_id);

-- Deliberately one bit, not a privileged payload reader. Direct calls require
-- the original genuine principal AND upload AND independent global numbering.
create function erp_private.batch_draft_preparation_exists(p_session bigint)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare actor bigint:=public.current_user_profile_id(); s public.dms_upload_sessions%rowtype;
 b public.dms_upload_batches%rowtype; expected jsonb;
begin
 if p_session is null or p_session<1 or p_session>9007199254740991
  or current_setting('transaction_isolation')<>'read committed'
  or auth.uid() is null or actor is null or not erp_private.business_principal_is_active()
  or not public.current_user_has_permission('numbering.rules.generate')
  or not erp_private.upload_session_permission(p_session,'dms.documents.upload') then
  raise exception 'Batch recovery unavailable' using errcode='42501';end if;
 select * into s from public.dms_upload_sessions where id=p_session and deleted_at is null;
 if not found or s.batch_draft_operation_id is null or s.uploaded_by is distinct from actor
  or s.admission_position is null or s.admission_position not between 0 and 9
  or (s.owning_branch_id is not null and s.owning_company_id is null) then
  raise exception 'Batch recovery unavailable' using errcode='42501';end if;
 select * into b from public.dms_upload_batches where id=s.batch_id and deleted_at is null;
 if not found or b.admission_version is distinct from 1 or b.admission_auth_user_id is distinct from auth.uid()
  or b.created_by is distinct from actor or b.admission_operation_id is null
  or b.owning_company_id is distinct from s.owning_company_id or b.owning_branch_id is distinct from s.owning_branch_id
  or not erp_private.batch_scope_allowed(actor,b.owning_company_id,b.owning_branch_id)
  or b.total_files not between 1 and 10 or s.admission_position>=b.total_files then
  raise exception 'Batch recovery unavailable' using errcode='42501';end if;
 expected:=b.admission_manifest->'files'->s.admission_position;
 if expected is null or expected->'position' is distinct from to_jsonb(s.admission_position)
  or b.admission_fingerprint is distinct from encode(sha256(convert_to(erp_private.batch_manifest_bytes(b.admission_manifest),'UTF8')),'hex')
  or b.total_files is distinct from jsonb_array_length(b.admission_manifest->'files')
  or s.original_filename is distinct from expected->>'original_filename' or s.mime_type is distinct from expected->>'mime_type'
  or s.file_size_bytes is distinct from (expected->>'file_size_bytes')::numeric::bigint
  or s.sha256_hash is distinct from expected->>'sha256_hash' or s.session_code !~ '^[0-9A-F]{32}$'
  or s.temp_storage_path is distinct from 'sessions/'||s.session_code||'/'||coalesce(nullif(left(regexp_replace(regexp_replace(s.original_filename,'[^a-zA-Z0-9._-]','_','g'),'_{2,}','_','g'),200),''),'file') then
  raise exception 'Batch recovery unavailable' using errcode='42501';end if;
 return exists(select 1 from erp_private.dms_batch_draft_preparations where upload_session_id=p_session);
end $$;
alter function erp_private.batch_draft_preparation_exists(bigint) owner to postgres;
revoke all on function erp_private.batch_draft_preparation_exists(bigint) from public,anon,service_role;
grant execute on function erp_private.batch_draft_preparation_exists(bigint) to authenticated;

create policy f06_batch_preparation_select on erp_private.dms_batch_draft_preparations for select to authenticated using (
 current_setting('transaction_isolation')='read committed'
 and auth_user_id=auth.uid() and profile_id=public.current_user_profile_id()
 and erp_private.business_principal_is_active()
 and public.current_user_has_permission('numbering.rules.generate')
 and erp_private.upload_session_permission(upload_session_id,'dms.documents.upload')
 and exists (
  select 1 from public.dms_upload_sessions s join public.dms_upload_batches b on b.id=s.batch_id
  where s.id=dms_batch_draft_preparations.upload_session_id and s.deleted_at is null
   and s.batch_draft_operation_id=dms_batch_draft_preparations.draft_operation_id
   and s.uploaded_by=dms_batch_draft_preparations.profile_id
   and s.batch_id=dms_batch_draft_preparations.batch_id
   and s.admission_position=dms_batch_draft_preparations.admission_position
   and b.admission_version=1 and b.deleted_at is null
   and b.created_by=dms_batch_draft_preparations.profile_id
   and b.admission_auth_user_id=dms_batch_draft_preparations.auth_user_id
   and b.admission_operation_id=dms_batch_draft_preparations.admission_operation_id
   and b.admission_fingerprint=dms_batch_draft_preparations.admission_fingerprint
   and s.owning_company_id is not distinct from b.owning_company_id
   and s.owning_branch_id is not distinct from b.owning_branch_id
   and dms_batch_draft_preparations.request_json#>'{prepared,owning_company_id}'=coalesce(to_jsonb(s.owning_company_id),'null'::jsonb)
   and dms_batch_draft_preparations.request_json#>'{prepared,owning_branch_id}'=coalesce(to_jsonb(s.owning_branch_id),'null'::jsonb)
   and dms_batch_draft_preparations.request_json#>>'{prepared,session_code}'=s.session_code
   and dms_batch_draft_preparations.request_json#>'{prepared,party_id}'=coalesce(to_jsonb(b.entity_id),'null'::jsonb)
   and (b.entity_id is null or (b.entity_type='party' and exists(select 1 from public.parties p where p.id=b.entity_id)))
   and (erp_private.permission_in_scope('dms.documents.view',s.owning_company_id,s.owning_branch_id)
    or erp_private.permission_in_scope('dms.admin',s.owning_company_id,s.owning_branch_id))
   and (dms_batch_draft_preparations.request_json#>>'{prepared,confidentiality_level}' in ('internal','company')
    or (dms_batch_draft_preparations.request_json#>>'{prepared,confidentiality_level}' in ('hr','finance','legal','executive')
     and erp_private.permission_in_scope('dms.documents.view.'||(dms_batch_draft_preparations.request_json#>>'{prepared,confidentiality_level}'),s.owning_company_id,s.owning_branch_id)))
   and (s.document_id is null or public.f03_has_document_permission(s.document_id,'dms.documents.view'))
   and exists(select 1 from public.dms_ai_extraction_results a where a.id=s.ai_result_id
    and a.id=(dms_batch_draft_preparations.request_json#>>'{prepared,analysis_result_id}')::bigint
    and a.upload_session_id=s.id and a.document_id is not distinct from s.document_id)
 )
);
create policy f06_batch_preparation_insert on erp_private.dms_batch_draft_preparations for insert to authenticated with check (
 current_setting('transaction_isolation')='read committed'
 and auth_user_id=auth.uid() and profile_id=public.current_user_profile_id()
 and erp_private.business_principal_is_active()
 and public.current_user_has_permission('numbering.rules.generate')
 and erp_private.upload_session_permission(upload_session_id,'dms.documents.upload')
 and exists (
  select 1 from public.dms_upload_sessions s join public.dms_upload_batches b on b.id=s.batch_id
  where s.id=dms_batch_draft_preparations.upload_session_id and s.deleted_at is null
   and s.batch_draft_operation_id=dms_batch_draft_preparations.draft_operation_id
   and s.uploaded_by=dms_batch_draft_preparations.profile_id
   and s.batch_id=dms_batch_draft_preparations.batch_id
   and s.admission_position=dms_batch_draft_preparations.admission_position
   and b.admission_version=1 and b.deleted_at is null
   and b.created_by=dms_batch_draft_preparations.profile_id
   and b.admission_auth_user_id=dms_batch_draft_preparations.auth_user_id
   and b.admission_operation_id=dms_batch_draft_preparations.admission_operation_id
   and b.admission_fingerprint=dms_batch_draft_preparations.admission_fingerprint
   and s.owning_company_id is not distinct from b.owning_company_id
   and s.owning_branch_id is not distinct from b.owning_branch_id
   and dms_batch_draft_preparations.request_json#>'{prepared,owning_company_id}'=coalesce(to_jsonb(s.owning_company_id),'null'::jsonb)
   and dms_batch_draft_preparations.request_json#>'{prepared,owning_branch_id}'=coalesce(to_jsonb(s.owning_branch_id),'null'::jsonb)
   and dms_batch_draft_preparations.request_json#>>'{prepared,session_code}'=s.session_code
   and dms_batch_draft_preparations.request_json#>'{prepared,party_id}'=coalesce(to_jsonb(b.entity_id),'null'::jsonb)
   and (b.entity_id is null or (b.entity_type='party' and exists(select 1 from public.parties p where p.id=b.entity_id)))
   and (erp_private.permission_in_scope('dms.documents.view',s.owning_company_id,s.owning_branch_id)
    or erp_private.permission_in_scope('dms.admin',s.owning_company_id,s.owning_branch_id))
   and (dms_batch_draft_preparations.request_json#>>'{prepared,confidentiality_level}' in ('internal','company')
    or (dms_batch_draft_preparations.request_json#>>'{prepared,confidentiality_level}' in ('hr','finance','legal','executive')
     and erp_private.permission_in_scope('dms.documents.view.'||(dms_batch_draft_preparations.request_json#>>'{prepared,confidentiality_level}'),s.owning_company_id,s.owning_branch_id)))
   and (s.document_id is null or public.f03_has_document_permission(s.document_id,'dms.documents.view'))
   and exists(select 1 from public.dms_ai_extraction_results a where a.id=s.ai_result_id
    and a.id=(dms_batch_draft_preparations.request_json#>>'{prepared,analysis_result_id}')::bigint
    and a.upload_session_id=s.id and a.document_id is not distinct from s.document_id)
 )
);

-- BEFORE ROW owns derivation; AFTER STATEMENT covers every inserted row after
-- all immediate FK/row waits, even if RLS now hides one of those rows.
create function erp_private.batch_draft_preparation_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
declare s record; recovery jsonb; member jsonb; snapshot jsonb; checked record;
begin
 if tg_level='STATEMENT' then
  if tg_when<>'AFTER' or tg_op<>'INSERT' or current_setting('transaction_isolation')<>'read committed' then
   raise exception 'Invalid preparation statement' using errcode='42501';end if;
  -- One statement: transition rows are the independent anchor, not the possibly
  -- hidden seal. No WHERE filter/inner join can silently drop an inserted row.
  for checked in
   select to_jsonb(n) as inserted_row,to_jsonb(p) as visible_row,
    erp_private.batch_draft_preparation_exists(n.upload_session_id) as has_seal
   from batch_draft_inserted n left join erp_private.dms_batch_draft_preparations p
    on p.upload_session_id=n.upload_session_id
  loop
   if checked.has_seal is distinct from true or checked.visible_row is null
    or checked.visible_row is distinct from checked.inserted_row then
    raise exception 'Batch preparation unavailable' using errcode='42501';end if;
  end loop;
  return null;
 end if;
 if tg_op in ('UPDATE','DELETE') then raise exception 'Preparation history is immutable' using errcode='23514';end if;
 if tg_when<>'BEFORE' or tg_op<>'INSERT' then raise exception 'Invalid preparation mutation' using errcode='23514';end if;
 if current_setting('transaction_isolation')<>'read committed' or auth.uid() is null
  or not erp_private.business_principal_is_active() then raise exception 'Batch recovery unavailable' using errcode='42501';end if;
 if new.upload_session_id is null or new.upload_session_id<1 or new.upload_session_id>9007199254740991
  or new.draft_operation_id is not null or new.auth_user_id is not null or new.profile_id is not null
  or new.batch_id is not null or new.admission_operation_id is not null or new.admission_fingerprint is not null
  or new.admission_position is not null or new.request_json is not null or new.created_at is not null then
  raise exception 'Only the source session may be supplied' using errcode='22023';end if;
 perform 1 from public.dms_upload_sessions where id=new.upload_session_id and deleted_at is null for update;
 if not found then raise exception 'Batch recovery unavailable' using errcode='42501';end if;
 select u.batch_draft_operation_id,u.admission_position,u.session_code,u.batch_id,b.admission_operation_id
  into s from public.dms_upload_sessions u join public.dms_upload_batches b on b.id=u.batch_id
  where u.id=new.upload_session_id and u.deleted_at is null;
 if not found then raise exception 'Batch recovery unavailable' using errcode='42501';end if;
 if s.batch_draft_operation_id is null then raise exception 'Historical preparation requires its retained request' using errcode='PT409';end if;
 recovery:=public.read_dms_batch_draft_recovery(s.admission_operation_id);
 select value into member from jsonb_array_elements(recovery->'members') where (value->>'upload_session_id')::bigint=new.upload_session_id;
 if member is null then raise exception 'Batch recovery unavailable' using errcode='42501';end if;
 if member->>'kind'='prepared' then raise exception 'Preparation already exists' using errcode='23505';end if;
 if member->>'kind' is distinct from 'unprepared' then raise exception 'Invalid preparation state' using errcode='PT409';end if;
 snapshot:=erp_private.batch_draft_snapshot(new.upload_session_id,false);
 if snapshot->>'kind' is distinct from 'prepared' then raise exception 'Analysis is not ready' using errcode='PT409';end if;
 new.draft_operation_id:=s.batch_draft_operation_id;
 new.auth_user_id:=(recovery->>'auth_user_id')::uuid;new.profile_id:=(recovery->>'profile_id')::bigint;
 new.batch_id:=s.batch_id;new.admission_operation_id:=s.admission_operation_id;
 new.admission_fingerprint:=recovery->>'admission_fingerprint';new.admission_position:=s.admission_position;
 new.request_json:=jsonb_build_object('uploadSessionId',new.upload_session_id,'allowDuplicate',false,'prepared',snapshot->'snapshot');
 new.created_at:=clock_timestamp();
 return new;
end $$;
revoke all on function erp_private.batch_draft_preparation_guard() from public,anon,authenticated,service_role;
create trigger f06_batch_draft_preparation_guard before insert or update or delete on erp_private.dms_batch_draft_preparations
 for each row execute function erp_private.batch_draft_preparation_guard();
create trigger f06_batch_draft_preparation_postcheck after insert on erp_private.dms_batch_draft_preparations
 referencing new table as batch_draft_inserted for each statement execute function erp_private.batch_draft_preparation_guard();

create function public.read_dms_batch_draft_recovery(p_admission_operation uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare receipt jsonb; graph jsonb; entry jsonb; sealed jsonb; expected jsonb; member jsonb;
 members jsonb:='[]'::jsonb; anchors jsonb; operations uuid[]:='{}'::uuid[];
 n integer:=0; governed integer:=0; historical integer:=0; source_id bigint;
begin
 if current_setting('transaction_isolation')<>'read committed' or auth.uid() is null
  or not erp_private.business_principal_is_active() or not public.current_user_has_permission('numbering.rules.generate') then
  raise exception 'Batch recovery unavailable' using errcode='42501';end if;
 receipt:=public.read_dms_upload_batch_admission(p_admission_operation);
 if jsonb_array_length(receipt->'members') not between 1 and 10 then raise exception 'Invalid recovery graph' using errcode='PT409';end if;
 -- STABLE discriminator and ordinary RLS payload share this exact statement's
 -- snapshot. A hidden seal leaves its independently anchored source in graph.
 select jsonb_agg(jsonb_build_object('id',s.id,'code',s.session_code,'position',s.admission_position,
  'marker',s.batch_draft_operation_id,
  'has_seal',case when s.batch_draft_operation_id is null then null else erp_private.batch_draft_preparation_exists(s.id) end,
  'seal',to_jsonb(p)) order by s.admission_position,s.id)
 into graph from public.dms_upload_sessions s
 left join erp_private.dms_batch_draft_preparations p on p.upload_session_id=s.id
 where s.batch_id=(receipt->>'batch_id')::bigint and s.deleted_at is null;
 if graph is null or jsonb_array_length(graph)<>jsonb_array_length(receipt->'members') then
  raise exception 'Batch recovery unavailable' using errcode='42501';end if;
 anchors:=jsonb_build_object('version',1,'admission_operation_id',receipt->'operation_id',
  'admission_fingerprint',receipt->'fingerprint','auth_user_id',receipt->'auth_user_id','profile_id',receipt->'profile_id',
  'batch_id',receipt->'batch_id','owning_company_id',receipt->'company_id','owning_branch_id',receipt->'branch_id');
 for entry in select value from jsonb_array_elements(graph) loop
  expected:=receipt->'members'->n;source_id:=(entry->>'id')::bigint;
  if entry->'position' is distinct from to_jsonb(n) or entry->'position' is distinct from expected->'position'
   or entry->'id' is distinct from expected->'id' or entry->'code' is distinct from expected->'code'
   or not erp_private.upload_session_permission(source_id,'dms.documents.upload') then
   raise exception 'Batch recovery unavailable' using errcode='42501';end if;
  member:=jsonb_build_object('position',n,'upload_session_id',entry->'id','session_code',entry->'code','draft_operation_id',entry->'marker');
  sealed:=entry->'seal';
  if entry->'marker'='null'::jsonb then
   if sealed is distinct from 'null'::jsonb then raise exception 'Invalid historical recovery' using errcode='PT409';end if;
   historical:=historical+1;member:=member||jsonb_build_object('kind','historical');
  else
   governed:=governed+1;
   if (entry->>'marker')::uuid=any(operations) then raise exception 'Duplicate draft operation' using errcode='PT409';end if;
   operations:=array_append(operations,(entry->>'marker')::uuid);
   if entry->'has_seal'='true'::jsonb then
    if sealed is null or sealed='null'::jsonb then raise exception 'Batch preparation unavailable' using errcode='42501';end if;
    if sealed->'upload_session_id' is distinct from entry->'id' or sealed->'draft_operation_id' is distinct from entry->'marker'
     or sealed->'auth_user_id' is distinct from receipt->'auth_user_id' or sealed->'profile_id' is distinct from receipt->'profile_id'
     or sealed->'batch_id' is distinct from receipt->'batch_id' or sealed->'admission_operation_id' is distinct from receipt->'operation_id'
     or sealed->'admission_fingerprint' is distinct from receipt->'fingerprint' or sealed->'admission_position' is distinct from entry->'position'
     or sealed#>'{request_json,uploadSessionId}' is distinct from entry->'id'
     or sealed#>'{request_json,allowDuplicate}' is distinct from 'false'::jsonb
     or sealed#>'{request_json,prepared,session_code}' is distinct from entry->'code'
     or sealed#>'{request_json,prepared,owning_company_id}' is distinct from receipt->'company_id'
     or sealed#>'{request_json,prepared,owning_branch_id}' is distinct from receipt->'branch_id'
     or sealed#>'{request_json,prepared,party_id}' is distinct from coalesce(receipt#>'{manifest,context,id}','null'::jsonb) then
     raise exception 'Invalid retained preparation' using errcode='PT409';end if;
    member:=member||jsonb_build_object('kind','prepared','request',sealed->'request_json');
   elsif entry->'has_seal'='false'::jsonb and sealed='null'::jsonb then
    member:=member||jsonb_build_object('kind','unprepared','request',jsonb_build_object('uploadSessionId',source_id,'allowDuplicate',false));
   else raise exception 'Invalid preparation visibility' using errcode='PT409';
   end if;
  end if;
  members:=members||jsonb_build_array(member);n:=n+1;
 end loop;
 if historical>0 and governed>0 then raise exception 'Mixed batch recovery history' using errcode='PT409';end if;
 if not erp_private.business_principal_is_active() or not public.current_user_has_permission('numbering.rules.generate')
  or receipt is distinct from public.read_dms_upload_batch_admission(p_admission_operation) then
  raise exception 'Batch recovery unavailable' using errcode='42501';end if;
 return anchors||jsonb_build_object('members',members);
end $$;
revoke all on function public.read_dms_batch_draft_recovery(uuid) from public,anon,service_role;
grant execute on function public.read_dms_batch_draft_recovery(uuid) to authenticated;

create function public.prepare_recoverable_dms_batch_draft(p_session bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s record; recovery jsonb; member jsonb; snapshot jsonb; operation uuid;
begin
 if current_setting('transaction_isolation')<>'read committed' or p_session is null or p_session<1 or p_session>9007199254740991
  or auth.uid() is null or not erp_private.business_principal_is_active()
  or not public.current_user_has_permission('numbering.rules.generate') then
  raise exception 'Batch recovery unavailable' using errcode='42501';end if;
 perform 1 from public.dms_upload_sessions where id=p_session and deleted_at is null for update;
 if not found then raise exception 'Batch recovery unavailable' using errcode='42501';end if;
 select u.batch_draft_operation_id,b.admission_operation_id into s
  from public.dms_upload_sessions u join public.dms_upload_batches b on b.id=u.batch_id
  where u.id=p_session and u.deleted_at is null;
 if not found then raise exception 'Batch recovery unavailable' using errcode='42501';end if;
 if s.batch_draft_operation_id is null then raise exception 'Historical preparation requires its retained request' using errcode='PT409';end if;
 operation:=s.batch_draft_operation_id;
 recovery:=public.read_dms_batch_draft_recovery(s.admission_operation_id);
 select value into member from jsonb_array_elements(recovery->'members') where (value->>'upload_session_id')::bigint=p_session;
 if member is null or member->>'draft_operation_id' is distinct from operation::text then raise exception 'Invalid recovery source' using errcode='PT409';end if;
 if member->>'kind'='prepared' then return (recovery-'members')||jsonb_build_object('member',member);end if;
 if member->>'kind' is distinct from 'unprepared' then raise exception 'Invalid recovery state' using errcode='PT409';end if;
 snapshot:=erp_private.batch_draft_snapshot(p_session,true);
 if snapshot->>'kind'='analysis_required' then
  return (recovery-'members')||jsonb_build_object('member',(member-'kind')||jsonb_build_object('kind','analysis_required','processing',snapshot->'processing'));
 end if;
 if snapshot->>'kind' is distinct from 'prepared' then raise exception 'Analysis is not ready' using errcode='PT409';end if;
 insert into erp_private.dms_batch_draft_preparations(upload_session_id) values(p_session);
 -- Separate fresh ordinary statement after every trigger/RI wait.
 recovery:=public.read_dms_batch_draft_recovery(s.admission_operation_id);
 select value into member from jsonb_array_elements(recovery->'members') where (value->>'upload_session_id')::bigint=p_session;
 if member is null or member->>'kind' is distinct from 'prepared' or member->>'draft_operation_id' is distinct from operation::text then
  raise exception 'Batch preparation unavailable' using errcode='42501';end if;
 return (recovery-'members')||jsonb_build_object('member',member);
end $$;
revoke all on function public.prepare_recoverable_dms_batch_draft(bigint) from public,anon,service_role;
grant execute on function public.prepare_recoverable_dms_batch_draft(bigint) to authenticated;

create or replace function public.create_numbered_dms_batch_draft(p_operation uuid,p_request jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor bigint:=public.current_user_profile_id(); session_id bigint; s record; prepared jsonb; current_snapshot jsonb;
 allocation jsonb; reference text; draft_id bigint; title text; item record; affected integer;
 admission_op uuid; recovery jsonb; member jsonb;
begin
 if auth.uid() is null or actor is null or not erp_private.business_principal_is_active()
  or not public.current_user_has_permission('numbering.rules.generate') then
  raise exception 'Batch draft permission denied' using errcode='42501';
 end if;
 if p_operation is null or p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>262144
  or not(p_request ?& array['uploadSessionId','allowDuplicate','prepared']) or p_request-array['uploadSessionId','allowDuplicate','prepared']<>'{}'::jsonb
  or jsonb_typeof(p_request->'uploadSessionId') is distinct from 'number' or p_request->>'uploadSessionId' !~ '^[1-9][0-9]*$'
  or (p_request->>'uploadSessionId')::numeric>9007199254740991
  or jsonb_typeof(p_request->'allowDuplicate') is distinct from 'boolean' or jsonb_typeof(p_request->'prepared') is distinct from 'object' then
  raise exception 'Invalid prepared draft request' using errcode='22023';
 end if;
 session_id:=(p_request->>'uploadSessionId')::bigint;prepared:=p_request->'prepared';
 if not erp_private.upload_session_permission(session_id,'dms.documents.upload') then
  raise exception 'Upload unavailable' using errcode='42501';end if;
 -- Session-first matches the existing approval transaction. UPDATE authority is
 -- intentional here: the consumer must really be allowed to bind this session.
 -- This first statement may wait for a concurrent draft to bind a newly created
 -- document. F03 STABLE policy rereads in that statement can retain its earlier
 -- snapshot. Never decide replay/admission from that possibly stale projection:
 -- require a fresh caller-RLS row-lock/read statement after the wait as well.
 perform 1 from public.dms_upload_sessions where id=session_id and deleted_at is null for update;
 select id,document_id,owning_company_id,owning_branch_id,batch_draft_operation_id into s from public.dms_upload_sessions
  where id=session_id and deleted_at is null for update;
 if not found or not erp_private.business_principal_is_active()
  or not erp_private.upload_session_permission(session_id,'dms.documents.upload') then
  raise exception 'Upload unavailable' using errcode='42501';end if;
 -- Historical bound sources avoid fresh-work gates; unbound sources must be eligible before allocation.
 perform erp_private.batch_draft_relationship(session_id,s.document_id is null);
 if s.batch_draft_operation_id is not null then
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'Batch recovery unavailable' using errcode='42501';end if;
  select b.admission_operation_id into admission_op from public.dms_upload_batches b
   join public.dms_upload_sessions u on u.batch_id=b.id where u.id=session_id;
  recovery:=public.read_dms_batch_draft_recovery(admission_op);
  select value into member from jsonb_array_elements(recovery->'members') where (value->>'upload_session_id')::bigint=session_id;
  if member is null or member->>'kind' is distinct from 'prepared'
   or member->>'draft_operation_id' is distinct from p_operation::text
   or s.batch_draft_operation_id is distinct from p_operation
   or member->'request' is distinct from p_request then
   raise exception 'Original sealed draft request required' using errcode='PT409';end if;
 end if;
 allocation:=public.allocate_numbering_reference(p_operation,null,'MASTER_DMS_DOCUMENT',null,'reserved','dms_documents',null,
  'F06 batch draft creation '||encode(sha256(convert_to(p_request::text,'UTF8')),'hex'));
 reference:=allocation->>'generated_reference_number';
 if not erp_private.business_principal_is_active() or not public.current_user_has_permission('numbering.rules.generate')
  or not erp_private.upload_session_permission(session_id,'dms.documents.upload') then
  raise exception 'Batch draft permission denied' using errcode='42501';end if;
 if s.batch_draft_operation_id is not null then
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'Batch recovery unavailable' using errcode='42501';end if;
  select b.admission_operation_id into admission_op from public.dms_upload_batches b
   join public.dms_upload_sessions u on u.batch_id=b.id where u.id=session_id;
  recovery:=public.read_dms_batch_draft_recovery(admission_op);
  select value into member from jsonb_array_elements(recovery->'members') where (value->>'upload_session_id')::bigint=session_id;
  if member is null or member->>'kind' is distinct from 'prepared'
   or member->>'draft_operation_id' is distinct from p_operation::text
   or s.batch_draft_operation_id is distinct from p_operation
   or member->'request' is distinct from p_request then
   raise exception 'Original sealed draft request required' using errcode='PT409';end if;
 end if;
 if allocation->>'generation_status'='consumed' then
  perform erp_private.batch_draft_relationship(session_id,false);
  select id into draft_id from public.dms_documents where document_no=reference and created_by=actor and deleted_at is null;
  if draft_id is null or s.document_id is distinct from draft_id
   or not public.f03_has_document_permission(draft_id,'dms.documents.upload') then
   raise exception 'Created draft unavailable' using errcode='42501';end if;
  perform public.finish_numbering_reservation(p_operation,'consumed','dms_documents',draft_id,null);
 else
  if allocation->>'generation_status'<>'reserved' or s.document_id is not null then
   raise exception 'Upload already has a different draft request' using errcode='PT409';end if;
  current_snapshot:=erp_private.batch_draft_snapshot(session_id,false)->'snapshot';
  if prepared is distinct from current_snapshot then raise exception 'Analysis or draft context changed' using errcode='PT409';end if;
  -- The exact result is an intended UPDATE target; invoker UPDATE RLS applies.
  perform 1 from public.dms_ai_extraction_results where id=(prepared->>'analysis_result_id')::bigint
   and upload_session_id=session_id and document_id is null for update;
  if not found then raise exception 'Analysis update unavailable' using errcode='42501';end if;
  perform erp_private.lock_batch_draft_context(session_id);
  perform erp_private.lock_dms_creation_taxonomy((prepared->>'document_type_id')::bigint,(prepared->>'category_id')::bigint,
   s.owning_company_id,s.owning_branch_id,prepared->>'confidentiality_level');
  -- Recompute every field under the source/context/taxonomy locks, using the
  -- caller's ordinary RLS projection. The snapshot never grants authority.
  if prepared is distinct from erp_private.batch_draft_snapshot(session_id,false)->'snapshot' then
   raise exception 'Analysis or draft context changed' using errcode='PT409';end if;
 if s.batch_draft_operation_id is not null then
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'Batch recovery unavailable' using errcode='42501';end if;
  select b.admission_operation_id into admission_op from public.dms_upload_batches b
   join public.dms_upload_sessions u on u.batch_id=b.id where u.id=session_id;
  recovery:=public.read_dms_batch_draft_recovery(admission_op);
  select value into member from jsonb_array_elements(recovery->'members') where (value->>'upload_session_id')::bigint=session_id;
  if member is null or member->>'kind' is distinct from 'prepared'
   or member->>'draft_operation_id' is distinct from p_operation::text
   or s.batch_draft_operation_id is distinct from p_operation
   or member->'request' is distinct from p_request then
   raise exception 'Original sealed draft request required' using errcode='PT409';end if;
 end if;
  title:=coalesce(nullif(prepared->>'title',''),reference);
  insert into public.dms_documents(document_no,title,description,document_type_id,category_id,status,confidentiality_level,
   owner_user_id,owning_company_id,owning_branch_id,party_id,issue_date,expiry_date,created_by,updated_by)
  values(reference,title,prepared->>'description',(prepared->>'document_type_id')::bigint,(prepared->>'category_id')::bigint,
   'pending_ai_review',prepared->>'confidentiality_level',actor,s.owning_company_id,s.owning_branch_id,(prepared->>'party_id')::bigint,
   (prepared->>'issue_date')::date,(prepared->>'expiry_date')::date,actor,actor);
  -- F03 SELECT uses a STABLE row reread: use a fresh statement, not RETURNING.
  select id into draft_id from public.dms_documents where document_no=reference and created_by=actor and deleted_at is null;
  if draft_id is null then raise exception 'Created draft unavailable' using errcode='42501';end if;
  update public.dms_upload_sessions u set document_id=draft_id,updated_at=clock_timestamp()
   where u.id=session_id and u.document_id is null;
  get diagnostics affected=row_count;if affected<>1 then raise exception 'Upload binding unavailable' using errcode='42501';end if;
  update public.dms_ai_extraction_results a set document_id=draft_id
   where a.id=(prepared->>'analysis_result_id')::bigint and a.upload_session_id=session_id and a.document_id is null;
  get diagnostics affected=row_count;if affected<>1 then raise exception 'Analysis binding unavailable' using errcode='42501';end if;
  for item in select * from jsonb_each(jsonb_build_object('title',title,'document_type_id',(prepared->>'document_type_id')::bigint,
   'description',prepared->'description','issue_date',prepared->'issue_date','expiry_date',prepared->'expiry_date','confidentiality_level',prepared->'confidentiality_level')) loop
   if item.value='null'::jsonb or item.value='""'::jsonb then continue;end if;
   -- The existing review table has only an id PK, not a unique natural key.
   -- Serialize this consumer through its already locked parent upload. Keep
   -- ordinary UPDATE/INSERT RLS; do not infer write authority from a hidden row.
   update public.dms_intake_review_values v set suggested_value_json=item.value,
    reviewed_value_json=item.value,confidence_label=prepared->>'confidence',review_status='suggested',updated_at=clock_timestamp()
    where v.upload_session_id=session_id and v.field_scope='document' and v.field_code=item.key;
   get diagnostics affected=row_count;
   if affected>1 then raise exception 'Ambiguous existing document review field' using errcode='PT409';end if;
   if affected=0 then
    insert into public.dms_intake_review_values(upload_session_id,field_scope,field_code,field_type,suggested_value_json,reviewed_value_json,confidence_label,review_status,updated_at)
    values(session_id,'document',item.key,case when item.key='document_type_id' then 'number' when item.key in ('issue_date','expiry_date') then 'date' else 'text' end,
     item.value,item.value,prepared->>'confidence','suggested',clock_timestamp());
   end if;
  end loop;
  insert into public.dms_document_events(document_id,event_type,description,performed_by,performed_at,metadata_json)
  values(draft_id,'batch_draft_created','AI draft created from batch intake - session '||(prepared->>'session_code'),actor,clock_timestamp(),
   jsonb_build_object('document_no',reference,'upload_session_id',session_id,'batch_id',prepared->'batch_id','ai_result_id',prepared->'analysis_result_id'));
  perform public.finish_numbering_reservation(p_operation,'consumed','dms_documents',draft_id,null);
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
  values(actor,'DMS','dms_documents',draft_id,reference,'create',jsonb_build_object('event','dms_batch_draft_created','upload_session_id',session_id,
   'batch_id',prepared->'batch_id','ai_result_id',prepared->'analysis_result_id'));
 end if;
 perform erp_private.batch_draft_relationship(session_id,false);
 if public.current_user_profile_id() is distinct from actor or not erp_private.business_principal_is_active()
  or not public.current_user_has_permission('numbering.rules.generate')
  or not erp_private.upload_session_permission(session_id,'dms.documents.upload')
  or not public.f03_has_document_permission(draft_id,'dms.documents.upload')
  or not public.f03_has_document_permission(draft_id,'dms.documents.review_ai')
  or not public.f03_has_document_permission(draft_id,'dms.documents.preview')
  or not exists(select 1 from public.dms_ai_extraction_results a
   where a.id=(prepared->>'analysis_result_id')::bigint and a.upload_session_id=session_id and a.document_id=draft_id) then
  raise exception 'Batch draft permission denied' using errcode='42501';end if;
 if s.batch_draft_operation_id is not null then
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'Batch recovery unavailable' using errcode='42501';end if;
  select b.admission_operation_id into admission_op from public.dms_upload_batches b
   join public.dms_upload_sessions u on u.batch_id=b.id where u.id=session_id;
  recovery:=public.read_dms_batch_draft_recovery(admission_op);
  select value into member from jsonb_array_elements(recovery->'members') where (value->>'upload_session_id')::bigint=session_id;
  if member is null or member->>'kind' is distinct from 'prepared'
   or member->>'draft_operation_id' is distinct from p_operation::text
   or s.batch_draft_operation_id is distinct from p_operation
   or member->'request' is distinct from p_request then
   raise exception 'Original sealed draft request required' using errcode='PT409';end if;
 end if;
 return jsonb_build_object('documentId',draft_id,'documentNo',reference,'status','pending_ai_review','confidence',prepared->'confidence',
  'operation_id',p_operation,'upload_session_id',session_id,'reference_id',(allocation->>'id')::bigint,'replayed',allocation->>'generation_status'='consumed');
end $$;
revoke all on function public.create_numbered_dms_batch_draft(uuid,jsonb) from public,anon,service_role;
grant execute on function public.create_numbered_dms_batch_draft(uuid,jsonb) to authenticated;

grant select,insert on erp_private.dms_batch_draft_preparations to authenticated;
notify pgrst,'reload schema';
commit;
