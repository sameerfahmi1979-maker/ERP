-- Extend the existing F06 admission/recovery engine; Party/null canonical bytes,
-- original operation identities, numbering reservations and history stay intact.
-- No historical context inference, new allocator or permission bypass.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';

CREATE FUNCTION erp_private.f07_batch_subject_matches(p_company bigint,p_branch bigint,p_type text,p_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE scope record;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() OR
  p_type NOT IN ('employee','employee_dependent','company','branch','site') THEN RETURN false; END IF;
 SELECT * INTO scope FROM erp_private.f07_upload_origin_scope(p_type,p_id);
 RETURN ROW(scope.company,scope.branch) IS NOT DISTINCT FROM ROW(p_company,p_branch);
EXCEPTION WHEN SQLSTATE '42501' OR SQLSTATE '22023' OR SQLSTATE 'PT409' THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_batch_subject_matches(bigint,bigint,text,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_batch_subject_matches(bigint,bigint,text,bigint) TO authenticated;
CREATE OR REPLACE FUNCTION erp_private.f07_lock_batch_admission_authority(p_context jsonb)
 RETURNS TABLE(actor bigint, company bigint, branch bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
declare uid uuid:=auth.uid(); sid text:=auth.jwt()->>'session_id'; locked_row record; witnesses jsonb; dms_allowed boolean; party_allowed boolean; hr_allowed boolean; needs_party boolean:=coalesce(p_context->>'type'='party',false); target_scope record;
begin
 if uid is null or current_setting('transaction_isolation')<>'read committed' then raise exception 'Batch permission denied' using errcode='42501';end if;
 perform 1 from auth.users where id=uid for share;
 perform 1 from auth.sessions where user_id=uid and id::text=sid for share;
 select id,owner_company_id,branch_id into actor,company,branch from public.user_profiles where auth_user_id=uid for share;
 if actor is null then raise exception 'Batch permission denied' using errcode='42501';end if;
 if p_context->>'type' in ('employee','employee_dependent','company','branch','site') then
  select * into target_scope from erp_private.f07_upload_origin_scope(p_context->>'type',(p_context->>'id')::bigint);
  company:=target_scope.company;branch:=target_scope.branch;
 end if;
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
 for locked_row in select distinct (value->>'assignment')::bigint id from jsonb_array_elements(witnesses) order by id loop
  perform 1 from public.user_roles where id=locked_row.id for share;
 end loop;
 for locked_row in select distinct (value->>'role')::bigint id from jsonb_array_elements(witnesses) order by id loop
  perform 1 from public.roles where id=locked_row.id for share;
 end loop;
 for locked_row in select distinct (value->>'pair')::bigint id from jsonb_array_elements(witnesses) where value->>'pair' is not null order by id loop
  perform 1 from public.role_permissions where id=locked_row.id for share;
 end loop;
 for locked_row in select distinct (value->>'permission')::bigint id from jsonb_array_elements(witnesses) where value->>'permission' is not null order by id loop
  perform 1 from public.permissions where id=locked_row.id for share;
 end loop;
 -- A second statement after every possible wait rebinds the locked self tuple.
 select p.id,p.owner_company_id,p.branch_id into actor,company,branch from public.user_profiles p where p.auth_user_id=uid;
 if p_context->>'type' in ('employee','employee_dependent','company','branch','site') then
  select * into target_scope from erp_private.f07_upload_origin_scope(p_context->>'type',(p_context->>'id')::bigint);
  company:=target_scope.company;branch:=target_scope.branch;
 end if;
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
, coalesce(bool_or(
   (r.role_code in ('system_admin','group_admin') and ur.owner_company_id is null and ur.branch_id is null)
   or (p.is_active and p.permission_code in ('hr.employees.update','hr.employee_profile.manage')
    and ((ur.owner_company_id is null and ur.branch_id is null) or (ur.owner_company_id=company and (ur.branch_id is null or ur.branch_id=branch))))),false)
 into dms_allowed,party_allowed,hr_allowed
 from jsonb_array_elements(witnesses) w
 join public.user_roles ur on ur.id=(w.value->>'assignment')::bigint and ur.user_profile_id=actor and ur.is_active
 join public.roles r on r.id=(w.value->>'role')::bigint and ur.role_id=r.id and r.is_active
 left join public.role_permissions rp on rp.id=(w.value->>'pair')::bigint and rp.role_id=r.id
 left join public.permissions p on p.id=(w.value->>'permission')::bigint and rp.permission_id=p.id;
 if p_context->>'type'='site' and not exists(
  select 1 from jsonb_array_elements(witnesses) w
  join public.user_roles ur on ur.id=(w.value->>'assignment')::bigint and ur.user_profile_id=actor and ur.is_active and ur.owner_company_id is null and ur.branch_id is null
  join public.roles r on r.id=(w.value->>'role')::bigint and ur.role_id=r.id and r.is_active
  left join public.role_permissions rp on rp.id=(w.value->>'pair')::bigint and rp.role_id=r.id
  left join public.permissions p on p.id=(w.value->>'permission')::bigint and rp.permission_id=p.id
  where r.role_code in ('system_admin','group_admin') or (p.is_active and p.permission_code in ('common_md.view','common_md.work_sites.view'))
 ) then raise exception 'Work site permission denied' using errcode='42501';end if;
 if actor is null or not erp_private.business_principal_is_active() or not dms_allowed or (needs_party and not party_allowed) or (p_context->>'type' in ('employee','employee_dependent') and not hr_allowed) then
  raise exception 'Batch permission denied' using errcode='42501';end if;
 return next;
end $function$;
REVOKE ALL ON FUNCTION erp_private.f07_lock_batch_admission_authority(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_lock_batch_admission_authority(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION erp_private.batch_manifest_bytes(v jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare f jsonb; pos integer:=0; name text; mime text; ext text; expected text; result text; context text; cp integer; ch text;
begin
 if v is null or jsonb_typeof(v) is distinct from 'object' or not(v ?& array['version','context','files'])
  or v-array['version','context','files']<>'{}'::jsonb or v->'version' is distinct from '1'::jsonb
  or jsonb_typeof(v->'files') is distinct from 'array' or octet_length(convert_to(v::text,'UTF8'))>262144 then
  raise exception 'Invalid batch manifest' using errcode='22023';end if;
 if jsonb_array_length(v->'files') not between 1 and 10 then raise exception 'Invalid file count' using errcode='22023';end if;
 if v->'context'='null'::jsonb then context:='null';
 elsif jsonb_typeof(v->'context')='object' and (v->'context')-array['type','id']='{}'::jsonb
  and v->'context'->>'type' in ('party','employee','employee_dependent','company','branch','site') and erp_private.batch_integer(v->'context'->'id',1,9007199254740991) then
  context:='['||to_json(v#>>'{context,type}')::text||','||((v->'context'->>'id')::numeric)::bigint::text||']';
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
end $function$;

CREATE OR REPLACE FUNCTION erp_private.batch_fresh_context(company bigint, branch bigint, context jsonb, locking boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
begin
 if auth.uid() is null or not erp_private.batch_scope_allowed(public.current_user_profile_id(),company,branch) then return false;end if;
 if company is not null then
  if locking then perform 1 from public.owner_companies where id=company for share;end if;
  if not exists(select 1 from public.owner_companies where id=company and status='active') then return false;end if;
 end if;
 if branch is not null then
  if company is null then return false;end if;
  if locking then perform 1 from public.branches where id=branch for share;end if;
  if not exists(select 1 from public.branches where id=branch and owner_company_id=company and status='active') then return false;end if;
 end if;
 if locking then perform 1 from public.erp_ai_feature_flags where feature_code='DMS_BATCH_INTAKE' for share;end if;
 if not exists(select 1 from public.erp_ai_feature_flags where feature_code='DMS_BATCH_INTAKE' and is_enabled) then return false;end if;
 if context is distinct from 'null'::jsonb then
  if context->>'type' in ('employee','employee_dependent','company','branch','site') then
   return erp_private.f07_batch_subject_matches(company,branch,context->>'type',(context->>'id')::bigint);
  end if;
  if context->>'type' is distinct from 'party' or not erp_private.batch_integer(context->'id',1,9007199254740991) then return false;end if;
  -- Match the existing party read-policy capabilities before this narrow
  -- definer reads/locks a party. Invoker callers also verify actual row RLS.
  if not (public.current_user_has_permission('master_data.parties.view')
   or public.current_user_has_permission('master_data.party_master.view') or public.current_user_has_role('system_admin')) then return false;end if;
  if locking then perform 1 from public.parties where id=(context->>'id')::numeric::bigint for share;end if;
  if not exists(select 1 from public.parties where id=(context->>'id')::numeric::bigint and is_active and not is_locked) then return false;end if;
 end if;
 return erp_private.business_principal_is_active() and erp_private.batch_scope_allowed(public.current_user_profile_id(),company,branch);
end $function$;

CREATE OR REPLACE FUNCTION public.admit_dms_upload_batch(p_operation uuid, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
 SET lock_timeout TO '5s'
 SET statement_timeout TO '20s'
AS $function$
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
 select * into a from erp_private.f07_lock_batch_admission_authority(manifest->'context');
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
end $function$;

CREATE OR REPLACE FUNCTION erp_private.batch_identity_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  select * into a from erp_private.f07_lock_batch_admission_authority(new.admission_manifest->'context');
  if new.created_by is distinct from a.actor or new.admission_auth_user_id is distinct from auth.uid()
   or new.owning_company_id is distinct from a.company or new.owning_branch_id is distinct from a.branch then raise exception 'Admission origin mismatch' using errcode='42501';end if;
  if new.admission_manifest#>>'{context,type}'='party' and not exists
   (select 1 from public.parties where id=(new.admission_manifest#>>'{context,id}')::numeric::bigint and is_active and not is_locked) then
   raise exception 'Batch context unavailable' using errcode='42501';end if;
  if new.admission_fingerprint is distinct from encode(sha256(convert_to(erp_private.batch_manifest_bytes(new.admission_manifest),'UTF8')),'hex')
   or new.total_files is distinct from jsonb_array_length(new.admission_manifest->'files')
   or new.entity_type is distinct from new.admission_manifest->'context'->>'type'
   or new.entity_id is distinct from (new.admission_manifest->'context'->>'id')::numeric::bigint
   or not erp_private.batch_fresh_context(a.company,a.branch,new.admission_manifest->'context',true) then raise exception 'Invalid admission graph' using errcode='23514';end if;
  if new.admission_manifest#>>'{context,type}'='party' and not exists
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
end $function$;

CREATE OR REPLACE FUNCTION erp_private.batch_source(p_batch bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
 if ((b.entity_type is null and b.entity_id is null) or (b.entity_type='party' and b.entity_id between 1 and 9007199254740991) or (b.admission_version=1 and b.entity_type in ('employee','employee_dependent','company','branch','site') and b.entity_id between 1 and 9007199254740991)) is not true then
  raise exception 'Invalid batch context' using errcode='PT409';end if;
 if b.admission_version=1 then
  if b.total_files<>jsonb_array_length(b.admission_manifest->'files')
   or b.admission_fingerprint is distinct from encode(sha256(convert_to(erp_private.batch_manifest_bytes(b.admission_manifest),'UTF8')),'hex')
   or b.entity_type is distinct from b.admission_manifest#>>'{context,type}'
   or b.entity_id is distinct from (b.admission_manifest#>>'{context,id}')::numeric::bigint then
   raise exception 'Invalid admission anchor' using errcode='PT409';end if;
 end if;
 return jsonb_build_object('id',b.id,'code',b.batch_code,'creator',b.created_by,'company',company,'branch',branch,
  'entity_type',b.entity_type,'entity_id',b.entity_id,'version',b.admission_version,'auth',b.admission_auth_user_id,
  'operation',b.admission_operation_id,'manifest',b.admission_manifest,'fingerprint',b.admission_fingerprint,'members',members);
end $function$;

CREATE OR REPLACE FUNCTION erp_private.lock_batch_source_context_rows(p_session bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
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
 elsif kind in ('employee','employee_dependent','company','branch','site') then
  perform * from erp_private.f07_upload_origin_scope(kind,party);
 end if;
end $function$;

CREATE OR REPLACE FUNCTION public.read_dms_batch_draft_recovery(p_admission_operation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
 left join lateral (
  select prepared.* from erp_private.dms_batch_draft_preparations prepared
  where prepared.upload_session_id=s.id offset 0
 ) p on true
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
     or sealed#>'{request_json,prepared,party_id}' is distinct from (case when receipt#>>'{manifest,context,type}'='party' then coalesce(receipt#>'{manifest,context,id}','null'::jsonb) else 'null'::jsonb end) then
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
end $function$;

CREATE OR REPLACE FUNCTION erp_private.protect_upload_intake_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor bigint:=public.current_user_profile_id(); b public.dms_upload_batches;
BEGIN
 IF TG_OP='INSERT' THEN
  IF auth.uid() IS NOT NULL AND NEW.uploaded_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Upload identity must match current actor' USING ERRCODE='42501'; END IF;
  IF NEW.origin_entity_type IS NOT NULL OR NEW.origin_entity_id IS NOT NULL THEN
   IF NEW.batch_id IS NOT NULL THEN RAISE EXCEPTION 'Batch context uses its existing admission contract' USING ERRCODE='22023'; END IF;
   SELECT company,branch INTO NEW.owning_company_id,NEW.owning_branch_id FROM erp_private.f07_upload_origin_scope(NEW.origin_entity_type,NEW.origin_entity_id);
  ELSIF NEW.batch_id IS NOT NULL THEN
   SELECT * INTO b FROM public.dms_upload_batches WHERE id=NEW.batch_id;
   IF b.admission_version=1 AND b.entity_type IN ('employee','employee_dependent','company','branch','site') THEN
    IF b.created_by IS DISTINCT FROM actor OR b.admission_auth_user_id IS DISTINCT FROM auth.uid() THEN
     RAISE EXCEPTION 'Batch upload owner differs' USING ERRCODE='42501';END IF;
    SELECT company,branch INTO NEW.owning_company_id,NEW.owning_branch_id FROM erp_private.f07_upload_origin_scope(b.entity_type,b.entity_id);
    IF ROW(NEW.owning_company_id,NEW.owning_branch_id) IS DISTINCT FROM ROW(b.owning_company_id,b.owning_branch_id) THEN
     RAISE EXCEPTION 'Batch subject scope changed' USING ERRCODE='PT409';END IF;
   ELSE SELECT owner_company_id,branch_id INTO NEW.owning_company_id,NEW.owning_branch_id FROM public.user_profiles WHERE id=NEW.uploaded_by;END IF;
  ELSE SELECT owner_company_id,branch_id INTO NEW.owning_company_id,NEW.owning_branch_id FROM public.user_profiles WHERE id=NEW.uploaded_by;
  END IF;
 ELSE
  IF ROW(NEW.origin_entity_type,NEW.origin_entity_id) IS DISTINCT FROM ROW(OLD.origin_entity_type,OLD.origin_entity_id) THEN
   RAISE EXCEPTION 'Upload origin is immutable; no historical origin is inferred' USING ERRCODE='42501'; END IF;
  IF auth.uid() IS NOT NULL THEN
   IF ROW(NEW.uploaded_by,NEW.owning_company_id,NEW.owning_branch_id,NEW.session_code,NEW.temp_storage_path)
    IS DISTINCT FROM ROW(OLD.uploaded_by,OLD.owning_company_id,OLD.owning_branch_id,OLD.session_code,OLD.temp_storage_path) THEN
    RAISE EXCEPTION 'Upload identity, scope and storage binding are immutable' USING ERRCODE='42501'; END IF;
   IF OLD.document_id IS NOT NULL AND NEW.document_id IS DISTINCT FROM OLD.document_id THEN RAISE EXCEPTION 'Completed upload document binding is immutable' USING ERRCODE='42501'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION erp_private.f07_link_upload_origin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE s public.dms_upload_sessions; d public.dms_documents; scope record; b public.dms_upload_batches; origin_type text:=NEW.origin_entity_type; origin_id bigint:=NEW.origin_entity_id;
BEGIN
 IF NEW.document_id IS NULL OR OLD.document_id IS NOT NULL THEN RETURN NEW; END IF;
 IF origin_type IS NULL AND NEW.batch_id IS NOT NULL THEN
  SELECT * INTO b FROM public.dms_upload_batches WHERE id=NEW.batch_id;
  IF b.admission_version=1 AND b.entity_type IN ('employee','employee_dependent','company','branch','site') THEN
   origin_type:=b.entity_type;origin_id:=b.entity_id;
  END IF;
 END IF;
 IF origin_type IS NULL THEN RETURN NEW;END IF;
 SELECT * INTO s FROM public.dms_upload_sessions WHERE id=NEW.id;
 IF s.document_id IS DISTINCT FROM NEW.document_id OR s.origin_entity_type IS DISTINCT FROM NEW.origin_entity_type OR s.origin_entity_id IS DISTINCT FROM NEW.origin_entity_id THEN
  RAISE EXCEPTION 'Upload binding changed' USING ERRCODE='PT409'; END IF;
 SELECT * INTO scope FROM erp_private.f07_upload_origin_scope(origin_type,origin_id);
 SELECT * INTO d FROM public.dms_documents WHERE id=s.document_id AND deleted_at IS NULL;
 IF d.id IS NULL OR ROW(d.owning_company_id,d.owning_branch_id) IS DISTINCT FROM ROW(scope.company,scope.branch) OR
  ROW(s.owning_company_id,s.owning_branch_id) IS DISTINCT FROM ROW(scope.company,scope.branch) OR
  NOT (erp_private.document_permission(d.id,'dms.documents.edit') OR erp_private.document_permission(d.id,'dms.admin')) THEN
  RAISE EXCEPTION 'Upload destination no longer matches its subject' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dms_document_links WHERE document_id=d.id AND entity_type=origin_type AND entity_id=origin_id AND deleted_at IS NULL) THEN
  IF EXISTS(SELECT 1 FROM erp_private.f07_attachment_intents WHERE upload_session_id=s.id) THEN
   RAISE EXCEPTION 'An existing-document attachment must already match the original upload subject' USING ERRCODE='42501'; END IF;
  INSERT INTO public.dms_document_links(document_id,entity_type,entity_id,is_primary,linked_by) VALUES(d.id,origin_type,origin_id,true,public.current_user_profile_id());
  INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by,metadata_json)
   VALUES(d.id,'upload_origin_linked','Original upload subject retained',public.current_user_profile_id(),jsonb_build_object('upload_session_id',s.id,'entity_type',origin_type,'entity_id',origin_id));
 END IF;
 RETURN NEW;
END $function$;

ALTER POLICY f06_batch_preparation_insert ON erp_private.dms_batch_draft_preparations WITH CHECK (((current_setting('transaction_isolation'::text) = 'read committed'::text) AND (auth_user_id = auth.uid()) AND (profile_id = current_user_profile_id()) AND erp_private.business_principal_is_active() AND current_user_has_permission('numbering.rules.generate'::text) AND erp_private.upload_session_permission(upload_session_id, 'dms.documents.upload'::text) AND (EXISTS ( SELECT 1
   FROM (dms_upload_sessions s
     JOIN dms_upload_batches b ON ((b.id = s.batch_id)))
  WHERE ((s.id = dms_batch_draft_preparations.upload_session_id) AND (s.deleted_at IS NULL) AND (s.batch_draft_operation_id = dms_batch_draft_preparations.draft_operation_id) AND (s.uploaded_by = dms_batch_draft_preparations.profile_id) AND (s.batch_id = dms_batch_draft_preparations.batch_id) AND (s.admission_position = dms_batch_draft_preparations.admission_position) AND (b.admission_version = 1) AND (b.deleted_at IS NULL) AND (b.created_by = dms_batch_draft_preparations.profile_id) AND (b.admission_auth_user_id = dms_batch_draft_preparations.auth_user_id) AND (b.admission_operation_id = dms_batch_draft_preparations.admission_operation_id) AND (b.admission_fingerprint = dms_batch_draft_preparations.admission_fingerprint) AND (NOT (s.owning_company_id IS DISTINCT FROM b.owning_company_id)) AND (NOT (s.owning_branch_id IS DISTINCT FROM b.owning_branch_id)) AND ((dms_batch_draft_preparations.request_json #> '{prepared,owning_company_id}'::text[]) = COALESCE(to_jsonb(s.owning_company_id), 'null'::jsonb)) AND ((dms_batch_draft_preparations.request_json #> '{prepared,owning_branch_id}'::text[]) = COALESCE(to_jsonb(s.owning_branch_id), 'null'::jsonb)) AND ((dms_batch_draft_preparations.request_json #>> '{prepared,session_code}'::text[]) = s.session_code) AND ((dms_batch_draft_preparations.request_json #> '{prepared,party_id}'::text[]) = COALESCE(to_jsonb(CASE WHEN b.entity_type='party' THEN b.entity_id ELSE NULL::bigint END), 'null'::jsonb)) AND ((b.entity_id IS NULL) OR erp_private.f07_batch_subject_matches(b.owning_company_id,b.owning_branch_id,b.entity_type,b.entity_id) OR ((b.entity_type = 'party'::text) AND (EXISTS ( SELECT 1
           FROM parties p
          WHERE (p.id = b.entity_id))))) AND (erp_private.permission_in_scope('dms.documents.view'::text, s.owning_company_id, s.owning_branch_id) OR erp_private.permission_in_scope('dms.admin'::text, s.owning_company_id, s.owning_branch_id)) AND (((dms_batch_draft_preparations.request_json #>> '{prepared,confidentiality_level}'::text[]) = ANY (ARRAY['internal'::text, 'company'::text])) OR (((dms_batch_draft_preparations.request_json #>> '{prepared,confidentiality_level}'::text[]) = ANY (ARRAY['hr'::text, 'finance'::text, 'legal'::text, 'executive'::text])) AND erp_private.permission_in_scope(('dms.documents.view.'::text || (dms_batch_draft_preparations.request_json #>> '{prepared,confidentiality_level}'::text[])), s.owning_company_id, s.owning_branch_id))) AND ((s.document_id IS NULL) OR f03_has_document_permission(s.document_id, 'dms.documents.view'::text)) AND (EXISTS ( SELECT 1
           FROM dms_ai_extraction_results a
          WHERE ((a.id = s.ai_result_id) AND (a.id = ((dms_batch_draft_preparations.request_json #>> '{prepared,analysis_result_id}'::text[]))::bigint) AND (a.upload_session_id = s.id) AND (NOT (a.document_id IS DISTINCT FROM s.document_id))))))))));

ALTER POLICY f06_batch_preparation_select ON erp_private.dms_batch_draft_preparations USING (((current_setting('transaction_isolation'::text) = 'read committed'::text) AND (auth_user_id = auth.uid()) AND (profile_id = current_user_profile_id()) AND erp_private.business_principal_is_active() AND current_user_has_permission('numbering.rules.generate'::text) AND erp_private.upload_session_permission(upload_session_id, 'dms.documents.upload'::text) AND (EXISTS ( SELECT 1
   FROM (dms_upload_sessions s
     JOIN dms_upload_batches b ON ((b.id = s.batch_id)))
  WHERE ((s.id = dms_batch_draft_preparations.upload_session_id) AND (s.deleted_at IS NULL) AND (s.batch_draft_operation_id = dms_batch_draft_preparations.draft_operation_id) AND (s.uploaded_by = dms_batch_draft_preparations.profile_id) AND (s.batch_id = dms_batch_draft_preparations.batch_id) AND (s.admission_position = dms_batch_draft_preparations.admission_position) AND (b.admission_version = 1) AND (b.deleted_at IS NULL) AND (b.created_by = dms_batch_draft_preparations.profile_id) AND (b.admission_auth_user_id = dms_batch_draft_preparations.auth_user_id) AND (b.admission_operation_id = dms_batch_draft_preparations.admission_operation_id) AND (b.admission_fingerprint = dms_batch_draft_preparations.admission_fingerprint) AND (NOT (s.owning_company_id IS DISTINCT FROM b.owning_company_id)) AND (NOT (s.owning_branch_id IS DISTINCT FROM b.owning_branch_id)) AND ((dms_batch_draft_preparations.request_json #> '{prepared,owning_company_id}'::text[]) = COALESCE(to_jsonb(s.owning_company_id), 'null'::jsonb)) AND ((dms_batch_draft_preparations.request_json #> '{prepared,owning_branch_id}'::text[]) = COALESCE(to_jsonb(s.owning_branch_id), 'null'::jsonb)) AND ((dms_batch_draft_preparations.request_json #>> '{prepared,session_code}'::text[]) = s.session_code) AND ((dms_batch_draft_preparations.request_json #> '{prepared,party_id}'::text[]) = COALESCE(to_jsonb(CASE WHEN b.entity_type='party' THEN b.entity_id ELSE NULL::bigint END), 'null'::jsonb)) AND ((b.entity_id IS NULL) OR erp_private.f07_batch_subject_matches(b.owning_company_id,b.owning_branch_id,b.entity_type,b.entity_id) OR ((b.entity_type = 'party'::text) AND (EXISTS ( SELECT 1
           FROM parties p
          WHERE (p.id = b.entity_id))))) AND (erp_private.permission_in_scope('dms.documents.view'::text, s.owning_company_id, s.owning_branch_id) OR erp_private.permission_in_scope('dms.admin'::text, s.owning_company_id, s.owning_branch_id)) AND (((dms_batch_draft_preparations.request_json #>> '{prepared,confidentiality_level}'::text[]) = ANY (ARRAY['internal'::text, 'company'::text])) OR (((dms_batch_draft_preparations.request_json #>> '{prepared,confidentiality_level}'::text[]) = ANY (ARRAY['hr'::text, 'finance'::text, 'legal'::text, 'executive'::text])) AND erp_private.permission_in_scope(('dms.documents.view.'::text || (dms_batch_draft_preparations.request_json #>> '{prepared,confidentiality_level}'::text[])), s.owning_company_id, s.owning_branch_id))) AND ((s.document_id IS NULL) OR f03_has_document_permission(s.document_id, 'dms.documents.view'::text)) AND (EXISTS ( SELECT 1
           FROM dms_ai_extraction_results a
          WHERE ((a.id = s.ai_result_id) AND (a.id = ((dms_batch_draft_preparations.request_json #>> '{prepared,analysis_result_id}'::text[]))::bigint) AND (a.upload_session_id = s.id) AND (NOT (a.document_id IS DISTINCT FROM s.document_id))))))))));

NOTIFY pgrst,'reload schema';
COMMIT;
