begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- This isolated queue cannot create a hosted result, activate a provider,
-- attach a document, or deliver review. It proves the worker's transaction.
create table erp_private.dms_sharepoint_intake_worker_jobs (
  operation_id uuid primary key references erp_private.dms_sharepoint_intake_origins(operation_id),
  upload_session_id bigint not null unique references erp_private.dms_sharepoint_intake_origins(upload_session_id),
  state text not null check (state in ('queued','processing','published_held')),
  completed_upload_at timestamptz not null,
  attempt_id uuid unique,
  claim_lease uuid,
  processing_revision timestamptz,
  check ((state = 'queued' and num_nonnulls(attempt_id,claim_lease,processing_revision) = 0)
    or (state <> 'queued' and num_nonnulls(attempt_id,claim_lease,processing_revision) = 3))
);

create table erp_private.dms_sharepoint_intake_publications (
  operation_id uuid primary key references erp_private.dms_sharepoint_intake_worker_jobs(operation_id),
  upload_session_id bigint not null unique references erp_private.dms_sharepoint_intake_worker_jobs(upload_session_id),
  attempt_id uuid not null unique references erp_private.dms_sharepoint_intake_worker_jobs(attempt_id),
  processing_revision timestamptz not null,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  output jsonb not null,
  output_sha256 text not null check (output_sha256 ~ '^[a-f0-9]{64}$'),
  published_at timestamptz not null default clock_timestamp()
);
alter table erp_private.dms_sharepoint_intake_worker_jobs enable row level security;
alter table erp_private.dms_sharepoint_intake_publications enable row level security;
revoke all on erp_private.dms_sharepoint_intake_worker_jobs, erp_private.dms_sharepoint_intake_publications
  from public, anon, authenticated, service_role, erp_agent_discovery_runtime;

create function erp_private.dms_sharepoint_worker_commit(
  p_connection uuid, p_operation uuid, p_session bigint, p_lease uuid,
  p_command text, p_attempt uuid, p_claim_at timestamptz, p_output jsonb
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  origin erp_private.dms_sharepoint_intake_origins%rowtype;
  payload erp_private.dms_sharepoint_intake_payloads%rowtype;
  job erp_private.dms_sharepoint_intake_worker_jobs%rowtype;
  publication erp_private.dms_sharepoint_intake_publications%rowtype;
  response jsonb;
  staged boolean;
  replayed boolean;
begin
  if p_command is null or p_command not in ('resume','complete','start','publish')
    or (p_command = 'publish' and (p_attempt is null or p_claim_at is null
      or jsonb_typeof(p_output) is distinct from 'object' or octet_length(p_output::text) > 262144))
    or (p_command <> 'publish' and num_nonnulls(p_attempt,p_claim_at,p_output) <> 0) then
    raise exception 'Invalid isolated SharePoint worker command' using errcode = '22023';
  end if;

  -- The database login is connection-scoped and the capability additionally
  -- requires the exact retained operation and the current lease.
  perform 1 from erp_private.agent_connections
  where id = p_connection and runtime_login = session_user for share;
  if not found or not exists (
    select 1 from erp_private.dms_sharepoint_intake_origins
    where operation_id = p_operation and upload_session_id = p_session and connection_id = p_connection
  ) then
    raise exception 'SharePoint runtime connection unavailable' using errcode = '42501';
  end if;
  origin := erp_private.dms_lock_sharepoint_intake(p_operation,p_session,p_lease);

  select * into payload from erp_private.dms_sharepoint_intake_payloads where operation_id = p_operation for share;
  staged := payload.operation_id is not null and payload.lease_token = p_lease
    and payload.upload_session_id = p_session and payload.byte_count = origin.file_size_bytes and payload.sha256 = origin.sha256;
  select * into job from erp_private.dms_sharepoint_intake_worker_jobs where operation_id = p_operation for update;
  perform erp_private.dms_assert_sharepoint_current(p_operation,p_session,p_lease);

  response := jsonb_build_object('operationId',p_operation,'sessionId',p_session);
  if p_command = 'resume' then
    return response || jsonb_build_object('state',coalesce(job.state,'admitted'),'needsStaging',not staged);
  end if;
  if not staged then
    raise exception 'Current SharePoint generation has no matching payload' using errcode = 'PT409';
  end if;
  if p_command = 'complete' then
    if job.operation_id is null then
      insert into erp_private.dms_sharepoint_intake_worker_jobs(operation_id,upload_session_id,state,completed_upload_at)
      values (p_operation,p_session,'queued',clock_timestamp()) returning * into job;
    end if;
    return response || jsonb_build_object('state',job.state,'uploadedAt',job.completed_upload_at);
  end if;
  if job.operation_id is null then
    raise exception 'Isolated SharePoint upload is incomplete' using errcode = 'PT409';
  end if;

  if p_command = 'start' then
    if job.state = 'published_held' then
      return response || jsonb_build_object('state',job.state);
    end if;
    if job.state = 'queued' or job.claim_lease is distinct from p_lease then
      update erp_private.dms_sharepoint_intake_worker_jobs
      set state = 'processing', attempt_id = gen_random_uuid(), claim_lease = p_lease,
        processing_revision = greatest(clock_timestamp(),processing_revision + interval '1 microsecond')
      where operation_id = p_operation returning * into job;
    end if;
    return response || jsonb_build_object('state',job.state,'attemptId',job.attempt_id,
      'processingRevision',job.processing_revision,'payload',replace(encode(payload.payload,'base64'),chr(10),''));
  end if;

  if job.attempt_id is distinct from p_attempt or job.processing_revision is distinct from p_claim_at
    or (job.state = 'processing' and job.claim_lease is distinct from p_lease) then
    raise exception 'SharePoint processing claim changed' using errcode = 'PT409';
  end if;
  select * into publication from erp_private.dms_sharepoint_intake_publications where operation_id = p_operation;
  replayed := found;
  if replayed then
    if job.state is distinct from 'published_held' or publication.output is distinct from p_output
      or publication.attempt_id is distinct from p_attempt or publication.processing_revision is distinct from p_claim_at then
      raise exception 'Retained SharePoint publication differs' using errcode = 'PT409';
    end if;
  elsif job.state = 'processing' then
    update erp_private.dms_sharepoint_intake_worker_jobs
    set state = 'published_held' where operation_id = p_operation returning * into job;
    insert into erp_private.dms_sharepoint_intake_publications(
      operation_id,upload_session_id,attempt_id,processing_revision,source_sha256,output,output_sha256
    ) values (
      p_operation,p_session,p_attempt,p_claim_at,origin.sha256,p_output,encode(sha256(convert_to(p_output::text,'UTF8')),'hex')
    ) returning * into publication;
  else
    raise exception 'SharePoint publication unavailable' using errcode = 'PT409';
  end if;
  return response || jsonb_build_object('state',job.state,'attemptId',publication.attempt_id,
    'processingRevision',publication.processing_revision,'outputSha256',publication.output_sha256,'replayed',replayed);
end $function$;
revoke all on function erp_private.dms_sharepoint_worker_commit(uuid,uuid,bigint,uuid,text,uuid,timestamptz,jsonb)
  from public, anon, authenticated, service_role, erp_agent_discovery_runtime;
grant execute on function erp_private.dms_sharepoint_worker_commit(uuid,uuid,bigint,uuid,text,uuid,timestamptz,jsonb)
  to erp_agent_discovery_runtime;

create function erp_private.dms_reject_ordinary_sharepoint_intake(p_session bigint) returns void
language plpgsql security definer set search_path = ''
as $function$
begin
  if exists (select 1 from erp_private.dms_sharepoint_intake_origins where upload_session_id = p_session) then
    raise exception 'SharePoint upload requires its worker operation' using errcode = '42501';
  end if;
end $function$;
revoke all on function erp_private.dms_reject_ordinary_sharepoint_intake(bigint)
  from public, anon, authenticated, service_role, erp_agent_discovery_runtime;

-- Retain the existing F07 callers and their grants. Only worker-owned
-- temporary verification/acknowledgement is rejected through these paths.
do $patch$
declare
  target regprocedure;
  definition text;
  anchor constant text := E'\nBEGIN\n';
begin
  foreach target in array array[
    'erp_private.f07_temp_source(bigint)'::regprocedure,
    'erp_private.f07_acknowledge_single_upload(jsonb,bigint)'::regprocedure
  ] loop
    select replace(pg_get_functiondef(oid), E'\r\n', E'\n')
    into strict definition from pg_proc where oid = target;
    if array_length(string_to_array(definition,anchor),1) <> 2 then
      raise exception 'Unexpected legacy SharePoint guard target: %', target;
    end if;
    execute replace(definition,anchor,anchor || E' PERFORM erp_private.dms_reject_ordinary_sharepoint_intake(p_session);\n');
  end loop;
end $patch$;

-- Guard the authoritative tables too. A direct writer, an alternate legacy
-- RPC, or a service attestation cannot put the isolated operation into review.
create function erp_private.dms_guard_sharepoint_session() returns trigger
language plpgsql security definer set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' and old.expires_at <= clock_timestamp()
    and new.status in (old.status,'expired') and new.intake_status in (old.intake_status,'expired')
    and (old.temp_cleaned_at is null or new.temp_cleaned_at is not distinct from old.temp_cleaned_at)
    and (old.deleted_at is null or new.deleted_at is not distinct from old.deleted_at)
    and (to_jsonb(old)-array['status','intake_status','temp_cleaned_at','deleted_at','updated_at'])
      = (to_jsonb(new)-array['status','intake_status','temp_cleaned_at','deleted_at','updated_at']) then
    return new;
  end if;
  perform erp_private.dms_reject_ordinary_sharepoint_intake(old.id);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $function$;

create function erp_private.dms_guard_sharepoint_evidence() returns trigger
language plpgsql security definer set search_path = ''
as $function$
begin
  if tg_op <> 'INSERT' then
    perform erp_private.dms_reject_ordinary_sharepoint_intake(old.upload_session_id);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'INSERT' or new.upload_session_id is distinct from old.upload_session_id then
    perform erp_private.dms_reject_ordinary_sharepoint_intake(new.upload_session_id);
  end if;
  return new;
end $function$;
revoke all on function erp_private.dms_guard_sharepoint_session(), erp_private.dms_guard_sharepoint_evidence()
  from public, anon, authenticated, service_role, erp_agent_discovery_runtime;

create trigger dms_guard_sharepoint_session before update or delete on public.dms_upload_sessions
  for each row execute function erp_private.dms_guard_sharepoint_session();

do $evidence$
declare
  target regclass;
begin
  foreach target in array array[
    'erp_private.f07_single_upload_admissions'::regclass,
    'erp_private.f07_verified_temp_uploads'::regclass,
    'erp_private.f07_intake_sources'::regclass,
    'erp_private.f07_intake_analyses'::regclass,
    'public.dms_ai_extraction_jobs'::regclass,
    'public.dms_ai_extraction_results'::regclass,
    'public.dms_review_queue'::regclass
  ] loop
    execute format('create trigger dms_guard_sharepoint_evidence before insert or update or delete on %s
      for each row execute function erp_private.dms_guard_sharepoint_evidence()', target);
  end loop;
end $evidence$;

notify pgrst, 'reload schema';
commit;
