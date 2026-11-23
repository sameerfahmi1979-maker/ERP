begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- This isolated lane commits bounded bytes in the same PostgreSQL transaction
-- as the current lease check. It does not write to Supabase Storage.
create table erp_private.dms_sharepoint_intake_payloads (
  operation_id uuid primary key references erp_private.dms_sharepoint_intake_origins (operation_id),
  upload_session_id bigint not null unique references public.dms_upload_sessions (id),
  lease_token uuid not null,
  byte_count bigint not null check (byte_count between 1 and 3145728),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  payload bytea not null check (octet_length(payload) = byte_count),
  staged_at timestamptz not null
);
alter table erp_private.dms_sharepoint_intake_payloads enable row level security;
revoke all on erp_private.dms_sharepoint_intake_payloads
  from public, anon, authenticated, service_role, erp_agent_discovery_runtime;

create function erp_private.f07_stage_sharepoint_upload(
  p_operation uuid, p_session bigint, p_lease uuid, p_payload bytea
) returns jsonb language plpgsql volatile security definer set search_path = ''
as $function$
declare
  origin erp_private.dms_sharepoint_intake_origins;
  prior erp_private.dms_sharepoint_intake_payloads;
  payload_size bigint := octet_length(p_payload);
  payload_hash text;
  replayed boolean := false;
begin
  if auth.uid() is null or erp_private.business_principal_is_active() is not true
    or p_operation is null or p_session is null or p_lease is null then
    raise exception 'SharePoint upload authority unavailable' using errcode = '42501';
  end if;
  if payload_size is null or payload_size not between 1 and 3145728
    or position(pg_catalog.decode('255044462d', 'hex') in substring(p_payload for 1024)) = 0 then
    raise exception 'SharePoint upload must be an approved PDF within the transfer limit' using errcode = '22023';
  end if;
  payload_hash := pg_catalog.encode(pg_catalog.sha256(p_payload), 'hex');

  origin := erp_private.dms_lock_sharepoint_intake(p_operation, p_session, p_lease);
  if origin.operation_id is null or public.current_user_profile_id() is distinct from origin.owner_id
    or (erp_private.permission_in_scope('dms.documents.upload', origin.company_id, origin.branch_id)
      or erp_private.permission_in_scope('dms.admin', origin.company_id, origin.branch_id)) is not true
    or not exists (
      select 1 from erp_private.dms_sharepoint_intake_authority a
      where a.operation_id = p_operation and a.lease_token = p_lease
        and a.auth_session_id::text = auth.jwt()->>'session_id'
    ) then
    raise exception 'SharePoint upload authority unavailable' using errcode = '42501';
  end if;
  if row(payload_size, payload_hash) is distinct from row(origin.file_size_bytes, origin.sha256) then
    raise exception 'SharePoint upload bytes differ from the approved source' using errcode = '22023';
  end if;

  select * into prior from erp_private.dms_sharepoint_intake_payloads
  where operation_id = p_operation for update;
  if found and row(prior.upload_session_id, prior.byte_count, prior.sha256, prior.payload)
    is distinct from row(p_session, payload_size, payload_hash, p_payload) then
    raise exception 'SharePoint upload differs from the retained payload' using errcode = 'PT409';
  end if;
  -- All identity and control rows are still locked. Recheck the current lease,
  -- upload and ERP session after any wait on the payload lock.
  perform erp_private.dms_assert_sharepoint_current(p_operation, p_session, p_lease);

  if prior.operation_id is null then
    insert into erp_private.dms_sharepoint_intake_payloads
      (operation_id, upload_session_id, lease_token, byte_count, sha256, payload, staged_at)
    values (p_operation, p_session, p_lease, payload_size, payload_hash, p_payload, clock_timestamp());
  elsif prior.lease_token = p_lease then
    replayed := true;
  else
    update erp_private.dms_sharepoint_intake_payloads
    set lease_token = p_lease, staged_at = clock_timestamp()
    where operation_id = p_operation;
  end if;

  return jsonb_build_object('operationId', p_operation, 'sessionId', p_session,
    'sha256', payload_hash, 'byteCount', payload_size, 'replayed', replayed);
end $function$;

create function public.f07_stage_sharepoint_upload(
  p_operation uuid, p_session bigint, p_lease uuid, p_payload bytea
) returns jsonb language sql volatile security invoker set search_path = ''
as $function$
  select erp_private.f07_stage_sharepoint_upload($1, $2, $3, $4);
$function$;

revoke all on function erp_private.f07_stage_sharepoint_upload(uuid,bigint,uuid,bytea),
  public.f07_stage_sharepoint_upload(uuid,bigint,uuid,bytea)
  from public, anon, authenticated, service_role, erp_agent_discovery_runtime;
grant execute on function erp_private.f07_stage_sharepoint_upload(uuid,bigint,uuid,bytea),
  public.f07_stage_sharepoint_upload(uuid,bigint,uuid,bytea) to authenticated;

-- The reserved path remains denied when the control is paused, removed or
-- unbound. Standard Storage signing and writes retain their legacy policy for
-- all other paths. The service/signed Storage role bypasses RLS, so the
-- immutable-origin admission fence must also prevent issuing such a token.
create function erp_private.dms_sharepoint_storage_path_reserved(p_path text)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select exists (select 1 from erp_private.dms_sharepoint_intake_origins where temp_storage_path = p_path);
$function$;
revoke all on function erp_private.dms_sharepoint_storage_path_reserved(text)
  from public, anon, authenticated, service_role, erp_agent_discovery_runtime;
grant execute on function erp_private.dms_sharepoint_storage_path_reserved(text) to anon, authenticated;

create policy dms_sharepoint_storage_path_denied on storage.objects as restrictive for all to anon, authenticated
  using (bucket_id <> 'dms-temp' or not erp_private.dms_sharepoint_storage_path_reserved(name))
  with check (bucket_id <> 'dms-temp' or not erp_private.dms_sharepoint_storage_path_reserved(name));

create or replace function erp_private.f07_single_transfer_resumable(p_session bigint)
returns boolean language sql security definer set search_path = ''
as $function$
  select auth.uid() is not null and erp_private.business_principal_is_active()
    and exists (
      select 1 from erp_private.f07_single_upload_admissions a
      where a.upload_session_id = p_session and a.actor_id = public.current_user_profile_id()
    )
    and not exists (
      select 1 from erp_private.dms_sharepoint_intake_origins where upload_session_id = p_session
    )
    and (erp_private.upload_session_permission(p_session, 'dms.documents.upload')
      or erp_private.upload_session_permission(p_session, 'dms.admin'));
$function$;
revoke all on function erp_private.f07_single_transfer_resumable(bigint)
  from public, anon, authenticated, service_role, erp_agent_discovery_runtime;
grant execute on function erp_private.f07_single_transfer_resumable(bigint) to authenticated;

notify pgrst, 'reload schema';
commit;
