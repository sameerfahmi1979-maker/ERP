begin;

-- A legacy NULL admission version must not evaluate modern canonicalization.
-- Preserve ordinary RLS, member validation, scope and modern anchor checks.
create or replace function erp_private.batch_source(p_batch bigint)
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
end $$;
revoke all on function erp_private.batch_source(bigint) from public,anon,service_role;
grant execute on function erp_private.batch_source(bigint) to authenticated;

commit;
