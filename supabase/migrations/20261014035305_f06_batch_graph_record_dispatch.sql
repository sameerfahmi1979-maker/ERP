begin;

-- Shared constraint trigger: headers have id, members have batch_id. Separate
-- PL/pgSQL expressions avoid resolving a member-only field on a header record.
-- All existing graph checks, deferral, ownership and access boundaries remain.
create or replace function erp_private.batch_graph_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare bid bigint; b public.dms_upload_batches%rowtype; s record; expected jsonb;
begin
 if tg_table_name='dms_upload_batches' then
  bid:=new.id;
 else
  bid:=new.batch_id;
 end if;
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

commit;
