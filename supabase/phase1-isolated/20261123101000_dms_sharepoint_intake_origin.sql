begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Local isolated contract. The permanent marker is created with the canonical
-- F07 receipt and must survive an unbind, pause or reclaimed lease.
create table erp_private.dms_sharepoint_intake_origins (
  operation_id uuid primary key references erp_private.agent_pdf_work(operation_id),
  upload_session_id bigint not null unique references public.dms_upload_sessions(id),
  connection_id uuid not null,
  item_id text not null,
  source_version text not null,
  owner_id bigint not null,
  company_id bigint not null,
  branch_id bigint,
  filename text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 3145728),
  temp_storage_path text not null unique
);
alter table erp_private.dms_sharepoint_intake_origins enable row level security;
revoke all on erp_private.dms_sharepoint_intake_origins from public, anon, authenticated, service_role, erp_agent_discovery_runtime;

create table erp_private.dms_sharepoint_intake_authority (
  operation_id uuid primary key references erp_private.dms_sharepoint_intake_origins(operation_id),
  lease_token uuid not null,
  auth_session_id uuid not null
);
alter table erp_private.dms_sharepoint_intake_authority enable row level security;
revoke all on erp_private.dms_sharepoint_intake_authority from public, anon, authenticated, service_role, erp_agent_discovery_runtime;

-- The dedicated database runtime has no ERP JWT. Lock the originating actor
-- and explicit scoped role edges by identity on each downstream operation.
create function erp_private.dms_lock_sharepoint_operator(
  p_owner bigint, p_company bigint, p_branch bigint, p_auth_session uuid
) returns void language plpgsql security definer set search_path = ''
as $function$
declare
  capability text;
  granted text[] := '{}'::text[];
begin
  perform 1 from public.user_profiles p
  join auth.users u on u.id = p.auth_user_id
  join auth.sessions s on s.user_id = u.id
  where p.id = p_owner and p.status = 'active' and p.must_change_password is false
    and u.deleted_at is null and (u.banned_until is null or u.banned_until <= clock_timestamp())
    and s.id = p_auth_session and (s.not_after is null or s.not_after > clock_timestamp())
  for share of p,u,s;
  if not found then
    raise exception 'SharePoint operator session unavailable' using errcode = '42501';
  end if;

  for capability in
    select perm.permission_code from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions perm on perm.id = rp.permission_id
    where ur.user_profile_id = p_owner and ur.owner_company_id = p_company
      and ur.branch_id is not distinct from p_branch
      and ur.is_active and r.is_active and perm.is_active
      and perm.permission_code in ('dms.documents.upload','dms.documents.preview','dms.documents.review_ai','dms.admin')
    order by ur.id,r.id,rp.id,perm.id
    for share of ur,r,rp,perm
  loop
    granted := array_append(granted,capability);
  end loop;
  if not ('dms.admin' = any(granted) or
    granted @> array['dms.documents.upload','dms.documents.preview','dms.documents.review_ai']) then
    raise exception 'SharePoint operator scope unavailable' using errcode = '42501';
  end if;
end $function$;
revoke all on function erp_private.dms_lock_sharepoint_operator(bigint,bigint,bigint,uuid)
  from public, anon, authenticated, service_role, erp_agent_discovery_runtime;

-- Call only once work, authority, ERP session and any payload/job locks have
-- been acquired. This closes expiration while a request waits for those locks.
create function erp_private.dms_assert_sharepoint_current(
  p_operation uuid, p_session bigint, p_lease uuid
) returns void language plpgsql security definer set search_path = ''
as $function$
begin
  if not exists (
    select 1 from erp_private.dms_sharepoint_intake_authority a
    join erp_private.dms_sharepoint_intake_origins o using (operation_id)
    join erp_private.agent_pdf_work w using (operation_id)
    join public.dms_upload_sessions d on d.id = o.upload_session_id
    join auth.sessions s on s.id = a.auth_session_id
    where a.operation_id = p_operation and d.id = p_session and a.lease_token = p_lease
      and w.lease_token = p_lease and w.lease_until > clock_timestamp()
      and d.expires_at > clock_timestamp() and (s.not_after is null or s.not_after > clock_timestamp())
  ) then
    raise exception 'SharePoint lease, upload or ERP session expired' using errcode = '42501';
  end if;
end $function$;
revoke all on function erp_private.dms_assert_sharepoint_current(uuid,bigint,uuid)
  from public, anon, authenticated, service_role, erp_agent_discovery_runtime;

-- Keep one canonical admission implementation. The public receipt and the
-- callable private F07 boundary now both enter this wrapper. A legacy receipt
-- may already have issued a bearer URL and must never be adopted as an origin.
alter function erp_private.f07_admit_single_upload_fenced(jsonb,uuid)
  rename to dms_sharepoint_admission_core;
revoke all on function erp_private.dms_sharepoint_admission_core(jsonb,uuid)
  from public, anon, authenticated, service_role, erp_agent_discovery_runtime;

create or replace function erp_private.dms_agent_center_check_sharepoint_admission(
  p_actor bigint, p_operation uuid, p_company bigint, p_branch bigint, p_request jsonb, p_lease uuid
) returns void language plpgsql volatile security invoker set search_path = ''
as $function$
declare
  work erp_private.agent_pdf_work%rowtype;
  metadata jsonb := p_request->'metadata';
begin
  select * into work from erp_private.agent_pdf_work where operation_id = p_operation;
  if p_lease is null then
    if work.operation_id is not null and exists (
      select 1 from erp_private.dms_agent_center_controls c
      where c.company_id = work.company_id and c.branch_id is null and c.agent_key = 'dms.intake' and c.worker_bound
    ) then
      raise exception 'SharePoint admission binding unavailable' using errcode = '42501';
    end if;
    return;
  end if;

  if work.operation_id is null or p_actor is distinct from work.actor_id or p_company is distinct from work.company_id
    or p_branch is not null
    or not (p_request ? 'scope') or p_request->'context' is distinct from 'null'::jsonb
    or not exists (
      select 1 from erp_private.dms_agent_center_controls c
      where c.company_id = p_company and c.branch_id is not distinct from p_branch
        and c.agent_key = 'dms.intake' and c.worker_bound
    ) then
    raise exception 'SharePoint admission binding unavailable' using errcode = '42501';
  end if;

  perform 1 from erp_private.agent_pdf_policy p
  join erp_private.agent_sync_checkpoints s using (connection_id)
  where p.connection_id = work.connection_id and p.company_id = work.company_id and p.actor_id = work.actor_id
    and p.enabled and not s.paused for share of p, s;
  if not found or erp_private.dms_agent_center_lock_for_write(p_company, p_branch, 'dms.intake') is not true then
    raise exception 'SharePoint intake is paused or off' using errcode = '55000';
  end if;

  perform 1 from erp_private.agent_pdf_work w
  join erp_private.agent_source_items i using (connection_id, item_id, version)
  join erp_private.agent_source_versions v using (connection_id, item_id, version)
  where w.operation_id = p_operation and w.connection_id = work.connection_id
    and w.company_id = work.company_id and w.actor_id = work.actor_id and w.status = 'retry'
    and w.lease_token = p_lease and w.lease_until > clock_timestamp()
    and w.sha256 = metadata->>'sha256_hash' and i.available and i.filename = metadata->>'original_filename'
    and v.mime = 'application/pdf' and v.mime = metadata->>'mime_type'
    and v.size_bytes between 1 and 3145728 and v.size_bytes = (metadata->>'file_size_bytes')::bigint
  for share of w, i, v;
  if not found then
    raise exception 'SharePoint admission source unavailable' using errcode = '42501';
  end if;
  perform erp_private.dms_lock_sharepoint_operator(p_actor,p_company,p_branch,
    (auth.jwt()->>'session_id')::uuid);
end $function$;

create function erp_private.f07_admit_single_upload_fenced(p_request jsonb, p_lease uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  operation uuid;
  origin erp_private.dms_sharepoint_intake_origins%rowtype;
  work erp_private.agent_pdf_work%rowtype;
  upload public.dms_upload_sessions%rowtype;
  authority erp_private.dms_sharepoint_intake_authority%rowtype;
  auth_session uuid;
  receipt jsonb;
begin
  -- Let the reviewed F07 core retain validation and error mapping for
  -- malformed requests. Its idempotency lock is held from the precheck
  -- through the permanent origin insert for well-formed operation keys.
  if coalesce(p_request->>'operationId','') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and public.current_user_profile_id() is not null then
    operation := (p_request->>'operationId')::uuid;
    if not pg_try_advisory_xact_lock(hashtextextended(
      'f07-single:' || public.current_user_profile_id()::text || ':' || operation::text, 0
    )) then
      raise exception 'Admission in progress; retry the same request' using errcode = '55P03';
    end if;
    select * into origin from erp_private.dms_sharepoint_intake_origins where operation_id = operation;
    if p_lease is null and origin.operation_id is not null then
      raise exception 'SharePoint upload requires its worker admission' using errcode = '42501';
    end if;
    if p_lease is not null and origin.operation_id is null and exists (
      select 1 from erp_private.f07_single_upload_admissions
      where operation_id = operation and actor_id = public.current_user_profile_id()
    ) then
      raise exception 'An existing ordinary upload cannot become a SharePoint origin' using errcode = '42501';
    end if;
  end if;

  receipt := erp_private.dms_sharepoint_admission_core(p_request,p_lease);
  if p_lease is null then
    if exists (select 1 from erp_private.dms_sharepoint_intake_origins
      where operation_id::text = receipt#>>'{recovery,operationId}') then
      raise exception 'SharePoint upload requires its worker admission' using errcode = '42501';
    end if;
    return receipt;
  end if;

  select * into upload from public.dms_upload_sessions where id = (receipt#>>'{session,id}')::bigint;
  if not found or receipt->>'operationId' is distinct from operation::text then
    raise exception 'Original SharePoint admission unavailable' using errcode = '42501';
  end if;
  if origin.operation_id is not null then
    if origin.upload_session_id is distinct from upload.id then
      raise exception 'Original SharePoint admission unavailable' using errcode = '42501';
    end if;
  else
    select * into strict work from erp_private.agent_pdf_work where operation_id = operation;
    insert into erp_private.dms_sharepoint_intake_origins (
      operation_id, upload_session_id, connection_id, item_id, source_version, owner_id,
      company_id, branch_id, filename, sha256, file_size_bytes, temp_storage_path
    ) values (
      operation, upload.id, work.connection_id, work.item_id, work.version, upload.uploaded_by,
      upload.owning_company_id, upload.owning_branch_id, upload.original_filename,
      upload.sha256_hash, upload.file_size_bytes, upload.temp_storage_path
    );
  end if;

  auth_session := (auth.jwt()->>'session_id')::uuid;
  select * into authority from erp_private.dms_sharepoint_intake_authority where operation_id = operation for update;
  if authority.operation_id is null then
    insert into erp_private.dms_sharepoint_intake_authority(operation_id,lease_token,auth_session_id)
    values(operation,p_lease,auth_session);
  elsif authority.lease_token is distinct from p_lease then
    update erp_private.dms_sharepoint_intake_authority
    set lease_token = p_lease, auth_session_id = auth_session where operation_id = operation;
  elsif authority.auth_session_id is distinct from auth_session then
    raise exception 'A changed ERP session requires a new SharePoint claim' using errcode = '42501';
  end if;
  perform erp_private.dms_assert_sharepoint_current(operation,upload.id,p_lease);
  return receipt;
end $function$;
revoke all on function erp_private.f07_admit_single_upload_fenced(jsonb,uuid)
  from public, anon, authenticated, service_role, erp_agent_discovery_runtime;
alter function erp_private.f07_admit_single_upload(jsonb) security definer;

create function erp_private.dms_admit_sharepoint_upload(p_request jsonb, p_lease uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  receipt jsonb;
begin
  if auth.uid() is null or p_lease is null then
    raise exception 'SharePoint admission binding unavailable' using errcode = '42501';
  end if;
  receipt := erp_private.f07_admit_single_upload_fenced(p_request,p_lease);
  return jsonb_build_object('id',receipt->'session'->'id',
    'operationId',receipt->'operationId','replayed',receipt->'replayed');
end $function$;
revoke all on function erp_private.dms_admit_sharepoint_upload(jsonb,uuid)
  from public, anon, authenticated, service_role, erp_agent_discovery_runtime;
grant execute on function erp_private.dms_admit_sharepoint_upload(jsonb,uuid) to authenticated;

create or replace function public.f07_admit_sharepoint_upload(p_request jsonb, p_lease uuid)
returns jsonb language sql security invoker set search_path = ''
as $function$
  select erp_private.dms_admit_sharepoint_upload($1,$2);
$function$;

-- Policy/control -> current work/source -> session. This order matches the
-- runtime's work-before-session order and is shared by stage and commit.
create function erp_private.dms_lock_sharepoint_intake(p_operation uuid, p_session bigint, p_lease uuid)
returns erp_private.dms_sharepoint_intake_origins
language plpgsql security definer set search_path = ''
as $function$
declare
  origin erp_private.dms_sharepoint_intake_origins%rowtype;
  auth_session uuid;
begin
  select * into origin from erp_private.dms_sharepoint_intake_origins
  where operation_id = p_operation and upload_session_id = p_session;
  if not found or p_lease is null then
    raise exception 'SharePoint origin unavailable' using errcode = '42501';
  end if;

  perform 1 from erp_private.agent_pdf_policy p
  join erp_private.agent_sync_checkpoints s using (connection_id)
  where p.connection_id = origin.connection_id and p.company_id = origin.company_id and p.actor_id = origin.owner_id
    and p.enabled and not s.paused for share of p, s;
  if not found or erp_private.dms_agent_center_lock_for_write(origin.company_id, origin.branch_id, 'dms.intake') is not true then
    raise exception 'SharePoint intake is paused or off' using errcode = '55000';
  end if;

  perform 1 from erp_private.agent_pdf_work w
  join erp_private.agent_source_items i using (connection_id, item_id, version)
  join erp_private.agent_source_versions v using (connection_id, item_id, version)
  where w.operation_id = p_operation and w.connection_id = origin.connection_id and w.item_id = origin.item_id
    and w.version = origin.source_version and w.company_id = origin.company_id and w.actor_id = origin.owner_id
    and w.status = 'retry' and w.lease_token = p_lease and w.lease_until > clock_timestamp()
    and w.sha256 = origin.sha256 and i.available and i.filename = origin.filename
    and v.mime = 'application/pdf' and v.size_bytes = origin.file_size_bytes
  for update of w for share of i, v;
  if not found then
    raise exception 'SharePoint lease or source unavailable' using errcode = '42501';
  end if;

  perform 1 from public.dms_upload_sessions s
  where s.id = p_session and s.uploaded_by = origin.owner_id
    and s.owning_company_id = origin.company_id and s.owning_branch_id is not distinct from origin.branch_id
    and s.original_filename = origin.filename and s.mime_type = 'application/pdf'
    and s.sha256_hash = origin.sha256 and s.file_size_bytes = origin.file_size_bytes
    and s.temp_storage_path = origin.temp_storage_path
    and s.status = 'uploading' and s.intake_status in ('uploaded','uploading') and s.expires_at > clock_timestamp()
    and s.document_id is null and s.ai_result_id is null and s.deleted_at is null and s.temp_cleaned_at is null
  for update of s;
  if not found then
    raise exception 'SharePoint intake source unavailable' using errcode = '42501';
  end if;

  select auth_session_id into auth_session from erp_private.dms_sharepoint_intake_authority
  where operation_id = p_operation and lease_token = p_lease for share;
  if auth_session is null then
    raise exception 'SharePoint generation requires its ERP admission' using errcode = '42501';
  end if;
  perform erp_private.dms_lock_sharepoint_operator(origin.owner_id,origin.company_id,origin.branch_id,auth_session);
  return origin;
end $function$;
revoke all on function erp_private.dms_lock_sharepoint_intake(uuid,bigint,uuid)
  from public, anon, authenticated, service_role, erp_agent_discovery_runtime;

notify pgrst, 'reload schema';
commit;
