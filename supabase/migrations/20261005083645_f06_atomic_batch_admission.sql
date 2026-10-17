begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Legacy rows are deliberately NOT backfilled. Their scope is derived only
-- from complete, unanimous retained membership by the narrow reader below.
alter table public.dms_upload_batches
 add column owning_company_id bigint references public.owner_companies(id),
 add column owning_branch_id bigint references public.branches(id),
 add column admission_version smallint,
 add column admission_auth_user_id uuid references auth.users(id) on delete restrict,
 add column admission_operation_id uuid,
 add column admission_manifest jsonb,
 add column admission_fingerprint text;
alter table public.dms_upload_sessions add column admission_position integer;
alter table public.dms_upload_batches add constraint f06_batch_anchor_shape check (
 (admission_version is null and admission_auth_user_id is null and admission_operation_id is null
  and admission_manifest is null and admission_fingerprint is null and owning_company_id is null and owning_branch_id is null)
 or (admission_version is not null and admission_version=1 and admission_auth_user_id is not null
  and admission_operation_id is not null and admission_manifest is not null and admission_fingerprint is not null
  and admission_fingerprint ~ '^[0-9a-f]{64}$' and created_by is not null
  and (owning_branch_id is null or owning_company_id is not null)));
alter table public.dms_upload_sessions add constraint f06_batch_position_shape check
 (admission_position is null or (batch_id is not null and admission_position between 0 and 9 and uploaded_by is not null
  and sha256_hash is not null and (owning_branch_id is null or owning_company_id is not null)));
create unique index f06_batch_operation on public.dms_upload_batches(admission_auth_user_id,admission_operation_id)
 where admission_version is not null;
create unique index f06_batch_position on public.dms_upload_sessions(batch_id,admission_position) where admission_position is not null;
create unique index f06_batch_path on public.dms_upload_sessions(temp_storage_path) where admission_position is not null;
create unique index f06_batch_create_audit on public.audit_logs(entity_name,entity_id,(new_values->>'event'))
 where new_values->>'event' in ('dms_batch_admitted_v1','dms_batch_session_admitted_v1');

-- Exact parsed-value numeric rules: integer-valued 1, 1.0 and 1e0 agree.
create function erp_private.batch_integer(v jsonb,lo numeric,hi numeric)
returns boolean language sql immutable security invoker set search_path='' as $$
 select case when jsonb_typeof(v)='number' then (v::text)::numeric=trunc((v::text)::numeric)
 and (v::text)::numeric between lo and hi else false end;
$$;
create function erp_private.batch_manifest_bytes(v jsonb)
returns text language plpgsql immutable security invoker set search_path='' as $$
declare f jsonb; pos integer:=0; name text; mime text; ext text; expected text; result text; context text; cp integer; ch text;
begin
 if v is null or jsonb_typeof(v) is distinct from 'object' or not(v ?& array['version','context','files'])
  or v-array['version','context','files']<>'{}'::jsonb or v->'version' is distinct from '1'::jsonb
  or jsonb_typeof(v->'files') is distinct from 'array' or octet_length(convert_to(v::text,'UTF8'))>262144 then
  raise exception 'Invalid batch manifest' using errcode='22023';end if;
 if jsonb_array_length(v->'files') not between 1 and 10 then raise exception 'Invalid file count' using errcode='22023';end if;
 if v->'context'='null'::jsonb then context:='null';
 elsif jsonb_typeof(v->'context')='object' and (v->'context')-array['type','id']='{}'::jsonb
  and v->'context'->>'type'='party' and erp_private.batch_integer(v->'context'->'id',1,9007199254740991) then
  context:='["party",'||((v->'context'->>'id')::numeric)::bigint::text||']';
 else raise exception 'Invalid batch context' using errcode='22023';end if;
 result:='["dms-batch-admission/v1",'||context||',[';
 for f in select value from jsonb_array_elements(v->'files') loop
  if jsonb_typeof(f) is distinct from 'object' or not(f ?& array['position','original_filename','mime_type','file_size_bytes','sha256_hash'])
   or f-array['position','original_filename','mime_type','file_size_bytes','sha256_hash']<>'{}'::jsonb
   or not erp_private.batch_integer(f->'position',pos,pos) or not erp_private.batch_integer(f->'file_size_bytes',1,52428800)
   or jsonb_typeof(f->'original_filename') is distinct from 'string' or jsonb_typeof(f->'mime_type') is distinct from 'string'
   or jsonb_typeof(f->'sha256_hash') is distinct from 'string' or f->>'sha256_hash' !~ '^[0-9a-f]{64}$' then
   raise exception 'Invalid batch file' using errcode='22023';end if;
  name:=f->>'original_filename';mime:=f->>'mime_type';
  if char_length(name) not between 1 and 500 then raise exception 'Invalid file name' using errcode='22023';end if;
  context:='';
  for ch in select regexp_split_to_table(name,'') loop
   cp:=ascii(ch);
   if cp between 0 and 31 or cp between 127 and 159 or cp between 55296 and 57343 then raise exception 'Invalid file name' using errcode='22023';end if;
   if not(cp between 9 and 13 or cp in (32,160,5760,8232,8233,8239,8287,12288,65279) or cp between 8192 and 8202) then context:='nonempty';end if;
  end loop;
  if context='' then raise exception 'Invalid file name' using errcode='22023';end if;
  ext:=lower(substring(name from '\.([^.]+)$'));
  expected:=case ext when 'pdf' then 'application/pdf' when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg'
   when 'png' then 'image/png' when 'tif' then 'image/tiff' when 'tiff' then 'image/tiff' when 'webp' then 'image/webp'
   when 'doc' then 'application/msword' when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
   when 'xls' then 'application/vnd.ms-excel' when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' end;
  if expected is null or mime is distinct from expected then raise exception 'Invalid file type' using errcode='22023';end if;
  result:=result||case when pos>0 then ',' else '' end||'['||pos::text||','||to_json(name)::text||','||to_json(mime)::text||','||
   ((f->>'file_size_bytes')::numeric)::bigint::text||','||to_json(f->>'sha256_hash')::text||']';pos:=pos+1;
 end loop;
 return result||']]';
end $$;
revoke all on function erp_private.batch_integer(jsonb,numeric,numeric),erp_private.batch_manifest_bytes(jsonb) from public,anon,service_role;
grant execute on function erp_private.batch_integer(jsonb,numeric,numeric),erp_private.batch_manifest_bytes(jsonb) to authenticated;

create function erp_private.batch_scope_allowed(actor bigint,company bigint,branch bigint)
returns boolean language sql stable security invoker set search_path='' as $$
 select erp_private.business_principal_is_active() and
  ((actor=public.current_user_profile_id() and erp_private.permission_in_scope('dms.documents.upload',company,branch))
   or erp_private.permission_in_scope('dms.admin',company,branch));
$$;
-- Only the actor's own pinned tuple is returned. Locks are bounded by the RPC's
-- transaction. Every complete grant witness is locked in deterministic ID order.
create function erp_private.lock_batch_admission_authority(needs_party boolean default false)
returns table(actor bigint,company bigint,branch bigint) language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare uid uuid:=auth.uid(); sid text:=auth.jwt()->>'session_id'; r record; witnesses jsonb; dms_allowed boolean; party_allowed boolean;
begin
 if uid is null or current_setting('transaction_isolation')<>'read committed' then raise exception 'Batch permission denied' using errcode='42501';end if;
 perform 1 from auth.users where id=uid for share;
 perform 1 from auth.sessions where user_id=uid and id::text=sid for share;
 select id,owner_company_id,branch_id into actor,company,branch from public.user_profiles where auth_user_id=uid for share;
 if actor is null then raise exception 'Batch permission denied' using errcode='42501';end if;
 -- Capture complete chains ONCE. Final authorization may use only these
 -- captured IDs, never a newly inserted assignment found by a later snapshot.
 -- Capture all self chains as a conservative superset, including party-read
 -- dependencies when context needs them; only matching live chains authorize.
 select coalesce(jsonb_agg(to_jsonb(w)),'[]'::jsonb) into witnesses from (
  select ur.id assignment,r.id role,rp.id pair,p.id permission
  from public.user_roles ur join public.roles r on r.id=ur.role_id
  left join public.role_permissions rp on rp.role_id=r.id left join public.permissions p on p.id=rp.permission_id
  where ur.user_profile_id=actor
 ) w;
 for r in select distinct (value->>'assignment')::bigint id from jsonb_array_elements(witnesses) order by id loop
  perform 1 from public.user_roles where id=r.id for share;
 end loop;
 for r in select distinct (value->>'role')::bigint id from jsonb_array_elements(witnesses) order by id loop
  perform 1 from public.roles where id=r.id for share;
 end loop;
 for r in select distinct (value->>'pair')::bigint id from jsonb_array_elements(witnesses) where value->>'pair' is not null order by id loop
  perform 1 from public.role_permissions where id=r.id for share;
 end loop;
 for r in select distinct (value->>'permission')::bigint id from jsonb_array_elements(witnesses) where value->>'permission' is not null order by id loop
  perform 1 from public.permissions where id=r.id for share;
 end loop;
 -- A second statement after every possible wait rebinds the locked self tuple.
 select p.id,p.owner_company_id,p.branch_id into actor,company,branch from public.user_profiles p where p.auth_user_id=uid;
 -- Rejoin every captured edge after waits; a changed role/pair association,
 -- revocation or scope move cannot borrow a new uncaptured complete witness.
 select coalesce(bool_or(
   (r.role_code in ('system_admin','group_admin') and ur.owner_company_id is null and ur.branch_id is null)
   or (p.is_active and p.permission_code in ('dms.documents.upload','dms.admin')
    and ((ur.owner_company_id is null and ur.branch_id is null) or (ur.owner_company_id=company and (ur.branch_id is null or ur.branch_id=branch))))),false),
  coalesce(bool_or(
   (r.role_code in ('system_admin','group_admin') and ur.owner_company_id is null and ur.branch_id is null)
   or (p.is_active and p.permission_code in ('master_data.parties.view','master_data.party_master.view')
    and ur.owner_company_id is null and ur.branch_id is null)),false)
 into dms_allowed,party_allowed
 from jsonb_array_elements(witnesses) w
 join public.user_roles ur on ur.id=(w.value->>'assignment')::bigint and ur.user_profile_id=actor and ur.is_active
 join public.roles r on r.id=(w.value->>'role')::bigint and ur.role_id=r.id and r.is_active
 left join public.role_permissions rp on rp.id=(w.value->>'pair')::bigint and rp.role_id=r.id
 left join public.permissions p on p.id=(w.value->>'permission')::bigint and rp.permission_id=p.id;
 if actor is null or not erp_private.business_principal_is_active() or not dms_allowed or (needs_party and not party_allowed) then
  raise exception 'Batch permission denied' using errcode='42501';end if;
 return next;
end $$;
alter function erp_private.lock_batch_admission_authority(boolean) owner to postgres;
revoke all on function erp_private.lock_batch_admission_authority(boolean),erp_private.batch_scope_allowed(bigint,bigint,bigint) from public,anon,service_role;
grant execute on function erp_private.lock_batch_admission_authority(boolean),erp_private.batch_scope_allowed(bigint,bigint,bigint) to authenticated;

create function erp_private.batch_fresh_context(company bigint,branch bigint,context jsonb,locking boolean)
returns boolean language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
begin
 if auth.uid() is null or not erp_private.batch_scope_allowed(public.current_user_profile_id(),company,branch) then return false;end if;
 if company is not null then
  if locking then perform 1 from public.owner_companies where id=company for share;end if;
  if not exists(select 1 from public.owner_companies where id=company and is_active) then return false;end if;
 end if;
 if branch is not null then
  if company is null then return false;end if;
  if locking then perform 1 from public.branches where id=branch for share;end if;
  if not exists(select 1 from public.branches where id=branch and owner_company_id=company and is_active) then return false;end if;
 end if;
 if locking then perform 1 from public.erp_ai_feature_flags where feature_code='DMS_BATCH_INTAKE' for share;end if;
 if not exists(select 1 from public.erp_ai_feature_flags where feature_code='DMS_BATCH_INTAKE' and is_enabled) then return false;end if;
 if context is distinct from 'null'::jsonb then
  if context->>'type' is distinct from 'party' or not erp_private.batch_integer(context->'id',1,9007199254740991) then return false;end if;
  -- Match the existing party read-policy capabilities before this narrow
  -- definer reads/locks a party. Invoker callers also verify actual row RLS.
  if not (public.current_user_has_permission('master_data.parties.view')
   or public.current_user_has_permission('master_data.party_master.view') or public.current_user_has_role('system_admin')) then return false;end if;
  if locking then perform 1 from public.parties where id=(context->>'id')::numeric::bigint for share;end if;
  if not exists(select 1 from public.parties where id=(context->>'id')::numeric::bigint and is_active and not is_locked) then return false;end if;
 end if;
 return erp_private.business_principal_is_active() and erp_private.batch_scope_allowed(public.current_user_profile_id(),company,branch);
end $$;
alter function erp_private.batch_fresh_context(bigint,bigint,jsonb,boolean) owner to postgres;
revoke all on function erp_private.batch_fresh_context(bigint,bigint,jsonb,boolean) from public,anon,service_role;
grant execute on function erp_private.batch_fresh_context(bigint,bigint,jsonb,boolean) to authenticated;

create function erp_private.batch_legacy_allowed(batch bigint)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare b record; s record;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active() then return false;end if;
 select * into b from public.dms_upload_batches where id=batch and admission_version is null;
 if not found or b.created_by is null or b.total_files<1 then return false;end if;
 select * into s from public.dms_upload_sessions where batch_id=batch order by id limit 1;
 if not found or s.uploaded_by is distinct from b.created_by or (s.owning_branch_id is not null and s.owning_company_id is null)
  or (select count(*) from public.dms_upload_sessions where batch_id=batch)<>b.total_files
  or exists(select 1 from public.dms_upload_sessions u where u.batch_id=batch and
   (u.uploaded_by is distinct from b.created_by or u.owning_company_id is distinct from s.owning_company_id or u.owning_branch_id is distinct from s.owning_branch_id)) then return false;end if;
 return erp_private.batch_scope_allowed(b.created_by,s.owning_company_id,s.owning_branch_id);
end $$;
alter function erp_private.batch_legacy_allowed(bigint) owner to postgres;
revoke all on function erp_private.batch_legacy_allowed(bigint) from public,anon,service_role;
grant execute on function erp_private.batch_legacy_allowed(bigint) to authenticated;
drop policy dms_upload_batches_insert on public.dms_upload_batches;
drop policy dms_upload_batches_select on public.dms_upload_batches;
drop policy dms_upload_batches_update on public.dms_upload_batches;
create policy dms_upload_batches_insert on public.dms_upload_batches for insert to authenticated with check
 (admission_version=1 and admission_auth_user_id=auth.uid() and created_by=public.current_user_profile_id()
  and erp_private.batch_scope_allowed(created_by,owning_company_id,owning_branch_id));
create policy dms_upload_batches_select on public.dms_upload_batches for select to authenticated using
 (case when admission_version=1 then erp_private.batch_scope_allowed(created_by,owning_company_id,owning_branch_id) else erp_private.batch_legacy_allowed(id) end);
create policy dms_upload_batches_update on public.dms_upload_batches for update to authenticated using
 (case when admission_version=1 then erp_private.batch_scope_allowed(created_by,owning_company_id,owning_branch_id) else erp_private.batch_legacy_allowed(id) end) with check
 (case when admission_version=1 then erp_private.batch_scope_allowed(created_by,owning_company_id,owning_branch_id) else erp_private.batch_legacy_allowed(id) end);

create function erp_private.batch_identity_guard()
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
 new.session_code:=upper(replace(gen_random_uuid()::text,'-',''));
 new.temp_storage_path:='sessions/'||new.session_code||'/'||coalesce(nullif(left(regexp_replace(regexp_replace(new.original_filename,'[^a-zA-Z0-9._-]','_','g'),'_{2,}','_','g'),200),''),'file');
 new.expires_at:=transaction_timestamp()+interval '14 days';
 return new;
end $$;
revoke all on function erp_private.batch_identity_guard() from public,anon,authenticated,service_role;
create trigger f06_batch_identity before insert or update or delete on public.dms_upload_batches for each row execute function erp_private.batch_identity_guard();
-- Alphabetically after F03's existing profile pinning trigger.
create trigger f06_batch_member_identity before insert or update or delete on public.dms_upload_sessions for each row execute function erp_private.batch_identity_guard();

create function erp_private.batch_create_audit()
returns trigger language plpgsql security invoker set search_path='' as $$
declare b public.dms_upload_batches%rowtype; event text;
begin
 if tg_table_name='dms_upload_batches' then b:=new;event:='dms_batch_admitted_v1';
 else select * into b from public.dms_upload_batches where id=new.batch_id;event:='dms_batch_session_admitted_v1';end if;
 if b.admission_version is distinct from 1 then return new;end if;
 insert into public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
 values(b.created_by,b.owning_company_id,b.owning_branch_id,'DMS',tg_table_name,new.id,
  case when tg_table_name='dms_upload_batches' then b.batch_code else to_jsonb(new)->>'session_code' end,'create',
  jsonb_build_object('event',event,'batch_id',b.id,'operation_id',b.admission_operation_id,'fingerprint',b.admission_fingerprint));
 return new;
end $$;
revoke all on function erp_private.batch_create_audit() from public,anon,authenticated,service_role;
create trigger f06_batch_audit after insert on public.dms_upload_batches for each row execute function erp_private.batch_create_audit();
create trigger f06_batch_member_audit after insert on public.dms_upload_sessions for each row execute function erp_private.batch_create_audit();

-- Trigger-only definer reads the entire retained graph and mandatory facts,
-- independent of audit-view/document-confidentiality grants. It performs no DML.
create function erp_private.batch_graph_guard()
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
  if expected is null or s.admission_position is null or s.uploaded_by is distinct from b.created_by
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
create constraint trigger f06_batch_complete after insert or update on public.dms_upload_batches deferrable initially deferred for each row execute function erp_private.batch_graph_guard();
create constraint trigger f06_batch_members_complete after insert or update on public.dms_upload_sessions deferrable initially deferred for each row execute function erp_private.batch_graph_guard();

create function erp_private.batch_audit_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare b record; sid bigint; reference text; ev text;
begin
 if tg_op<>'INSERT' and old.new_values->>'event' in ('dms_batch_admitted_v1','dms_batch_session_admitted_v1') then raise exception 'Admission audit is immutable' using errcode='23514';end if;
 if tg_op='DELETE' then return old;end if;
 ev:=new.new_values->>'event';
 if ev not in ('dms_batch_admitted_v1','dms_batch_session_admitted_v1') or ev is null then return new;end if;
 if tg_op<>'INSERT' then raise exception 'Invalid admission audit' using errcode='23514';end if;
 if ev='dms_batch_admitted_v1' then
  select * into b from public.dms_upload_batches where id=new.entity_id and admission_version=1;reference:=b.batch_code;
  if new.entity_name is distinct from 'dms_upload_batches' then raise exception 'Invalid admission audit' using errcode='23514';end if;
 else
  select batch_id,session_code into sid,reference from public.dms_upload_sessions where id=new.entity_id and admission_position is not null;
  select * into b from public.dms_upload_batches where id=sid and admission_version=1;
  if new.entity_name is distinct from 'dms_upload_sessions' then raise exception 'Invalid admission audit' using errcode='23514';end if;
 end if;
 if b.id is null or b.admission_auth_user_id is distinct from auth.uid()
  or new.actor_user_profile_id is distinct from b.created_by or new.owner_company_id is distinct from b.owning_company_id
  or new.branch_id is distinct from b.owning_branch_id or new.module_code is distinct from 'DMS' or new.action is distinct from 'create'
  or new.entity_reference is distinct from reference or new.old_values is not null or new.created_at is distinct from b.created_at
  or new.ip_address is not null or new.user_agent is not null
  or new.new_values is distinct from jsonb_build_object('event',ev,'batch_id',b.id,'operation_id',b.admission_operation_id,'fingerprint',b.admission_fingerprint)
  then raise exception 'Invalid admission audit' using errcode='23514';end if;
 return new;
end $$;
alter function erp_private.batch_audit_guard() owner to postgres;
revoke all on function erp_private.batch_audit_guard() from public,anon,authenticated,service_role;
create trigger f06_batch_audit_integrity before insert or update or delete on public.audit_logs for each row execute function erp_private.batch_audit_guard();

-- Ordinary-RLS reconstruction always includes every retained linked member.
-- This is also the shared structural input to the numbered consumer; no row
-- lock is acquired here, so it cannot invert session-first consumer ordering.
create function erp_private.batch_source(p_batch bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.dms_upload_batches%rowtype; s public.dms_upload_sessions%rowtype;
 members jsonb:='[]'; f jsonb; n integer:=0; company bigint; branch bigint;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active() then raise exception 'Batch unavailable' using errcode='42501';end if;
 select * into b from public.dms_upload_batches where id=p_batch;
 if not found or b.created_by is null or b.total_files<1 then raise exception 'Batch unavailable' using errcode='42501';end if;
 for s in select * from public.dms_upload_sessions where batch_id=p_batch order by admission_position nulls last,id loop
  if s.uploaded_by is distinct from b.created_by or (s.owning_branch_id is not null and s.owning_company_id is null) then
   raise exception 'Invalid batch relationship' using errcode='PT409';end if;
  if n=0 then company:=s.owning_company_id;branch:=s.owning_branch_id;end if;
  if s.owning_company_id is distinct from company or s.owning_branch_id is distinct from branch then
   raise exception 'Invalid batch relationship' using errcode='PT409';end if;
  if b.admission_version=1 then
   f:=b.admission_manifest->'files'->n;
   if s.admission_position is distinct from n or f is null or s.owning_company_id is distinct from b.owning_company_id
    or s.owning_branch_id is distinct from b.owning_branch_id or s.original_filename is distinct from f->>'original_filename'
    or s.mime_type is distinct from f->>'mime_type' or s.file_size_bytes is distinct from (f->>'file_size_bytes')::numeric::bigint
    or s.sha256_hash is distinct from f->>'sha256_hash' or s.session_code !~ '^[0-9A-F]{32}$'
    or s.temp_storage_path is distinct from 'sessions/'||s.session_code||'/'||coalesce(nullif(left(regexp_replace(regexp_replace(s.original_filename,'[^a-zA-Z0-9._-]','_','g'),'_{2,}','_','g'),200),''),'file') then
    raise exception 'Invalid batch relationship' using errcode='PT409';end if;
  elsif s.admission_position is not null then raise exception 'Invalid legacy relationship' using errcode='PT409';end if;
  members:=members||jsonb_build_array(jsonb_build_object('position',s.admission_position,'id',s.id,'code',s.session_code,
   'bucket','dms-temp','path',s.temp_storage_path,'name',s.original_filename,'mime',s.mime_type,'size',s.file_size_bytes,'sha256',s.sha256_hash));
  n:=n+1;
 end loop;
 if n<>b.total_files or not erp_private.batch_scope_allowed(b.created_by,company,branch)
  or (b.admission_version is null and not erp_private.batch_legacy_allowed(p_batch)) then
  raise exception 'Batch unavailable' using errcode='42501';end if;
 if ((b.entity_type is null and b.entity_id is null) or (b.entity_type='party' and b.entity_id between 1 and 9007199254740991)) is not true then
  raise exception 'Invalid batch context' using errcode='PT409';end if;
 if b.admission_version=1 and (b.total_files<>jsonb_array_length(b.admission_manifest->'files')
  or b.admission_fingerprint is distinct from encode(sha256(convert_to(erp_private.batch_manifest_bytes(b.admission_manifest),'UTF8')),'hex')
  or b.entity_type is distinct from b.admission_manifest#>>'{context,type}'
  or b.entity_id is distinct from (b.admission_manifest#>>'{context,id}')::numeric::bigint) then
  raise exception 'Invalid admission anchor' using errcode='PT409';end if;
 return jsonb_build_object('id',b.id,'code',b.batch_code,'creator',b.created_by,'company',company,'branch',branch,
  'entity_type',b.entity_type,'entity_id',b.entity_id,'version',b.admission_version,'auth',b.admission_auth_user_id,
  'operation',b.admission_operation_id,'manifest',b.admission_manifest,'fingerprint',b.admission_fingerprint,'members',members);
end $$;
revoke all on function erp_private.batch_source(bigint) from public,anon,service_role;
grant execute on function erp_private.batch_source(bigint) to authenticated;

create function public.read_dms_upload_batch_admission(p_operation uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare bid bigint; source jsonb;
begin
 if p_operation is null or auth.uid() is null or current_setting('transaction_isolation')<>'read committed'
  or not erp_private.business_principal_is_active() then raise exception 'Batch unavailable' using errcode='42501';end if;
 select id into bid from public.dms_upload_batches where admission_version=1 and admission_operation_id=p_operation
  and admission_auth_user_id=auth.uid() and created_by=public.current_user_profile_id();
 if bid is null then raise exception 'Batch unavailable' using errcode='42501';end if;
 source:=erp_private.batch_source(bid);
 return jsonb_build_object('version',1,'operation_id',p_operation,'auth_user_id',source->'auth','profile_id',source->'creator',
  'fingerprint',source->'fingerprint','manifest',source->'manifest','batch_id',bid,'batch_code',source->'code',
  'company_id',source->'company','branch_id',source->'branch','members',source->'members');
end $$;
revoke all on function public.read_dms_upload_batch_admission(uuid) from public,anon,service_role;
grant execute on function public.read_dms_upload_batch_admission(uuid) to authenticated;

create function public.admit_dms_upload_batch(p_operation uuid,p_request jsonb)
returns jsonb language plpgsql security invoker set search_path=''
set lock_timeout='5s' set statement_timeout='20s' as $$
declare manifest jsonb; fingerprint text; a record; bid bigint; existing jsonb; f jsonb; receipt jsonb;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active() then raise exception 'Batch permission denied' using errcode='42501';end if;
 if p_operation is null or p_request is null or jsonb_typeof(p_request) is distinct from 'object'
  or not(p_request ?& array['version','context','files','revision'])
  or p_request-array['version','context','files','revision']<>'{}'::jsonb
  or p_request->'revision' is distinct from 'null'::jsonb or octet_length(convert_to(p_request::text,'UTF8'))>262144 then
  raise exception 'Invalid batch request' using errcode='22023';end if;
 manifest:=p_request-'revision';
 fingerprint:=encode(sha256(convert_to(erp_private.batch_manifest_bytes(manifest),'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('dms-batch-admission/v1:'||auth.uid()::text||':'||p_operation::text,0));
 -- The operation lookup precedes flag, organization and lifecycle eligibility.
 select id,admission_manifest into bid,existing from public.dms_upload_batches
  where admission_version=1 and admission_auth_user_id=auth.uid() and admission_operation_id=p_operation;
 if bid is not null then
  if existing is distinct from manifest then raise exception 'Batch operation conflict' using errcode='PT409';end if;
  receipt:=public.read_dms_upload_batch_admission(p_operation);
  return jsonb_build_object('receipt',receipt,'replayed',true);
 end if;
 select * into a from erp_private.lock_batch_admission_authority(manifest->'context' is distinct from 'null'::jsonb);
 -- RPC-owned constraints only: callers selecting ALL IMMEDIATE cannot cause
 -- partial assembly to escape. These are forced before returning any receipt.
 set constraints public.f06_batch_complete,public.f06_batch_members_complete deferred;
 insert into public.dms_upload_batches(created_by,owning_company_id,owning_branch_id,admission_version,admission_auth_user_id,
  admission_operation_id,admission_manifest,admission_fingerprint,total_files,entity_type,entity_id)
 values(a.actor,a.company,a.branch,1,auth.uid(),p_operation,manifest,fingerprint,jsonb_array_length(manifest->'files'),
  manifest#>>'{context,type}',(manifest#>>'{context,id}')::numeric::bigint) returning id into bid;
 for f in select value from jsonb_array_elements(manifest->'files') loop
  insert into public.dms_upload_sessions(batch_id,admission_position,uploaded_by,original_filename,mime_type,file_size_bytes,sha256_hash)
  values(bid,(f->>'position')::numeric::integer,a.actor,f->>'original_filename',f->>'mime_type',(f->>'file_size_bytes')::numeric::bigint,f->>'sha256_hash');
 end loop;
 set constraints public.f06_batch_complete,public.f06_batch_members_complete immediate;
 receipt:=public.read_dms_upload_batch_admission(p_operation);
 return jsonb_build_object('receipt',receipt,'replayed',false);
end $$;
revoke all on function public.admit_dms_upload_batch(uuid,jsonb) from public,anon,service_role;
grant execute on function public.admit_dms_upload_batch(uuid,jsonb) to authenticated;

-- Current eligibility is separate from the complete immutable receipt. A
-- present historical member may coexist with a fresh-signable absent member.
create function public.dms_upload_batch_eligibility(p_operation uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare receipt jsonb; b public.dms_upload_batches%rowtype; positions jsonb;
begin
 receipt:=public.read_dms_upload_batch_admission(p_operation);
 select * into b from public.dms_upload_batches where id=(receipt->>'batch_id')::bigint;
 if not found then raise exception 'Batch unavailable' using errcode='42501';end if;
 if b.deleted_at is not null or b.status in ('completed','cancelled')
  or not erp_private.batch_fresh_context(b.owning_company_id,b.owning_branch_id,b.admission_manifest->'context',false)
  or (b.entity_type='party' and not exists(select 1 from public.parties where id=b.entity_id and is_active and not is_locked)) then
  return jsonb_build_object('eligible',false,'positions','[]'::jsonb);end if;
 select coalesce(jsonb_agg(admission_position order by admission_position),'[]'::jsonb) into positions
 from public.dms_upload_sessions where batch_id=b.id and document_id is null and deleted_at is null and temp_cleaned_at is null
  and expires_at>clock_timestamp() and status not in ('completed','cancelled','expired')
  and intake_status not in ('approved','discarded','cancelled','expired');
 -- Fresh reconstruction after observations prevents returning a plan across a
 -- detected authority/identity change. No SQL lock extends to Storage calls.
 if receipt is distinct from public.read_dms_upload_batch_admission(p_operation) then raise exception 'Batch changed' using errcode='PT409';end if;
 return jsonb_build_object('eligible',true,'positions',positions);
end $$;
revoke all on function public.dms_upload_batch_eligibility(uuid) from public,anon,service_role;
grant execute on function public.dms_upload_batch_eligibility(uuid) to authenticated;

create function public.discover_dms_upload_batch_admissions(p_before_id bigint default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r record; receipts jsonb:='[]';
begin
 if auth.uid() is null or not erp_private.business_principal_is_active() then raise exception 'Batch unavailable' using errcode='42501';end if;
 if p_before_id is not null and (p_before_id<1 or p_before_id>9007199254740991) then raise exception 'Invalid cursor' using errcode='22023';end if;
 for r in select admission_operation_id from public.dms_upload_batches where admission_version=1
  and admission_auth_user_id=auth.uid() and created_by=public.current_user_profile_id()
  and (p_before_id is null or id<p_before_id) order by id desc limit 20 loop
  receipts:=receipts||jsonb_build_array(public.read_dms_upload_batch_admission(r.admission_operation_id));
 end loop;
 return receipts;
end $$;
revoke all on function public.discover_dms_upload_batch_admissions(bigint) from public,anon,service_role;
grant execute on function public.discover_dms_upload_batch_admissions(bigint) to authenticated;

create function erp_private.batch_draft_relationship(p_session bigint,p_fresh boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.dms_upload_sessions%rowtype; b public.dms_upload_batches%rowtype; source jsonb; context jsonb;
begin
 if not erp_private.upload_session_permission(p_session,'dms.documents.upload') then raise exception 'Upload unavailable' using errcode='42501';end if;
 select * into s from public.dms_upload_sessions where id=p_session and deleted_at is null;
 if not found or s.batch_id is null or s.temp_storage_path is null then raise exception 'Batch source unavailable' using errcode='42501';end if;
 source:=erp_private.batch_source(s.batch_id);
 select * into b from public.dms_upload_batches where id=s.batch_id;
 if not found then raise exception 'Batch unavailable' using errcode='42501';end if;
 if p_fresh then
  context:=case when b.entity_type is null then 'null'::jsonb else jsonb_build_object('type',b.entity_type,'id',b.entity_id) end;
  if b.deleted_at is not null or b.status in ('completed','cancelled') or s.document_id is not null
   or s.status in ('completed','cancelled','expired') or s.intake_status in ('approved','discarded','cancelled','expired')
   or (s.expires_at is not null and s.expires_at<=clock_timestamp()) or s.temp_cleaned_at is not null
   or not erp_private.batch_fresh_context(s.owning_company_id,s.owning_branch_id,context,false)
   or (b.entity_type='party' and not exists(select 1 from public.parties where id=b.entity_id and is_active and not is_locked)) then
   raise exception 'Batch source unavailable' using errcode='PT409';end if;
 end if;
 return source;
end $$;
revoke all on function erp_private.batch_draft_relationship(bigint,boolean) from public,anon,service_role;
grant execute on function erp_private.batch_draft_relationship(bigint,boolean) to authenticated;

-- Narrow replacements of the three numbered-source boundaries; allocator,
-- public DTO, review policy and the remainder of the consumer are preserved.
create or replace function erp_private.batch_draft_snapshot(p_session bigint,p_allow_unready boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s record; a record; t record; party bigint; prepared jsonb;
 title text; issue date; expiry date; source jsonb; batch_source jsonb:=null;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active()
  or not public.current_user_has_permission('numbering.rules.generate')
  or not erp_private.upload_session_permission(p_session,'dms.documents.upload') then
  raise exception 'Batch draft permission denied' using errcode='42501';
 end if;
 if not erp_private.batch_draft_enabled(p_session) then
  raise exception 'Batch intake is unavailable' using errcode='42501';
 end if;
 select id,session_code,batch_id,document_id,intake_status,status,original_filename,ai_result_id,
  owning_company_id,owning_branch_id,uploaded_by,temp_storage_path
  into s from public.dms_upload_sessions where id=p_session and deleted_at is null;
 if not found then raise exception 'Upload unavailable' using errcode='42501';end if;
 if s.document_id is not null or s.status in ('completed','cancelled','expired')
  or s.intake_status in ('approved','discarded','cancelled','expired') then
  raise exception 'Upload already bound or closed' using errcode='PT409';
 end if;
 if s.temp_storage_path is null or s.batch_id is null then raise exception 'Upload has no batch/source binding' using errcode='22023';end if;
 if not erp_private.permission_in_scope('dms.documents.upload',s.owning_company_id,s.owning_branch_id)
  or not (erp_private.permission_in_scope('dms.documents.view',s.owning_company_id,s.owning_branch_id)
   or erp_private.permission_in_scope('dms.admin',s.owning_company_id,s.owning_branch_id)) then
  raise exception 'Draft destination unavailable' using errcode='42501';
 end if;
 batch_source:=erp_private.batch_draft_relationship(p_session,true);
 if batch_source->>'entity_type'='party' then party:=(batch_source->>'entity_id')::bigint;end if;
 if coalesce(s.intake_status,'') not in ('review_pending','review_in_progress') or s.ai_result_id is null then
  if not p_allow_unready then raise exception 'Analysis is not ready' using errcode='PT409';end if;
  return jsonb_build_object('kind','analysis_required','processing',coalesce(s.intake_status in ('ocr_processing','ai_processing'),false),
   'session_code',s.session_code,'batch_id',s.batch_id);
 end if;
 -- Hash the complete RLS-visible analysis row, not merely the projected title.
 -- Raw OCR/provider fields never leave this function; any analysis edit makes
 -- an already prepared request stale instead of silently changing its meaning.
 select r.* into a from public.dms_ai_extraction_results r where r.id=s.ai_result_id and r.upload_session_id=s.id;
 if not found then raise exception 'Analysis result unavailable' using errcode='42501';end if;
 if a.document_id is not null or a.ai_status<>'pending_review' or a.review_action is not null then
  raise exception 'Analysis no longer awaits draft review' using errcode='PT409';end if;
 select id,category_id,default_confidentiality,sort_order into t from public.dms_document_types
  where id=a.suggested_document_type_id and is_active and deleted_at is null and category_id is not null;
 if not found then
  select id,category_id,default_confidentiality,sort_order into t from public.dms_document_types
   where is_active and deleted_at is null and category_id is not null order by sort_order,id limit 1;
 end if;
 if t.id is null or not exists(select 1 from public.dms_document_categories where id=t.category_id and is_active and deleted_at is null) then
  raise exception 'Active draft taxonomy unavailable' using errcode='23503';
 end if;
 if coalesce(t.default_confidentiality,'internal') not in ('internal','company','hr','finance','legal','executive')
  or (coalesce(t.default_confidentiality,'internal') not in ('internal','company') and not
   erp_private.permission_in_scope('dms.documents.view.'||t.default_confidentiality,s.owning_company_id,s.owning_branch_id)) then
  raise exception 'Draft confidentiality unavailable' using errcode='42501';
 end if;
 -- The complete ordinary-RLS relationship was checked before analysis.
 title:=nullif(btrim(a.suggested_title),'');
 if title is null then
  title:=left(case when strpos(reverse(coalesce(s.original_filename,'Document')),'.')>0
    and length(coalesce(s.original_filename,'Document'))-strpos(reverse(coalesce(s.original_filename,'Document')),'.')>0
   then left(s.original_filename,length(s.original_filename)-strpos(reverse(s.original_filename),'.'))
   else coalesce(s.original_filename,'Document') end,480);
 end if;
 issue:=erp_private.batch_draft_date(a.issue_date_suggestion::text);expiry:=erp_private.batch_draft_date(a.expiry_date_suggestion::text);
 if length(title)>500 or expiry<issue then raise exception 'Invalid analyzed draft values' using errcode='22023';end if;
 source:=jsonb_build_object('session',to_jsonb(s),'analysis',to_jsonb(a),'type',to_jsonb(t),'batch',batch_source);
 prepared:=jsonb_build_object('upload_session_id',s.id,'session_code',s.session_code,'batch_id',s.batch_id,
  'analysis_result_id',a.id,'owning_company_id',s.owning_company_id,'owning_branch_id',s.owning_branch_id,'party_id',party,
  'document_type_id',t.id,'category_id',t.category_id,'title',coalesce(title,''),'description',a.suggested_description,
  'confidentiality_level',coalesce(t.default_confidentiality,'internal'),'issue_date',issue,'expiry_date',expiry,
  'confidence',a.classification_confidence,'source_fingerprint',encode(sha256(convert_to(source::text,'UTF8')),'hex'));
 return jsonb_build_object('kind','prepared','snapshot',prepared);
end $$;
revoke all on function erp_private.batch_draft_snapshot(bigint,boolean) from public,anon,service_role;
grant execute on function erp_private.batch_draft_snapshot(bigint,boolean) to authenticated;

-- This narrow definer returns nothing; the invoker checks actual caller RLS
-- immediately before and after it, including party visibility. Its caller has
-- already taken session/reference/analysis locks in the established order.
create function erp_private.lock_batch_source_context_rows(p_session bigint)
returns void language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare bid bigint; party bigint; kind text;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active()
  or not public.current_user_has_permission('numbering.rules.generate')
  or not erp_private.upload_session_permission(p_session,'dms.documents.upload') then
  raise exception 'Batch draft permission denied' using errcode='42501';end if;
 select batch_id into bid from public.dms_upload_sessions where id=p_session and deleted_at is null;
 select entity_type,entity_id into kind,party from public.dms_upload_batches
  where id=bid and deleted_at is null and status not in ('cancelled','completed')
   and case when admission_version=1 then erp_private.batch_scope_allowed(created_by,owning_company_id,owning_branch_id)
    else erp_private.batch_legacy_allowed(id) end for share;
 if not found then raise exception 'Batch unavailable' using errcode='42501';end if;
 if kind='party' then
  if not (public.current_user_has_permission('master_data.parties.view')
   or public.current_user_has_permission('master_data.party_master.view') or public.current_user_has_role('system_admin')) then
   raise exception 'Batch context unavailable' using errcode='42501';end if;
  perform 1 from public.parties where id=party and is_active and not is_locked for share;
  if not found then raise exception 'Batch context unavailable' using errcode='42501';end if;
 end if;
end $$;
alter function erp_private.lock_batch_source_context_rows(bigint) owner to postgres;
revoke all on function erp_private.lock_batch_source_context_rows(bigint) from public,anon,service_role;
grant execute on function erp_private.lock_batch_source_context_rows(bigint) to authenticated;

create or replace function erp_private.lock_batch_draft_context(p_session bigint)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if not public.current_user_has_permission('numbering.rules.generate') then raise exception 'Batch draft permission denied' using errcode='42501';end if;
 perform erp_private.batch_draft_relationship(p_session,true);
 perform erp_private.lock_batch_source_context_rows(p_session);
 perform erp_private.batch_draft_relationship(p_session,true);
end $$;
revoke all on function erp_private.lock_batch_draft_context(bigint) from public,anon,service_role;
grant execute on function erp_private.lock_batch_draft_context(bigint) to authenticated;

create or replace function public.create_numbered_dms_batch_draft(p_operation uuid,p_request jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor bigint:=public.current_user_profile_id(); session_id bigint; s record; prepared jsonb; current_snapshot jsonb;
 allocation jsonb; reference text; draft_id bigint; title text; item record; affected integer;
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
 select id,document_id,owning_company_id,owning_branch_id into s from public.dms_upload_sessions
  where id=session_id and deleted_at is null for update;
 if not found or not erp_private.business_principal_is_active()
  or not erp_private.upload_session_permission(session_id,'dms.documents.upload') then
  raise exception 'Upload unavailable' using errcode='42501';end if;
 -- Historical bound sources avoid fresh-work gates; unbound sources must be eligible before allocation.
 perform erp_private.batch_draft_relationship(session_id,s.document_id is null);
 allocation:=public.allocate_numbering_reference(p_operation,null,'MASTER_DMS_DOCUMENT',null,'reserved','dms_documents',null,
  'F06 batch draft creation '||encode(sha256(convert_to(p_request::text,'UTF8')),'hex'));
 reference:=allocation->>'generated_reference_number';
 if not erp_private.business_principal_is_active() or not public.current_user_has_permission('numbering.rules.generate')
  or not erp_private.upload_session_permission(session_id,'dms.documents.upload') then
  raise exception 'Batch draft permission denied' using errcode='42501';end if;
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
 return jsonb_build_object('documentId',draft_id,'documentNo',reference,'status','pending_ai_review','confidence',prepared->'confidence',
  'operation_id',p_operation,'upload_session_id',session_id,'reference_id',(allocation->>'id')::bigint,'replayed',allocation->>'generation_status'='consumed');
end $$;
revoke all on function public.create_numbered_dms_batch_draft(uuid,jsonb) from public,anon,service_role;
grant execute on function public.create_numbered_dms_batch_draft(uuid,jsonb) to authenticated;

-- No table/sequence privilege is broadened by this migration. Existing F03
-- restrictive policies and original grants remain independently testable.
notify pgrst,'reload schema';
commit;
